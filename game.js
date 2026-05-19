// Core Game Logic - Updated Version
// Handles: Sub-rounds, Custom Host Rounds, Voting on exit, and Playing Card interfaces

let roomSubscription = null;
let playersSubscription = null;
let stocksSubscription = null;
let portfolioSubscription = null;
let votesSubscription = null;

function initLobby() {
    const createBtn = document.getElementById('create-room-btn');
    const joinBtn = document.getElementById('join-room-btn');
    const roomInput = document.getElementById('room-code-input');

    if (createBtn) createBtn.onclick = openCreateRoomModal;
    if (joinBtn) joinBtn.onclick = () => joinRoom(roomInput.value.toUpperCase());
    
    const urlParams = new URLSearchParams(window.location.search);
    const joinCode = urlParams.get('join');
    if (joinCode) {
        roomInput.value = joinCode;
        joinRoom(joinCode);
    }
}

function openCreateRoomModal() {
    const modal = document.getElementById('create-room-modal');
    if (modal) {
        modal.classList.remove('hidden');
        
        // Setup round selection buttons
        const btns = document.querySelectorAll('.round-option-btn');
        btns.forEach(btn => {
            if (btn.getAttribute('data-rounds') === '3') {
                btn.classList.add('bg-primary', 'border-primary');
                btn.classList.remove('bg-white/5', 'border-white/5');
            } else {
                btn.classList.remove('bg-primary', 'border-primary');
                btn.classList.add('bg-white/5', 'border-white/5');
            }
            
            btn.onclick = () => {
                btns.forEach(b => {
                    b.classList.remove('bg-primary', 'border-primary');
                    b.classList.add('bg-white/5', 'border-white/5');
                });
                btn.classList.add('bg-primary', 'border-primary');
                btn.classList.remove('bg-white/5', 'border-white/5');
                gameData.selectedRounds = parseInt(btn.getAttribute('data-rounds'));
            };
        });
        
        gameData.selectedRounds = 3; // Default selection
        
        document.getElementById('confirm-create-room-btn').onclick = async () => {
            modal.classList.add('hidden');
            await createRoom();
        };
        
        document.getElementById('close-create-modal').onclick = () => {
            modal.classList.add('hidden');
        };
    }
}

async function createRoom() {
    if (!gameData.user || !gameData.user.id) {
        return showToast('Session Error: Please logout and login again.', 'error');
    }

    // Ensure the profile exists in the database
    const { error: profileError } = await sb.from('profiles').upsert([{ id: gameData.user.id, username: gameData.user.username }], { onConflict: 'id' });
    if (profileError) {
        console.error('Profile upsert error in createRoom:', profileError);
        if (profileError.code === '23503') {
            localStorage.removeItem('game_user');
            showToast('Stale session detected (database reset). Refreshing...', 'error');
            setTimeout(() => location.reload(), 1500);
            return;
        }
        return showToast(`Profile Sync Error: ${profileError.message}`, 'error');
    }

    const roomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    const maxRounds = gameData.selectedRounds || 3;
    
    const { data: room, error } = await sb.from('rooms').insert([{ 
        room_code: roomCode, 
        host_id: gameData.user.id, 
        status: 'lobby',
        max_rounds: maxRounds,
        current_sub_round: 1
    }]).select().single();

    if (error) {
        console.error('Room creation error:', error);
        return showToast(`Failed to create room: ${error.message}`, 'error');
    }
    
    setupRoom(room, true);
}

async function joinRoom(code) {
    if (!code) return showToast('Enter a room code', 'error');
    const { data: room, error } = await sb.from('rooms').select('*').eq('room_code', code).single();
    if (error || !room) return showToast('Room not found', 'error');
    setupRoom(room, room.host_id === gameData.user.id);
}

async function setupRoom(room, isHost) {
    gameData.room = room;
    gameData.isHost = isHost;
    
    const codeEl = document.getElementById('current-room-code');
    if (codeEl) codeEl.innerText = room.room_code;
    
    ui.screens.lobby.classList.add('hidden');
    ui.screens.waiting.classList.remove('hidden');

    if (isHost) {
        const startBtn = document.getElementById('start-game-btn');
        if (startBtn) {
            startBtn.classList.remove('hidden');
            startBtn.onclick = startGame;
        }
    }

    // Ensure profile exists
    const { error: profileSyncError } = await sb.from('profiles').upsert([{ id: gameData.user.id, username: gameData.user.username }], { onConflict: 'id' });
    if (profileSyncError) {
        console.error('setupRoom profile sync error:', profileSyncError);
        if (profileSyncError.code === '23503') {
            localStorage.removeItem('game_user');
            showToast('Stale session detected (database reset). Refreshing...', 'error');
            setTimeout(() => location.reload(), 1500);
            return;
        }
    }

    // Ensure player record exists
    const { error: upsertError } = await sb.from('players').upsert([{ 
        room_id: room.id, 
        user_id: gameData.user.id, 
        is_ready: true,
        cash: 1000000
    }], { onConflict: 'room_id,user_id' });

    if (upsertError) {
        console.error('Player Join Error:', upsertError);
        showToast(`Database Error (Player Join): ${upsertError.message}`, 'error');
    }

    subscribeToRoom(room.id);
    await fetchPlayers(room.id);
    
    if (room.status === 'playing') {
        enterGame();
    }
    
    const leaveRoomBtn = document.getElementById('leave-room-btn');
    if (leaveRoomBtn) {
        leaveRoomBtn.onclick = async () => {
            if (!confirm('Leave this room?')) return;
            leaveRoomBtn.innerText = 'LEAVING...';
            leaveRoomBtn.disabled = true;
            try {
                if (gameData.player) await sb.from('players').delete().eq('id', gameData.player.id);
            } catch (e) {
                console.error('Exit error:', e);
            }
            location.reload();
        };
    }
    
    const copyBtn = document.getElementById('copy-link-btn');
    if (copyBtn) {
        copyBtn.onclick = () => {
            const link = `${window.location.origin}${window.location.pathname}?join=${room.room_code}`;
            navigator.clipboard.writeText(link);
            showToast('Join link copied!');
        };
    }
}

function subscribeToRoom(roomId) {
    if (roomSubscription) roomSubscription.unsubscribe();
    roomSubscription = sb.channel(`room:${roomId}`).on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` }, 
        payload => {
            const isRoundOrSubRoundChanged = gameData.room && (
                payload.new.round_number !== gameData.room.round_number || 
                payload.new.current_sub_round !== gameData.room.current_sub_round
            );
            
            gameData.room = payload.new;
            
            if (payload.new.status === 'playing' && ui.screens.game.classList.contains('hidden')) enterGame();
            if (payload.new.status === 'finished') endGame();
            
            if (isRoundOrSubRoundChanged) {
                gameData.hasTradedThisRound = false;
                fetchHand();
            }
            
            // Check host round decision modal triggers
            const hostModal = document.getElementById('host-continue-modal');
            const playerModal = document.getElementById('player-waiting-continue-modal');
            
            if (payload.new.current_turn_index === -1) {
                if (gameData.isHost) {
                    if (hostModal) hostModal.classList.remove('hidden');
                    if (playerModal) playerModal.classList.add('hidden');
                } else {
                    if (hostModal) hostModal.classList.add('hidden');
                    if (playerModal) playerModal.classList.remove('hidden');
                }
            } else {
                if (hostModal) hostModal.classList.add('hidden');
                if (playerModal) playerModal.classList.add('hidden');
            }
            
            // Check leaving player triggers
            if (payload.new.leaving_player_id) {
                const isMeLeaving = gameData.player && payload.new.leaving_player_id === gameData.player.id;
                if (!isMeLeaving) {
                    const voteModal = document.getElementById('vote-modal');
                    if (voteModal && voteModal.classList.contains('hidden')) {
                        const leavingP = gameData.players.find(p => p.id === payload.new.leaving_player_id);
                        const nameEl = document.getElementById('leaving-player-name');
                        if (nameEl && leavingP) nameEl.innerText = leavingP.profiles?.username || 'Player';
                        
                        voteModal.classList.remove('hidden');
                        document.getElementById('vote-distribute-btn').disabled = false;
                        document.getElementById('vote-discard-btn').disabled = false;
                        document.getElementById('vote-voted-msg').classList.add('hidden');
                        
                        subscribeToVotes(roomId);
                        fetchRoomVotes();
                    }
                }
            } else {
                const voteModal = document.getElementById('vote-modal');
                if (voteModal && !voteModal.classList.contains('hidden')) {
                    voteModal.classList.add('hidden');
                    if (votesSubscription) votesSubscription.unsubscribe();
                }
            }
            
            updateTurnUI();
        }).subscribe();

    if (playersSubscription) playersSubscription.unsubscribe();
    playersSubscription = sb.channel(`players:${roomId}`).on('postgres_changes', { event: '*', schema: 'public', table: 'players', filter: `room_id=eq.${roomId}` }, 
        () => fetchPlayers(roomId)).subscribe();
}

async function fetchPlayers(roomId) {
    const { data: players, error } = await sb.from('players').select('*, profiles(username)').eq('room_id', roomId).order('created_at');
    if (error) return console.error('Fetch players error:', error);
    
    gameData.players = players;
    gameData.player = players.find(p => p.user_id === gameData.user.id);
    
    // Check if player has been deleted (meaning they completed leaving successfully)
    if (gameData.room && gameData.room.status === 'playing' && !gameData.player) {
        showToast("You have left the match.", "info");
        setTimeout(() => {
            location.reload();
        }, 1500);
        return;
    }
    
    renderPlayerList();
    if (gameData.room && gameData.room.status === 'playing') {
        renderPawns();
        updatePlayerStats();
        updateTurnUI();
    }
}

function renderPlayerList() {
    const list = document.getElementById('player-list');
    const count = document.getElementById('player-count');
    const startBtn = document.getElementById('start-game-btn');

    if (list) {
        list.innerHTML = gameData.players.map(p => `
            <div class="flex items-center gap-3 bg-white/5 p-3 rounded-2xl border border-white/5">
                <div class="w-10 h-10 bg-primary/20 rounded-xl flex items-center justify-center font-bold text-primary">${p.profiles?.username?.[0] || 'P'}</div>
                <div class="text-left"><p class="font-bold">${p.profiles?.username || 'Player'}</p><p class="text-[10px] text-white/40 uppercase">Trader</p></div>
            </div>
        `).join('');
    }
    if (count) count.innerText = gameData.players.length;
    if (startBtn) startBtn.disabled = gameData.players.length < 1;
}

async function startGame() {
    if (!gameData.isHost) return;
    
    const stocksToCreate = COMPANIES.map(c => ({
        room_id: gameData.room.id,
        name: c.name,
        symbol: c.symbol,
        base_price: c.basePrice,
        current_price: c.basePrice,
        volatility: c.volatility || 'MED',
        last_change: 0
    }));

    const { error: stockError } = await sb.from('stocks').insert(stocksToCreate);
    if (stockError) return alert('Market Initialization Failed: ' + stockError.message);

    const { data: insertedStocks } = await sb.from('stocks').select('id, name').eq('room_id', gameData.room.id);
    
    const cardValues = [-20, -15, -10, -5, 5, 10, 15, 20];
    let allCards = [];
    
    if (insertedStocks) {
        insertedStocks.forEach(stock => {
            for(let i=0; i<5; i++) {
                cardValues.forEach(val => {
                    allCards.push({
                        room_id: gameData.room.id,
                        stock_id: stock.id,
                        fluctuation_value: val,
                        status: 'deck'
                    });
                });
            }
        });
        
        allCards.sort(() => Math.random() - 0.5);
        
        // Deal exactly 10 cards to each player: all 7 stocks get exactly 1 hint, except exactly 3 selected stocks which get 2 hints
        gameData.players.forEach(player => {
            const playerStocks = [...insertedStocks];
            playerStocks.sort(() => Math.random() - 0.5);
            
            const targets = {};
            playerStocks.forEach((stock, idx) => {
                targets[stock.id] = (idx < 3) ? 2 : 1;
            });
            
            playerStocks.forEach(stock => {
                const target = targets[stock.id];
                let dealt = 0;
                for (let i = 0; i < allCards.length; i++) {
                    if (dealt === target) break;
                    const card = allCards[i];
                    if (card.status === 'deck' && card.stock_id === stock.id && !card.player_id) {
                        card.player_id = player.id;
                        card.status = 'hand';
                        dealt++;
                    }
                }
            });
        });
        
        const { error: cardsError } = await sb.from('room_cards').insert(allCards);
        if (cardsError) console.error("Error creating cards:", cardsError);
    }

    await sb.from('rooms').update({ 
        status: 'playing', 
        current_turn_index: 0,
        round_number: 1,
        current_sub_round: 1
    }).eq('id', gameData.room.id);
}

function enterGame() {
    ui.screens.waiting.classList.add('hidden');
    ui.screens.game.classList.remove('hidden');
    
    fetchPlayers(gameData.room.id);
    
    renderBoard();
    fetchStocks();
    fetchPortfolio();
    fetchHand();
    
    if (stocksSubscription) stocksSubscription.unsubscribe();
    stocksSubscription = sb.channel(`stocks:${gameData.room.id}`).on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'stocks', filter: `room_id=eq.${gameData.room.id}` }, 
        () => fetchStocks()).subscribe();

    const endTurnBtn = document.getElementById('end-turn-btn');
    const leaveBtn = document.getElementById('leave-game-btn');
    const mobileLeaveBtn = document.getElementById('mobile-leave-btn');
    
    const mobilePortBtn = document.getElementById('mobile-portfolio-btn');
    const mobileMarkBtn = document.getElementById('mobile-market-btn');

    if (endTurnBtn) endTurnBtn.onclick = () => endTurn();
    if (leaveBtn) leaveBtn.onclick = initiateLeaveMatch;
    if (mobileLeaveBtn) mobileLeaveBtn.onclick = initiateLeaveMatch;
    
    if (mobilePortBtn) {
        mobilePortBtn.onclick = () => {
            ui.game.mobilePortfolioPanel.classList.remove('hidden');
        };
    }
    
    if (mobileMarkBtn) {
        mobileMarkBtn.onclick = () => {
            ui.game.mobileMarketPanel.classList.remove('hidden');
        };
    }

    // Connect voting buttons
    const voteDistBtn = document.getElementById('vote-distribute-btn');
    const voteDiscBtn = document.getElementById('vote-discard-btn');
    if (voteDistBtn) voteDistBtn.onclick = () => castLeaveVote('distribute');
    if (voteDiscBtn) voteDiscBtn.onclick = () => castLeaveVote('discard');

    // Bind host continuation buttons
    const hostContBtn = document.getElementById('host-continue-play-btn');
    const hostStopBtn = document.getElementById('host-stop-play-btn');
    
    if (hostContBtn) {
        hostContBtn.onclick = async () => {
            hostContBtn.disabled = true;
            hostContBtn.innerText = 'CONTINUING...';
            
            const newMaxRounds = (gameData.room.max_rounds || 3) + 1;
            
            // 1. Fluctuate market for the completed round
            await fluctuateMarket();
            // 2. Redistribute new cards
            await redistributeCards();
            
            // 3. Update room to next round state
            const { error } = await sb.from('rooms').update({ 
                max_rounds: newMaxRounds,
                round_number: gameData.room.round_number + 1,
                current_sub_round: 1,
                current_turn_index: 0
            }).eq('id', gameData.room.id);
            
            if (error) console.error("Error extending match:", error);
            
            hostContBtn.disabled = false;
            hostContBtn.innerText = 'Continue Playing';
        };
    }
    
    if (hostStopBtn) {
        hostStopBtn.onclick = async () => {
            hostStopBtn.disabled = true;
            hostStopBtn.innerText = 'FINISHING...';
            
            await fluctuateMarket();
            await endGame();
            
            hostStopBtn.disabled = false;
            hostStopBtn.innerText = 'Stop & Finish';
        };
    }

    if (ui.modals.closeBtns) {
        ui.modals.closeBtns.forEach(btn => {
            btn.onclick = () => {
                ui.modals.overlay.classList.add('hidden');
                ui.modals.trade.classList.add('hidden');
                ui.modals.card.classList.add('hidden');
                if (ui.game.mobileMarketPanel) ui.game.mobileMarketPanel.classList.add('hidden');
                if (ui.game.mobilePortfolioPanel) ui.game.mobilePortfolioPanel.classList.add('hidden');
            };
        });
    }
    
    fetchStocks();
    fetchPortfolio();
    fetchHand();
    updateTurnUI();
}

function renderCentralMarket() {
    const list = document.getElementById('central-market-list');
    if (!list) return;
    
    list.innerHTML = gameData.stocks.map(stock => {
        const change = stock.last_change || 0;
        const isUp = change >= 0;
        const company = COMPANIES.find(c => c.name === stock.name) || { color: '#6366f1', symbol: stock.symbol, sector: 'Energy' };
        const brandColor = company.color;
        const changePercent = stock.current_price - change > 0 ? ((Math.abs(change) / (stock.current_price - change)) * 100).toFixed(1) : '0.0';
        
        return `
            <div onclick="openTradeModal('${stock.name}')" 
                class="playing-card relative overflow-hidden flex flex-col justify-between p-6 rounded-3xl border-2 border-white/5 transition-all duration-300 cursor-pointer h-64 select-none group"
                style="--stock-brand: ${brandColor};">
                
                <!-- Brand Ambient Glow watermark -->
                <div class="absolute -top-16 -right-16 w-36 h-36 rounded-full blur-3xl opacity-25 group-hover:opacity-45 transition-opacity" style="background-color: ${brandColor};"></div>
                <div class="absolute -bottom-8 -left-8 text-7xl font-black text-white/[0.02] group-hover:text-white/[0.04] select-none transition-colors tracking-tighter uppercase font-sans">
                    ${stock.symbol}
                </div>

                <!-- Card Header -->
                <div class="flex justify-between items-start z-10">
                    <div class="flex flex-col">
                        <span class="text-[9px] font-bold text-white/40 uppercase tracking-widest">${company.sector}</span>
                        <span class="text-2xl font-black tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-white/70 group-hover:from-white group-hover:to-white/95">
                            ${stock.symbol}
                        </span>
                    </div>
                    <span class="px-2.5 py-1 text-[8px] font-black uppercase tracking-widest rounded-lg border border-white/10 bg-white/5 text-white/60">
                        ${stock.volatility} VOL
                    </span>
                </div>

                <!-- Price/Trend Display -->
                <div class="my-auto z-10 flex justify-between items-center w-full">
                    <div>
                        <p class="text-3xl font-black text-white tracking-tight group-hover:scale-[1.03] origin-left transition-transform tabular-nums">
                            ${formatCurrency(stock.current_price)}
                        </p>
                        <p class="text-xs font-bold ${isUp ? 'text-bull' : 'text-bear'} mt-1 flex items-center gap-1">
                            <span class="inline-block transition-transform duration-300 group-hover:translate-y-[-2px]">${isUp ? '▲' : '▼'}</span>
                            <span>${formatCurrency(Math.abs(change))} (${isUp ? '+' : '-'}${changePercent}%)</span>
                        </p>
                    </div>
                </div>

                <!-- Card Footer Info -->
                <div class="border-t border-white/5 pt-3 mt-2 flex justify-between items-center z-10">
                    <span class="text-xs font-semibold text-white/60 truncate max-w-[80%]">${stock.name}</span>
                    <span class="w-6 h-6 bg-white/5 group-hover:bg-primary/20 rounded-full flex items-center justify-center text-[10px] text-white/40 group-hover:text-primary transition-all">
                        🎴
                    </span>
                </div>
            </div>
        `;
    }).join('');
}

async function endTurn() {
    const endBtn = document.getElementById('end-turn-btn');
    if (endBtn) {
        endBtn.disabled = true;
        endBtn.innerText = 'PROCESSING...';
    }

    // 1. Automatically submit any cards remaining in hand to avoid player friction
    if (gameData.hand && gameData.hand.length > 0) {
        const handCardIds = gameData.hand.map(c => c.id);
        const { error: submitError } = await sb.from('room_cards').update({ status: 'submitted' }).in('id', handCardIds);
        if (submitError) console.error("Error auto-submitting hand cards:", submitError);
    }

    const isLastPlayer = gameData.room.current_turn_index === (gameData.players.length - 1);
    
    if (isLastPlayer) {
        // Complete current sub-round
        const currentSubRound = gameData.room.current_sub_round || 1;
        
        if (currentSubRound < 3) {
            const nextSub = currentSubRound + 1;
            await sb.from('rooms').update({ 
                current_sub_round: nextSub,
                current_turn_index: 0
            }).eq('id', gameData.room.id);
            addLog(`Sub Round ${currentSubRound} Completed! Advancing to Sub Round ${nextSub}.`);
        } else {
            // Completed 3 sub-rounds, which completes 1 full round!
            const currentRound = gameData.room.round_number || 1;
            const maxRounds = gameData.room.max_rounds || 3;
            
            if (currentRound >= maxRounds) {
                addLog("Final Round Complete! Waiting for Host round continuation decision...");
                await sb.from('rooms').update({ current_turn_index: -1 }).eq('id', gameData.room.id);
                return;
            }

            addLog(`Round ${currentRound} Complete! Fluctuation Phase Initiated.`);
            await fluctuateMarket();
            await redistributeCards();
            
            await sb.from('rooms').update({ 
                current_turn_index: 0,
                round_number: currentRound + 1,
                current_sub_round: 1
            }).eq('id', gameData.room.id);
        }
    } else {
        await nextTurn();
    }
}

async function redistributeCards() {
    // Delete any lingering hand cards for players to clean active hand lists
    await sb.from('room_cards').delete().eq('room_id', gameData.room.id).eq('status', 'hand');

    const { data: deckCards } = await sb.from('room_cards').select('id, stock_id').eq('room_id', gameData.room.id).eq('status', 'deck');
    if (!deckCards || deckCards.length === 0) return;

    deckCards.sort(() => Math.random() - 0.5);

    const updates = [];
    
    // Assign exactly 10 cards to each player: all 7 stocks get exactly 1 hint, except exactly 3 selected stocks which get 2 hints
    gameData.players.forEach(player => {
        const playerStocks = [...gameData.stocks];
        playerStocks.sort(() => Math.random() - 0.5);
        
        const targets = {};
        playerStocks.forEach((stock, idx) => {
            targets[stock.id] = (idx < 3) ? 2 : 1;
        });
        
        playerStocks.forEach(stock => {
            const target = targets[stock.id];
            let dealt = 0;
            for (let i = 0; i < deckCards.length; i++) {
                if (dealt === target) break;
                const card = deckCards[i];
                if (!card.assigned && card.stock_id === stock.id) {
                    card.assigned = true;
                    updates.push({
                        id: card.id,
                        player_id: player.id,
                        status: 'hand'
                    });
                    dealt++;
                }
            }
        });
    });

    if (updates.length > 0) {
        for (const update of updates) {
            await sb.from('room_cards').update({ player_id: update.player_id, status: 'hand' }).eq('id', update.id);
        }
    }
    
    await fetchHand();
}

async function endGame() {
    const { data: players } = await sb.from('players').select('*, portfolios(quantity, stocks(current_price)), profiles(username)').eq('room_id', gameData.room.id);
    
    const leaderboard = players.map(p => {
        const stockValue = p.portfolios?.reduce((sum, item) => sum + (item.quantity * item.stocks.current_price), 0) || 0;
        return {
            username: p.profiles?.username || 'Trader',
            total: p.cash + stockValue
        };
    }).sort((a, b) => b.total - a.total);

    await sb.from('rooms').update({ status: 'finished' }).eq('id', gameData.room.id);
    
    const list = document.getElementById('leaderboard-list');
    if (list) {
        list.innerHTML = leaderboard.map((p, index) => {
            const rank = index + 1;
            const icon = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`;
            const color = rank === 1 ? 'text-yellow-400' : rank === 2 ? 'text-gray-400' : rank === 3 ? 'text-orange-400' : 'text-white/40';
            
            return `
                <div class="flex items-center justify-between p-5 bg-white/5 rounded-2xl border border-white/5 ${rank === 1 ? 'border-yellow-500/30' : ''}">
                    <div class="flex items-center gap-4">
                        <span class="text-2xl ${color} font-black w-8 text-center">${icon}</span>
                        <div>
                            <p class="font-black text-white">${p.username.toUpperCase()}</p>
                            <p class="text-[10px] text-white/40 uppercase tracking-widest font-bold">Total Wealth</p>
                        </div>
                    </div>
                    <div class="text-right">
                        <p class="text-xl font-black ${rank === 1 ? 'text-bull' : 'text-white'}">${formatCurrency(p.total)}</p>
                    </div>
                </div>
            `;
        }).join('');
    }

    ui.modals.overlay.classList.remove('hidden');
    document.getElementById('leaderboard-modal').classList.remove('hidden');
    ui.modals.trade.classList.add('hidden');
    ui.modals.card.classList.add('hidden');
}

async function fluctuateMarket() {
    const { data: submittedCards } = await sb.from('room_cards').select('*').eq('room_id', gameData.room.id).eq('status', 'submitted');
    
    const fluctuations = {};
    if (submittedCards) {
        submittedCards.forEach(c => {
            fluctuations[c.stock_id] = (fluctuations[c.stock_id] || 0) + c.fluctuation_value;
        });
    }

    for (const stock of gameData.stocks) {
        const changePercent = (fluctuations[stock.id] || 0) / 100;
        const changeAmount = Math.round(stock.current_price * changePercent);
        const newPrice = Math.max(10, stock.current_price + changeAmount);
        
        await sb.from('stocks').update({ 
            current_price: newPrice,
            last_change: changeAmount
        }).eq('id', stock.id);
    }
    
    if (submittedCards && submittedCards.length > 0) {
        const idsToDelete = submittedCards.map(c => c.id);
        await sb.from('room_cards').delete().in('id', idsToDelete);
    }
}

async function nextTurn() {
    if (!gameData.players || gameData.players.length <= 1) {
        await fetchPlayers(gameData.room.id);
    }
    if (gameData.players.length === 0) return;
    
    const nextIndex = (gameData.room.current_turn_index + 1) % gameData.players.length;
    await sb.from('rooms').update({ current_turn_index: nextIndex }).eq('id', gameData.room.id);
}

async function fetchStocks() {
    if (!gameData.room) return;
    const { data: stocks, error } = await sb.from('stocks').select('*').eq('room_id', gameData.room.id).order('name');
    
    if (error) {
        console.error('Fetch stocks error:', error);
        return;
    }
    
    if (!stocks || stocks.length === 0) {
        if (gameData.isHost && gameData.room.status === 'playing') {
            await startGame();
        }
        return;
    }

    gameData.stocks = stocks;
    renderMarket();
}

async function initiateLeaveMatch() {
    if (!gameData.player) return;
    
    if (gameData.room.status === 'lobby' || gameData.room.status === 'waiting') {
        try {
            await sb.from('players').delete().eq('id', gameData.player.id);
        } catch(e) {}
        location.reload();
        return;
    }
    
    // Open the premium custom confirmation wizard modal
    const modal = document.getElementById('leave-confirm-modal');
    if (modal) {
        modal.classList.remove('hidden');
        
        // Bind the abandon button to execute the actual database exit logic
        document.getElementById('confirm-abandon-btn').onclick = async () => {
            modal.classList.add('hidden');
            
            const { error } = await sb.from('rooms').update({
                leaving_player_id: gameData.player.id,
                vote_distribution_type: 'active'
            }).eq('id', gameData.room.id);
            
            if (error) {
                showToast("Error initiating exit: " + error.message, "error");
            } else {
                showToast("Exit initiated. Awaiting player votes...", "info");
            }
        };
        
        // Bind the cancel button to simply hide the modal
        document.getElementById('cancel-abandon-btn').onclick = () => {
            modal.classList.add('hidden');
        };
    }
}

async function leaveMatch() {
    await initiateLeaveMatch();
}

async function castLeaveVote(voteType) {
    if (!gameData.player || !gameData.room || !gameData.room.leaving_player_id) return;
    
    document.getElementById('vote-distribute-btn').disabled = true;
    document.getElementById('vote-discard-btn').disabled = true;
    document.getElementById('vote-voted-msg').classList.remove('hidden');
    
    const { error } = await sb.from('room_votes').upsert([{
        room_id: gameData.room.id,
        leaving_player_id: gameData.room.leaving_player_id,
        voter_id: gameData.player.id,
        vote: voteType
    }], { onConflict: 'room_id,leaving_player_id,voter_id' });
    
    if (error) {
        console.error("Error casting vote:", error);
        showToast("Vote failed: " + error.message, "error");
        document.getElementById('vote-distribute-btn').disabled = false;
        document.getElementById('vote-discard-btn').disabled = false;
        document.getElementById('vote-voted-msg').classList.add('hidden');
    } else {
        showToast(`Cast vote: ${voteType.toUpperCase()}`);
    }
}

function subscribeToVotes(roomId) {
    if (votesSubscription) votesSubscription.unsubscribe();
    votesSubscription = sb.channel(`votes:${roomId}`).on('postgres_changes', { event: '*', schema: 'public', table: 'room_votes', filter: `room_id=eq.${roomId}` }, 
        () => fetchRoomVotes()).subscribe();
}

async function fetchRoomVotes() {
    if (!gameData.room || !gameData.room.leaving_player_id) return;
    
    const { data: votes, error } = await sb.from('room_votes')
        .select('*')
        .eq('room_id', gameData.room.id)
        .eq('leaving_player_id', gameData.room.leaving_player_id);
        
    if (error) return console.error('Fetch votes error:', error);
    
    const distCount = votes.filter(v => v.vote === 'distribute').length;
    const discCount = votes.filter(v => v.vote === 'discard').length;
    const totalCast = votes.length;
    
    const votingPlayers = gameData.players.filter(p => p.id !== gameData.room.leaving_player_id);
    const totalVoters = votingPlayers.length;
    
    const distEl = document.getElementById('vote-dist-count');
    const discEl = document.getElementById('vote-disc-count');
    const castEl = document.getElementById('vote-total-cast');
    const votersEl = document.getElementById('vote-total-voters');
    
    if (distEl) distEl.innerText = distCount;
    if (discEl) discEl.innerText = discCount;
    if (castEl) castEl.innerText = totalCast;
    if (votersEl) votersEl.innerText = totalVoters;
    
    const distProg = document.getElementById('vote-dist-progress');
    const discProg = document.getElementById('vote-disc-progress');
    if (distProg) distProg.style.width = `${(distCount / (totalVoters || 1)) * 100}%`;
    if (discProg) discProg.style.width = `${(discCount / (totalVoters || 1)) * 100}%`;
    
    const requiredVotes = Math.ceil(totalVoters * 0.75);
    const isDistributeWinner = distCount >= requiredVotes;
    const isDiscardWinner = discCount > (totalVoters - requiredVotes) || (totalCast === totalVoters && distCount < requiredVotes);
    
    if (isDistributeWinner || isDiscardWinner) {
        const isResolver = gameData.isHost || (gameData.player && gameData.player.id === votingPlayers[0]?.id);
        if (isResolver) {
            await resolveLeaveVote(isDistributeWinner ? 'distribute' : 'discard');
        }
    }
}

async function resolveLeaveVote(decision) {
    if (!gameData.room || !gameData.room.leaving_player_id) return;
    
    const leavingPlayerId = gameData.room.leaving_player_id;
    
    const { data: leavingPlayer } = await sb.from('players').select('*, portfolios(quantity, stocks(current_price)), profiles(username)').eq('id', leavingPlayerId).single();
    
    if (leavingPlayer) {
        const stockValue = leavingPlayer.portfolios?.reduce((sum, p) => sum + (p.quantity * p.stocks.current_price), 0) || 0;
        const totalWealth = leavingPlayer.cash + stockValue;
        
        const remainingPlayers = gameData.players.filter(p => p.id !== leavingPlayerId);
        
        if (decision === 'distribute' && remainingPlayers.length > 0) {
            const inheritance = Math.floor(totalWealth / remainingPlayers.length);
            for (const p of remainingPlayers) {
                await sb.from('players').update({ cash: p.cash + inheritance }).eq('id', p.id);
            }
            addLog(`${leavingPlayer.profiles?.username || 'Player'} left. Wealth of ${formatCurrency(totalWealth)} was DISTRIBUTED! Each got ${formatCurrency(inheritance)}.`);
        } else {
            addLog(`${leavingPlayer.profiles?.username || 'Player'} left. Wealth of ${formatCurrency(totalWealth)} was DISCARDED.`);
        }
        
        await sb.from('portfolios').delete().eq('player_id', leavingPlayerId);
        await sb.from('players').delete().eq('id', leavingPlayerId);
        
        if (gameData.room.host_id === leavingPlayer.user_id && remainingPlayers.length > 0) {
            await sb.from('rooms').update({ 
                host_id: remainingPlayers[0].user_id,
                leaving_player_id: null,
                vote_distribution_type: 'none'
            }).eq('id', gameData.room.id);
        } else {
            await sb.from('rooms').update({ 
                leaving_player_id: null,
                vote_distribution_type: 'none'
            }).eq('id', gameData.room.id);
        }
        
        await sb.from('room_votes').delete().eq('room_id', gameData.room.id);
    }
}

function updateTurnUI() {
    if (!gameData.players || gameData.players.length === 0) return;
    const currentIndex = gameData.room.current_turn_index;
    
    const roundDisplay = document.getElementById('round-display');
    const subRoundEl = document.getElementById('sub-round-display');
    const turnIndicator = document.getElementById('turn-indicator-text');
    const endBtn = document.getElementById('end-turn-btn');

    if (roundDisplay) roundDisplay.innerText = `${gameData.room.round_number || 1} / ${gameData.room.max_rounds || 3}`;
    if (subRoundEl) subRoundEl.innerText = `${gameData.room.current_sub_round || 1} / 3`;

    if (currentIndex === -1) {
        if (turnIndicator) {
            turnIndicator.innerText = "WAITING FOR HOST DECISION...";
            turnIndicator.className = "text-sm font-bold text-accent animate-pulse";
        }
        if (endBtn) {
            endBtn.disabled = true;
            endBtn.innerText = "WAITING...";
            endBtn.classList.add('opacity-50', 'cursor-not-allowed');
            endBtn.classList.remove('hover:bg-secondary');
        }
        return;
    }

    const currentPlayer = gameData.players[currentIndex || 0];
    const isMyTurn = currentPlayer?.user_id === gameData.user.id;

    if (turnIndicator) {
        turnIndicator.innerText = isMyTurn ? 'IT IS YOUR TURN TO TRADE' : `WAITING FOR ${currentPlayer?.profiles?.username?.toUpperCase() || 'PLAYER'}...`;
        turnIndicator.className = isMyTurn ? 'text-sm font-bold text-bull animate-pulse' : 'text-sm font-bold text-white/40';
    }

    if (endBtn) {
        if (isMyTurn) {
            endBtn.disabled = false;
            endBtn.innerText = 'FINISH TRADING';
            endBtn.classList.remove('opacity-50', 'cursor-not-allowed');
            endBtn.classList.add('hover:bg-secondary');
        } else {
            endBtn.disabled = true;
            endBtn.innerText = 'WAITING...';
            endBtn.classList.add('opacity-50', 'cursor-not-allowed');
        }
    }
}

async function updateCash(amount) {
    if (!gameData.player) return;
    const newCash = Math.max(0, gameData.player.cash + amount);
    gameData.player.cash = newCash;
    await sb.from('players').update({ cash: newCash }).eq('id', gameData.player.id);
    updatePlayerStats();
}

function openTradeModal(companyName) {
    if (gameData.hasTradedThisRound) {
        return showToast("You have already traded this round!");
    }
    
    const stock = gameData.stocks.find(s => s.name === companyName);
    if (!stock) return;

    const owned = gameData.portfolio?.find(p => p.stock_id === stock.id);
    const ownedQty = owned?.quantity || 0;
    const avgPrice = owned?.average_buy_price || 0;
    
    document.getElementById('trade-stock-name').innerText = stock.symbol;
    document.getElementById('trade-stock-price').innerText = formatCurrency(stock.current_price);
    document.getElementById('trade-user-holding').innerText = ownedQty;
    document.getElementById('trade-user-avg').innerText = formatCurrency(avgPrice);
    
    const qtyInput = document.getElementById('trade-qty');
    const totalEl = document.getElementById('trade-total');
    
    qtyInput.value = 1;
    totalEl.innerText = formatCurrency(stock.current_price);

    qtyInput.oninput = () => {
        const qty = parseInt(qtyInput.value) || 0;
        totalEl.innerText = formatCurrency(qty * stock.current_price);
    };

    document.getElementById('qty-plus').onclick = () => {
        qtyInput.value = (parseInt(qtyInput.value) || 0) + 1;
        qtyInput.oninput();
    };
    document.getElementById('qty-minus').onclick = () => {
        qtyInput.value = Math.max(1, (parseInt(qtyInput.value) || 0) - 1);
        qtyInput.oninput();
    };

    document.getElementById('buy-btn').onclick = () => executeTrade(stock, parseInt(qtyInput.value), 'buy');
    document.getElementById('sell-btn').onclick = () => executeTrade(stock, parseInt(qtyInput.value), 'sell');

    ui.modals.overlay.classList.remove('hidden');
    ui.modals.trade.classList.remove('hidden');
}

async function executeTrade(stock, quantity, type) {
    if (!quantity || quantity <= 0) return showToast('Enter valid quantity', 'error');
    
    const cost = stock.current_price * quantity;
    
    if (type === 'buy') {
        if (gameData.player.cash < cost) return showToast('Not enough cash!', 'error');
        await updateCash(-cost);
        
        const existing = gameData.portfolio?.find(p => p.stock_id === stock.id);
        if (existing) {
            const newQty = (existing.quantity || 0) + quantity;
            const newAvg = (((existing.quantity || 0) * (existing.average_buy_price || 0)) + cost) / (newQty || 1);
            await sb.from('portfolios').update({ quantity: newQty, average_buy_price: Math.round(newAvg) }).eq('id', existing.id);
        } else {
            await sb.from('portfolios').insert([{ player_id: gameData.player.id, stock_id: stock.id, quantity, average_buy_price: stock.current_price }]);
        }
        showToast(`Bought ${quantity} shares of ${stock.symbol}`);
    } else {
        const currentNetWorth = (gameData.player.cash || 0) + (gameData.portfolio?.reduce((sum, p) => sum + (p.quantity * p.stocks.current_price), 0) || 0);
        if (cost > currentNetWorth) return showToast('Margin Limit! Cannot short more than Net Worth.', 'error');

        await updateCash(cost);
        const existing = gameData.portfolio?.find(p => p.stock_id === stock.id);
        
        if (existing) {
            const newQty = (existing.quantity || 0) - quantity;
            await sb.from('portfolios').update({ quantity: newQty }).eq('id', existing.id);
        } else {
            await sb.from('portfolios').insert([{ player_id: gameData.player.id, stock_id: stock.id, quantity: -quantity, average_buy_price: stock.current_price }]);
        }
        showToast(`Sold ${quantity} shares of ${stock.symbol} (Short Position)`);
    }
    
    gameData.hasTradedThisRound = true;
    await fetchPortfolio();
    ui.modals.overlay.classList.add('hidden');
}

async function fetchPortfolio() {
    if (!gameData.player) return;
    const { data: portfolio } = await sb.from('portfolios').select('*, stocks(*)').eq('player_id', gameData.player.id);
    gameData.portfolio = portfolio;
    renderPortfolio();
    updatePlayerStats();
}

async function fetchHand() {
    if (!gameData.player) return;
    const { data: hand } = await sb.from('room_cards').select('*, stocks(*)').eq('player_id', gameData.player.id).eq('status', 'hand');
    gameData.hand = hand || [];
    renderCentralMarket();
    renderSecretHints();
    updateTurnUI();
}

function renderSecretHints() {
    const tray = document.getElementById('secret-hints-tray');
    const mobileTray = document.getElementById('mobile-secret-hints-tray');
    const countBadge = document.getElementById('hand-count-badge');
    const mobileCountBadge = document.getElementById('mobile-hand-count-badge');

    const hand = gameData.hand || [];
    
    if (countBadge) countBadge.innerText = `${hand.length} Cards`;
    if (mobileCountBadge) mobileCountBadge.innerText = `${hand.length} Cards`;

    if (hand.length === 0) {
        const emptyHtml = `
            <div class="text-white/20 text-[10px] uppercase font-bold tracking-widest text-center py-4 w-full">
                No secret hints in hand
            </div>
        `;
        if (tray) tray.innerHTML = emptyHtml;
        if (mobileTray) mobileTray.innerHTML = emptyHtml;
        return;
    }

    const hintsHtml = hand.map(card => {
        const val = card.fluctuation_value;
        const isPositive = val >= 0;
        const formattedVal = isPositive ? `+${val}%` : `${val}%`;
        const textClass = isPositive ? 'text-bull' : 'text-bear';
        const borderClass = isPositive ? 'border-bull/20 hover:border-bull/50' : 'border-bear/20 hover:border-bear/50';
        const company = COMPANIES.find(c => c.name === card.stocks.name) || { color: '#cda142', symbol: card.stocks.symbol, sector: 'Energy' };
        
        return `
            <div class="hint-card group" style="--stock-brand: ${company.color};" onclick="openTradeModal('${card.stocks.name}')">
                <div class="flex justify-between items-center w-full z-10">
                    <span class="text-[8px] font-black text-white/30 uppercase tracking-widest">${company.sector}</span>
                    <span class="text-[9px] font-black text-white/50">${card.stocks.symbol}</span>
                </div>
                
                <div class="my-auto text-center z-10">
                    <p class="text-2xl font-black ${textClass} tracking-tight tabular-nums group-hover:scale-110 transition-transform">
                        ${formattedVal}
                    </p>
                    <p class="text-[7px] font-bold text-white/30 uppercase tracking-widest mt-1">Secret Trend</p>
                </div>
                
                <div class="border-t border-white/5 pt-2 flex justify-between items-center z-10 w-full">
                    <span class="text-[8px] font-black text-white/40 truncate max-w-[80%]">${card.stocks.name}</span>
                    <span class="text-[9px] opacity-40 group-hover:opacity-100 transition-opacity">🎴</span>
                </div>
            </div>
        `;
    }).join('');

    if (tray) tray.innerHTML = hintsHtml;
    if (mobileTray) mobileTray.innerHTML = hintsHtml;
}

function renderMarket() {
    renderCentralMarket();
    
    const sidebarHtml = gameData.stocks.map(s => `
        <div class="bg-[#15161e] p-4 rounded-2xl border border-white/5 flex items-center justify-between hover:bg-white/10 transition-all cursor-pointer select-none" onclick="openTradeModal('${s.name}')">
            <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-xl flex items-center justify-center font-black bg-primary/10 text-primary">${s.symbol[0]}</div>
                <div><p class="text-sm font-bold text-white">${s.name}</p><p class="text-[10px] text-white/30 font-semibold">${s.symbol}</p></div>
            </div>
            <div class="text-right">
                <p class="text-sm font-black text-white">${formatCurrency(s.current_price)}</p>
            </div>
        </div>
    `).join('');
    
    const list = document.getElementById('market-list');
    const mobileList = document.getElementById('mobile-market-list');
    if (list) list.innerHTML = sidebarHtml;
    if (mobileList) mobileList.innerHTML = sidebarHtml;
}

function renderPortfolio() {
    const portfolioList = document.getElementById('portfolio-list');
    const mobilePortfolioList = document.getElementById('mobile-portfolio-list');
    
    if (!gameData.portfolio || gameData.portfolio.length === 0) {
        const emptyHtml = `
            <div class="text-center py-10 opacity-20">
                <svg class="w-12 h-12 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"></path></svg>
                <p class="text-xs font-bold">No Stocks Owned</p>
            </div>
        `;
        if (portfolioList) portfolioList.innerHTML = emptyHtml;
        if (mobilePortfolioList) mobilePortfolioList.innerHTML = emptyHtml;
        return;
    }
    
    let totalPL = 0;
    
    const itemsHtml = gameData.portfolio.map(p => {
        const currentPrice = p.stocks.current_price;
        const avgBuy = p.average_buy_price || 0;
        const qty = p.quantity || 0;
        
        // P&L supports long & short positions
        const pl = qty * (currentPrice - avgBuy);
        totalPL += pl;
        
        const isProfit = pl >= 0;
        const totalValue = Math.abs(qty) * currentPrice;
        const plPercent = avgBuy > 0 ? ((currentPrice - avgBuy) / avgBuy * 100) * (qty < 0 ? -1 : 1) : 0;
        
        return `
            <div class="bg-gradient-to-b from-[#181820] to-[#121217] p-4 rounded-2xl border border-white/5 flex items-center justify-between hover:border-white/10 transition-all select-none">
                <div>
                    <div class="flex items-center gap-2">
                        <p class="text-sm font-black text-white">${p.stocks.name}</p>
                        ${qty < 0 ? '<span class="px-1.5 py-0.5 text-[8px] font-black uppercase bg-bear/20 text-bear border border-bear/30 rounded">SHORT</span>' : ''}
                    </div>
                    <p class="text-[10px] text-white/40 font-semibold mt-0.5">
                        ${Math.abs(qty)} Shares @ ${formatCurrency(avgBuy)}
                    </p>
                </div>
                <div class="text-right">
                    <p class="text-sm font-black text-white">${formatCurrency(totalValue)}</p>
                    <div class="flex items-center justify-end gap-1.5 mt-0.5 text-[10px] font-black ${isProfit ? 'text-bull' : 'text-bear'}">
                        <span>${isProfit ? '▲' : '▼'} ${formatCurrency(Math.abs(pl))}</span>
                        <span class="opacity-60">(${isProfit ? '+' : ''}${plPercent.toFixed(1)}%)</span>
                    </div>
                </div>
            </div>
        `;
    }).join('');
    
    const isTotalProfit = totalPL >= 0;
    const summaryHtml = `
        <div class="bg-white/5 p-4 rounded-2xl border border-white/10 flex items-center justify-between mb-4 select-none">
            <div>
                <p class="text-[9px] font-bold text-white/40 uppercase tracking-widest">Portfolio P&L</p>
                <p class="text-xs font-semibold text-white/60">Live Performance</p>
            </div>
            <p class="text-base font-black ${isTotalProfit ? 'text-bull' : 'text-bear'} tabular-nums">
                ${isTotalProfit ? '+' : ''}${formatCurrency(totalPL)}
            </p>
        </div>
        <div class="space-y-3">
            ${itemsHtml}
        </div>
    `;
    
    if (portfolioList) portfolioList.innerHTML = summaryHtml;
    if (mobilePortfolioList) mobilePortfolioList.innerHTML = summaryHtml;
}

function updatePlayerStats() {
    if (!gameData.player) return;
    const stockValue = gameData.portfolio?.reduce((sum, p) => sum + (p.quantity * p.stocks.current_price), 0) || 0;
    const netWorth = gameData.player.cash + stockValue;
    
    const nwEl = document.getElementById('net-worth');
    const cashEl = document.getElementById('cash-value');
    const mobileCashEl = document.getElementById('mobile-cash');
    const svEl = document.getElementById('stock-value');

    if (nwEl) nwEl.innerText = formatCurrency(netWorth);
    if (cashEl) cashEl.innerText = formatCurrency(gameData.player.cash);
    if (mobileCashEl) mobileCashEl.innerText = formatCurrency(gameData.player.cash);
    if (svEl) svEl.innerText = formatCurrency(stockValue);
    
    if (netWorth !== gameData.player.net_worth) sb.from('players').update({ net_worth: netWorth }).eq('id', gameData.player.id);
}

function renderBoard() {
    const svg = document.getElementById('board-svg');
    if (!svg) return;
    svg.innerHTML = '';
    BOARD_LAYOUT.forEach(tile => {
        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        const hex = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
        hex.setAttribute('points', getHexagonPoints(tile.x, tile.y, 65));
        hex.setAttribute('fill', tile.type === 'buy_sell' ? (COMPANIES.find(c => c.name === tile.company)?.color || '#1e293b') : '#1e293b');
        hex.setAttribute('class', 'tile-hover cursor-pointer opacity-80 hover:opacity-100 transition-opacity');
        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', tile.x); text.setAttribute('y', tile.y + 5);
        text.setAttribute('text-anchor', 'middle'); text.setAttribute('fill', 'white'); text.setAttribute('font-size', '10'); text.setAttribute('font-weight', 'bold');
        text.textContent = tile.label || tile.company.split(' ')[0];
        g.appendChild(hex); g.appendChild(text); svg.appendChild(g);
        if (tile.type === 'buy_sell') g.onclick = () => openTradeModal(tile.company);
    });
    renderPawns();
}

function renderPawns() {
    const container = document.getElementById('pawns-container');
    if (!container) return;
    container.innerHTML = '';
    gameData.players.forEach(p => {
        const tile = BOARD_LAYOUT[p.position || 0];
        const pawn = document.createElement('div');
        pawn.className = 'pawn absolute w-8 h-8 rounded-full border-2 border-white shadow-xl flex items-center justify-center font-bold text-xs z-20';
        pawn.style.background = p.color || '#3b82f6';
        pawn.style.left = `${(tile.x / 1000) * 100}%`; pawn.style.top = `${(tile.y / 1000) * 100}%`;
        pawn.style.transform = 'translate(-50%, -50%)';
        pawn.innerText = p.profiles?.username?.[0] || 'P';
        container.appendChild(pawn);
    });
}

function addLog(msg) {
    const logs = document.getElementById('game-logs');
    if (!logs) return;
    const log = document.createElement('p');
    log.innerHTML = `<span class="text-white/20">${new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span> ${msg}`;
    logs.prepend(log);
}

document.addEventListener('DOMContentLoaded', () => {
    initLobby();
    setupCardTilt();
    setupGlobalClose();
});

// Foolproof event delegation for close buttons across all screens/modals
function setupGlobalClose() {
    document.addEventListener('click', (e) => {
        const btn = e.target.closest('.close-modal, .close-mobile-panel');
        if (btn) {
            const overlay = document.getElementById('modal-overlay');
            const tradeModal = document.getElementById('trade-modal');
            const cardModal = document.getElementById('card-modal');
            const marketPanel = document.getElementById('mobile-market-panel');
            const portfolioPanel = document.getElementById('mobile-portfolio-panel');
            const createModal = document.getElementById('create-room-modal');
            
            if (overlay) overlay.classList.add('hidden');
            if (tradeModal) tradeModal.classList.add('hidden');
            if (cardModal) cardModal.classList.add('hidden');
            if (marketPanel) marketPanel.classList.add('hidden');
            if (portfolioPanel) portfolioPanel.classList.add('hidden');
            if (createModal) createModal.classList.add('hidden');
        }
    });
}

// Interactive 3D tilt tracking for playing cards
function setupCardTilt() {
    const list = document.getElementById('central-market-list');
    if (!list) return;
    
    list.addEventListener('mousemove', (e) => {
        const card = e.target.closest('.playing-card');
        if (!card) return;
        
        const rect = card.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;
        
        // Calculate tilt angles (maximum 15 degrees tilt)
        const tiltX = ((centerY - y) / centerY) * 15;
        const tiltY = ((x - centerX) / centerX) * 15;
        
        // Apply spring-loaded 3D tilt
        card.style.transform = `translateY(-8px) scale(1.03) rotateX(${tiltX.toFixed(1)}deg) rotateY(${tiltY.toFixed(1)}deg)`;
    });
    
    list.addEventListener('mouseleave', (e) => {
        const card = e.target.closest('.playing-card');
        if (!card) return;
        
        // Return smoothly to base position
        card.style.transform = '';
    }, true);
}
