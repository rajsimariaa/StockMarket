// Core Game Logic - Final "Zero Bug" Version

let roomSubscription = null;
let playersSubscription = null;
let stocksSubscription = null;
let portfolioSubscription = null;

function initLobby() {
    // Re-select buttons to ensure they are connected
    const createBtn = document.getElementById('create-room-btn');
    const joinBtn = document.getElementById('join-room-btn');
    const roomInput = document.getElementById('room-code-input');

    if (createBtn) createBtn.onclick = createRoom;
    if (joinBtn) joinBtn.onclick = () => joinRoom(roomInput.value.toUpperCase());
    
    const urlParams = new URLSearchParams(window.location.search);
    const joinCode = urlParams.get('join');
    if (joinCode) {
        roomInput.value = joinCode;
        joinRoom(joinCode);
    }
}

async function createRoom() {
    if (!gameData.user || !gameData.user.id) {
        return showToast('Session Error: Please logout and login again.', 'error');
    }

    // 🔥 FIX: Ensure the profile exists in the database before creating the room
    // This prevents the 'rooms_host_id_fkey' constraint error if the profiles table was cleared
    await sb.from('profiles').upsert([{ id: gameData.user.id, username: gameData.user.username }], { onConflict: 'id' });

    const roomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    const { data: room, error } = await sb.from('rooms').insert([{ 
        room_code: roomCode, 
        host_id: gameData.user.id, 
        status: 'lobby'
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

    // Ensure profile exists (Handshake)
    await sb.from('profiles').upsert([{ id: gameData.user.id, username: gameData.user.username }], { onConflict: 'id' });

    // Ensure player record exists
    const { error: upsertError } = await sb.from('players').upsert([{ 
        room_id: room.id, 
        user_id: gameData.user.id, 
        is_ready: true,
        cash: 100000
    }], { onConflict: 'room_id,user_id' });

    if (upsertError) {
        console.error('Player Upsert Error:', upsertError);
        alert(`Database Error (Player Join): ${upsertError.message}\nDetail: ${upsertError.details || 'None'}`);
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
            location.reload(); // Always go home
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
            const isRoundChanged = gameData.room && payload.new.round_number !== gameData.room.round_number;
            gameData.room = payload.new;
            if (payload.new.status === 'playing' && ui.screens.game.classList.contains('hidden')) enterGame();
            if (payload.new.status === 'finished') endGame();
            if (isRoundChanged) {
                gameData.hasTradedThisRound = false;
                fetchHand();
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
    if (startBtn) startBtn.disabled = gameData.players.length < 1; // Allow solo play for testing
}

async function startGame() {
    if (!gameData.isHost) return;
    
    // Create stocks for the round-based market
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

    // Fetch the inserted stocks to get their IDs
    const { data: insertedStocks } = await sb.from('stocks').select('id, name').eq('room_id', gameData.room.id);
    
    // Generate 40 cards per company
    const cardValues = [-20, -15, -10, -5, 5, 10, 15, 20];
    let allCards = [];
    
    if (insertedStocks) {
        insertedStocks.forEach(stock => {
            // 40 cards = 5 sets of the 8 card values
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
        
        // Shuffle the cards
        allCards.sort(() => Math.random() - 0.5);
        
        // Distribute 10 cards to each player
        let cardIndex = 0;
        gameData.players.forEach(player => {
            for(let i=0; i<10; i++) {
                if (cardIndex < allCards.length) {
                    allCards[cardIndex].player_id = player.id;
                    allCards[cardIndex].status = 'hand';
                    cardIndex++;
                }
            }
        });
        
        // Insert all cards to database
        const { error: cardsError } = await sb.from('room_cards').insert(allCards);
        if (cardsError) console.error("Error creating cards:", cardsError);
    }

    await sb.from('rooms').update({ 
        status: 'playing', 
        current_turn_index: 0,
        round_number: 1 
    }).eq('id', gameData.room.id);
}

function enterGame() {
    ui.screens.waiting.classList.add('hidden');
    ui.screens.game.classList.remove('hidden');
    
    // Mandatorily sync players before starting
    fetchPlayers(gameData.room.id);
    
    renderBoard();
    fetchStocks();
    fetchPortfolio();
    fetchHand();
    
    if (stocksSubscription) stocksSubscription.unsubscribe();
    stocksSubscription = sb.channel(`stocks:${gameData.room.id}`).on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'stocks', filter: `room_id=eq.${gameData.room.id}` }, 
        () => fetchStocks()).subscribe();

    // Re-bind game controls
    const endTurnBtn = document.getElementById('end-turn-btn');
    const leaveBtn = document.getElementById('leave-game-btn');
    const mobileLeaveBtn = document.getElementById('mobile-leave-btn');
    
    const mobilePortBtn = document.getElementById('mobile-portfolio-btn');
    const mobileMarkBtn = document.getElementById('mobile-market-btn');

    if (endTurnBtn) endTurnBtn.onclick = endTurn;
    if (leaveBtn) leaveBtn.onclick = leaveMatch;
    if (mobileLeaveBtn) mobileLeaveBtn.onclick = leaveMatch;
    
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

    // Close panel buttons
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
    
    // Initial renders
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
        
        return `
            <div class="flex items-center justify-between p-4 md:p-6 bg-white/5 rounded-3xl border border-white/5 hover:bg-white/10 transition-all group">
                <div class="flex items-center gap-3 md:gap-5">
                    <div class="w-12 h-12 md:w-14 md:h-14 bg-primary/10 rounded-2xl flex items-center justify-center text-primary font-black text-lg md:text-xl group-hover:scale-110 transition-transform shrink-0">
                        ${stock.symbol}
                    </div>
                    <div>
                        <h4 class="text-base md:text-lg font-black text-white tracking-tight">${stock.name}</h4>
                        <div class="flex items-center gap-2">
                            <span class="text-[9px] md:text-[10px] font-bold text-white/30 uppercase tracking-widest">${stock.volatility} VOLATILITY</span>
                        </div>
                    </div>
                </div>
                
                <div class="flex items-center gap-3 md:gap-8">
                    <div class="text-right">
                        <p class="text-lg md:text-2xl font-black text-white">${formatCurrency(stock.current_price)}</p>
                        <p class="text-[10px] md:text-sm font-bold ${isUp ? 'text-bull' : 'text-bear'}">
                            ${isUp ? '▲' : '▼'} ${formatCurrency(Math.abs(change))}
                        </p>
                    </div>
                    <button onclick="openTradeModal('${stock.name}')" 
                        class="bg-white/5 hover:bg-white/10 border border-white/10 px-4 md:px-6 py-3 md:py-3 rounded-xl md:rounded-2xl font-black text-[10px] md:text-xs uppercase tracking-widest transition-all active:scale-95 shrink-0">
                        TRADE
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

async function endTurn(isAutoPlay = false) {
    if (!isAutoPlay && gameData.hand && gameData.hand.length > 0) {
        showToast("Submit all your Market Hints before finishing your turn!");
        return;
    }

    const endBtn = document.getElementById('end-turn-btn');
    if (endBtn) {
        endBtn.disabled = true;
        endBtn.innerText = 'WAITING FOR OTHERS...';
    }

    const isLastPlayer = gameData.room.current_turn_index === (gameData.players.length - 1);
    
    if (isLastPlayer) {
        if (gameData.room.round_number >= 3) {
            // END OF GAME
            addLog("Game Complete! Calculating Final Scores...");
            await endGame();
            return;
        }

        addLog("Round Complete! Fluctuating Market...");
        await fluctuateMarket();
        await redistributeCards();
        
        await sb.from('rooms').update({ 
            current_turn_index: 0,
            round_number: (gameData.room.round_number || 1) + 1
        }).eq('id', gameData.room.id);
    } else {
        await nextTurn();
    }
}

async function redistributeCards() {
    // 1. Delete all remaining 'hand' cards for all players to wipe their hands
    await sb.from('room_cards').delete().eq('room_id', gameData.room.id).eq('status', 'hand');

    // 2. Fetch all remaining cards in the 'deck'
    const { data: deckCards } = await sb.from('room_cards').select('id').eq('room_id', gameData.room.id).eq('status', 'deck');
    if (!deckCards || deckCards.length === 0) return;

    // Shuffle the deck cards
    deckCards.sort(() => Math.random() - 0.5);

    // 3. Give up to 10 new cards to each player
    let cardIndex = 0;
    const updates = [];
    
    gameData.players.forEach(player => {
        for(let i=0; i<10; i++) {
            if (cardIndex < deckCards.length) {
                updates.push({
                    id: deckCards[cardIndex].id,
                    player_id: player.id,
                    status: 'hand'
                });
                cardIndex++;
            }
        }
    });

    // Update the cards in the database to be in the players' hands
    if (updates.length > 0) {
        for (const update of updates) {
            await sb.from('room_cards').update({ player_id: update.player_id, status: 'hand' }).eq('id', update.id);
        }
    }
    
    await fetchHand();
}



async function endGame() {
    // 1. Fetch all players and their portfolios
    const { data: players } = await sb.from('players').select('*, portfolios(quantity, stocks(current_price)), profiles(username)').eq('room_id', gameData.room.id);
    
    // 2. Calculate final net worth
    const leaderboard = players.map(p => {
        const stockValue = p.portfolios?.reduce((sum, item) => sum + (item.quantity * item.stocks.current_price), 0) || 0;
        return {
            username: p.profiles?.username || 'Trader',
            total: p.cash + stockValue
        };
    }).sort((a, b) => b.total - a.total);

    // 3. Mark room as finished
    await sb.from('rooms').update({ status: 'finished' }).eq('id', gameData.room.id);
    
    // 4. Render Leaderboard UI
    const list = document.getElementById('leaderboard-list');
    if (list) {
        list.innerHTML = leaderboard.map((p, index) => {
            const rank = index + 1;
            const isTop3 = rank <= 3;
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

    // 5. Show the modal and hide everything else
    ui.modals.overlay.classList.remove('hidden');
    document.getElementById('leaderboard-modal').classList.remove('hidden');
    ui.modals.trade.classList.add('hidden');
    ui.modals.card.classList.add('hidden');
}

async function fluctuateMarket() {
    // 1. Fetch all submitted cards for this room
    const { data: submittedCards } = await sb.from('room_cards').select('*').eq('room_id', gameData.room.id).eq('status', 'submitted');
    
    // 2. Group fluctuations by stock_id
    const fluctuations = {};
    if (submittedCards) {
        submittedCards.forEach(c => {
            fluctuations[c.stock_id] = (fluctuations[c.stock_id] || 0) + c.fluctuation_value;
        });
    }

    // 3. Apply fluctuations to stocks
    for (const stock of gameData.stocks) {
        const changePercent = (fluctuations[stock.id] || 0) / 100; // e.g., +15 becomes 0.15
        const changeAmount = Math.round(stock.current_price * changePercent);
        const newPrice = Math.max(10, stock.current_price + changeAmount); // Prevents price going to 0 or negative
        
        await sb.from('stocks').update({ 
            current_price: newPrice,
            last_change: changeAmount
        }).eq('id', stock.id);
    }
    
    // 4. Delete the submitted cards so they aren't reused next round
    if (submittedCards && submittedCards.length > 0) {
        const idsToDelete = submittedCards.map(c => c.id);
        await sb.from('room_cards').delete().in('id', idsToDelete);
    }
}

async function finishTurn() {
    ui.modals.overlay.classList.add('hidden');
    await nextTurn();
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
        // If stocks missing but game is playing, host should re-create
        if (gameData.isHost && gameData.room.status === 'playing') {
            await startGame();
        }
        return;
    }

    gameData.stocks = stocks;
    renderCentralMarket();
}

async function leaveMatch() {
    if (!gameData.player || !confirm('Are you sure you want to leave? Your wealth will be distributed to other players!')) return;

    const leaveBtn = document.getElementById('leave-game-btn');
    if (leaveBtn) {
        leaveBtn.innerText = 'LEAVING...';
        leaveBtn.disabled = true;
    }

    try {
        const stockValue = gameData.portfolio?.reduce((sum, p) => sum + (p.quantity * p.stocks.current_price), 0) || 0;
        const totalWealth = gameData.player.cash + stockValue;
        const remainingPlayers = gameData.players?.filter(p => p.id !== gameData.player.id) || [];

        if (remainingPlayers.length > 0) {
            const inheritance = Math.floor(totalWealth / remainingPlayers.length);
            for (const p of remainingPlayers) {
                await sb.from('players').update({ cash: p.cash + inheritance }).eq('id', p.id);
            }
            
            if (gameData.isHost) {
                await sb.from('rooms').update({ host_id: remainingPlayers[0].user_id }).eq('id', gameData.room.id);
            }
            
            addLog(`${gameData.user.username} left. Each player got ${formatCurrency(inheritance)}!`);
        } else if (gameData.room) {
            await sb.from('rooms').delete().eq('id', gameData.room.id);
        }

        await sb.from('players').delete().eq('id', gameData.player.id);
    } catch (e) {
        console.error('Leave match error:', e);
    }
    
    location.reload(); // Always go home
}

async function nextTurn() {
    const nextIndex = (gameData.room.current_turn_index + 1) % gameData.players.length;
    await sb.from('rooms').update({ current_turn_index: nextIndex }).eq('id', gameData.room.id);
    const rollBtn = document.getElementById('roll-dice-btn');
    if (rollBtn) rollBtn.disabled = false;
}

function updateTurnUI() {
    if (!gameData.players || gameData.players.length === 0) return;
    const currentIndex = gameData.room.current_turn_index || 0;
    const currentPlayer = gameData.players[currentIndex];
    const isMyTurn = currentPlayer?.user_id === gameData.user.id;
    
    const roundDisplay = document.getElementById('round-display');
    const turnIndicator = document.getElementById('turn-indicator-text');
    const endBtn = document.getElementById('end-turn-btn');

    if (roundDisplay) roundDisplay.innerText = `${gameData.room.round_number || 1} / 3`;



    if (turnIndicator) {
        turnIndicator.innerText = isMyTurn ? 'IT IS YOUR TURN TO TRADE' : `WAITING FOR ${currentPlayer?.profiles?.username?.toUpperCase() || 'PLAYER'}...`;
        turnIndicator.className = isMyTurn ? 'text-sm font-bold text-bull animate-pulse' : 'text-sm font-bold text-white/40';
    }

    if (endBtn) {
        if (isMyTurn) {
            const hasCards = gameData.hand && gameData.hand.length > 0;
            endBtn.disabled = hasCards;
            endBtn.innerText = hasCards ? 'SUBMIT CARDS FIRST' : 'FINISH TRADING';
            if (hasCards) {
                endBtn.classList.add('opacity-50', 'cursor-not-allowed');
                endBtn.classList.remove('hover:bg-secondary');
            } else {
                endBtn.classList.remove('opacity-50', 'cursor-not-allowed');
                endBtn.classList.add('hover:bg-secondary');
            }
        } else {
            endBtn.disabled = true;
            endBtn.innerText = 'WAITING...';
            endBtn.classList.add('opacity-50', 'cursor-not-allowed');
        }
    }
}

async function processTileAction(tile) {
    addLog(`Landed on ${tile.label || tile.company}`);
    
    if (tile.type === BOARD_TILE_TYPES.BUY_SELL) {
        openTradeModal(tile.company);
    } else if (tile.type === BOARD_TILE_TYPES.MARKET_TREND || tile.type === BOARD_TILE_TYPES.WINDFALL) {
        const card = TREND_CARDS[Math.floor(Math.random() * TREND_CARDS.length)];
        showCardModal(card);
        if (gameData.isHost) applyTrend(card);
    } else {
        // For non-modal tiles (Tax, Dividend, etc), pass turn after a small delay
        setTimeout(nextTurn, 2000);
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
    
    // Set Modal Data
    document.getElementById('trade-stock-name').innerText = stock.symbol;
    document.getElementById('trade-stock-price').innerText = formatCurrency(stock.current_price);
    document.getElementById('trade-user-holding').innerText = ownedQty;
    document.getElementById('trade-user-avg').innerText = formatCurrency(avgPrice);
    
    const qtyInput = document.getElementById('trade-qty');
    const totalEl = document.getElementById('trade-total');
    
    qtyInput.value = 1;
    totalEl.innerText = formatCurrency(stock.current_price);

    // Live update total
    qtyInput.oninput = () => {
        const qty = parseInt(qtyInput.value) || 0;
        totalEl.innerText = formatCurrency(qty * stock.current_price);
    };

    // Plus/Minus Buttons
    document.getElementById('qty-plus').onclick = () => {
        qtyInput.value = (parseInt(qtyInput.value) || 0) + 1;
        qtyInput.oninput();
    };
    document.getElementById('qty-minus').onclick = () => {
        qtyInput.value = Math.max(1, (parseInt(qtyInput.value) || 0) - 1);
        qtyInput.oninput();
    };

    // Trade Buttons
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
        // MARGIN CHECK: Can't short more than Net Worth
        const currentNetWorth = (gameData.player.cash || 0) + (gameData.portfolio?.reduce((sum, p) => sum + (p.quantity * p.stocks.current_price), 0) || 0);
        if (cost > currentNetWorth) return showToast('Margin Limit! Cannot short more than Net Worth.', 'error');

        await updateCash(cost);
        const existing = gameData.portfolio?.find(p => p.stock_id === stock.id);
        
        if (existing) {
            const newQty = (existing.quantity || 0) - quantity;
            await sb.from('portfolios').update({ quantity: newQty }).eq('id', existing.id);
        } else {
            // Start a short position
            await sb.from('portfolios').insert([{ player_id: gameData.player.id, stock_id: stock.id, quantity: -quantity, average_buy_price: stock.current_price }]);
        }
        showToast(`Sold ${quantity} shares of ${stock.symbol} (Short Position)`);
    }
    
    gameData.hasTradedThisRound = true;
    await fetchPortfolio();
    ui.modals.overlay.classList.add('hidden'); // Close after trade
}

function showCardModal(card) {
    document.getElementById('modal-card-title').innerText = card.title;
    document.getElementById('modal-card-desc').innerText = card.description;
    
    const okBtn = document.getElementById('modal-card-ok');
    okBtn.onclick = finishTurn;

    ui.modals.overlay.classList.remove('hidden');
    ui.modals.card.classList.remove('hidden');
    ui.modals.trade.classList.add('hidden');
}

// ... Rest of the functions remain the same but use direct DOM selection for stability ...

async function fetchStocks() {
    const { data } = await sb.from('stocks').select('*').eq('room_id', gameData.room.id);
    gameData.stocks = data;
    renderMarket();
    updatePlayerStats();
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
    renderHand();
    updateTurnUI();
}

function renderHand() {
    const list = document.getElementById('hand-list');
    const mobileList = document.getElementById('mobile-hand-list');
    
    if (!gameData.hand || gameData.hand.length === 0) {
        const emptyHtml = '<div class="text-center py-6 opacity-20"><p class="text-xs font-bold">No Cards Available</p></div>';
        if (list) list.innerHTML = emptyHtml;
        if (mobileList) mobileList.innerHTML = emptyHtml;
        return;
    }
    
    const html = gameData.hand.map(card => {
        const isPos = card.fluctuation_value >= 0;
        return `
            <div class="bg-white/5 p-3 rounded-xl border border-white/5 flex items-center justify-between mb-2">
                <div>
                    <p class="text-xs font-bold">${card.stocks?.name || 'Unknown'}</p>
                    <p class="text-[10px] ${isPos ? 'text-bull' : 'text-bear'} font-bold tracking-widest">${isPos ? '+' : ''}${card.fluctuation_value}%</p>
                </div>
                <button onclick="submitCard('${card.id}')" class="bg-primary/20 hover:bg-primary/40 text-primary px-3 py-1.5 rounded-lg text-[9px] font-bold uppercase transition-colors">
                    Submit
                </button>
            </div>
        `;
    }).join('');
    
    if (list) list.innerHTML = html;
    if (mobileList) mobileList.innerHTML = html;
}

async function submitCard(cardId) {
    if (!gameData.player) return;
    const card = gameData.hand.find(c => c.id === cardId);
    if (!card) return;
    
    // Check if player has already submitted a card this round
    const { data: submitted } = await sb.from('room_cards').select('id').eq('player_id', gameData.player.id).eq('status', 'submitted');
    
    // In this simplified logic, we allow 1 submission per round. If they already submitted, we can either block or let them override.
    // Let's block them if they already submitted.
    if (submitted && submitted.length > 0) {
        return showToast("You have already submitted a card for this round!");
    }
    
    await sb.from('room_cards').update({ status: 'submitted' }).eq('id', cardId);
    showToast(`Submitted ${card.stocks.symbol} ${card.fluctuation_value > 0 ? '+' : ''}${card.fluctuation_value}%`);
    await fetchHand();
}

async function submitAllCards() {
    if (!gameData.player || !gameData.hand || gameData.hand.length === 0) return;
    
    const handCardIds = gameData.hand.map(c => c.id);
    await sb.from('room_cards').update({ status: 'submitted' }).in('id', handCardIds);
    
    showToast(`Submitted all ${handCardIds.length} cards to the market!`);
    await fetchHand();
}

function renderMarket() {
    // Synchronize both sidebar and central lists
    renderCentralMarket();
    
    const sidebarHtml = gameData.stocks.map(s => `
        <div class="bg-white/5 p-4 rounded-2xl border border-white/5 flex items-center justify-between hover:bg-white/10 transition-all cursor-pointer" onclick="openTradeModal('${s.name}')">
            <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-xl flex items-center justify-center font-bold bg-primary/10 text-primary">${s.symbol[0]}</div>
                <div><p class="text-sm font-bold">${s.name}</p><p class="text-[10px] text-white/30">${s.symbol}</p></div>
            </div>
            <div class="text-right">
                <p class="text-sm font-black">${formatCurrency(s.current_price)}</p>
            </div>
        </div>
    `).join('');
    
    const list = document.getElementById('market-list');
    const mobileList = document.getElementById('mobile-market-list');
    if (list) list.innerHTML = sidebarHtml;
    if (mobileList) mobileList.innerHTML = sidebarHtml;
}

function renderPortfolio() {
    const html = gameData.portfolio?.length ? gameData.portfolio.map(p => `
        <div class="bg-white/5 p-4 rounded-2xl border border-white/5 flex items-center justify-between">
            <div><p class="text-sm font-bold">${p.stocks.name}</p><p class="text-[10px] text-white/40">${p.quantity} Shares @ ${formatCurrency(p.average_buy_price)}</p></div>
            <div class="text-right">
                <p class="text-sm font-black">${formatCurrency(p.quantity * p.stocks.current_price)}</p>
                <p class="text-[10px] ${p.stocks.current_price >= p.average_buy_price ? 'text-bull' : 'text-bear'}">${((p.stocks.current_price - p.average_buy_price)/p.average_buy_price*100).toFixed(1)}%</p>
            </div>
        </div>
    `).join('') : '<p class="text-center text-white/20 py-10">No stocks owned</p>';
    const list = document.getElementById('portfolio-list');
    const mobileList = document.getElementById('mobile-portfolio-list');
    if (list) list.innerHTML = html;
    if (mobileList) mobileList.innerHTML = html;
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

// Ensure initLobby is called on load
document.addEventListener('DOMContentLoaded', initLobby);
