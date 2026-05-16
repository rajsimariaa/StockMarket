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
        cash: 100000,
        position: 0,
        color: '#' + Math.floor(Math.random()*16777215).toString(16)
    }], { onConflict: 'room_id,user_id' });

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
            gameData.room = payload.new;
            if (payload.new.status === 'playing' && ui.screens.game.classList.contains('hidden')) enterGame();
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
                <div class="w-10 h-10 rounded-xl flex items-center justify-center font-bold" style="background: ${p.color || '#3b82f6'}">${p.profiles?.username?.[0] || 'P'}</div>
                <div class="text-left"><p class="font-bold">${p.profiles?.username || 'Player'}</p><p class="text-[10px] text-white/40 uppercase">Ready</p></div>
            </div>
        `).join('');
    }
    if (count) count.innerText = gameData.players.length;
    if (startBtn) startBtn.disabled = gameData.players.length < 1; // Allow solo play for testing
}

async function startGame() {
    const stocksToCreate = COMPANIES.map(c => ({ room_id: gameData.room.id, name: c.name, symbol: c.symbol, current_price: c.basePrice, base_price: c.basePrice, color: c.color }));
    await sb.from('stocks').insert(stocksToCreate);
    await sb.from('rooms').update({ status: 'playing', current_turn_index: 0 }).eq('id', gameData.room.id);
}

function enterGame() {
    ui.screens.waiting.classList.add('hidden');
    ui.screens.game.classList.remove('hidden');
    
    // Mandatorily sync players before starting
    fetchPlayers(gameData.room.id);
    
    renderBoard();
    fetchStocks();
    fetchPortfolio();
    
    if (stocksSubscription) stocksSubscription.unsubscribe();
    stocksSubscription = sb.channel(`stocks:${gameData.room.id}`).on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'stocks', filter: `room_id=eq.${gameData.room.id}` }, 
        () => fetchStocks()).subscribe();

    // Re-bind game controls
    const rollBtn = document.getElementById('roll-dice-btn');
    const dice = document.getElementById('dice-container');
    const leaveBtn = document.getElementById('leave-game-btn');

    if (rollBtn) rollBtn.onclick = handleDiceRoll;
    if (dice) dice.onclick = handleDiceRoll;
    if (leaveBtn) leaveBtn.onclick = leaveMatch;
    
    document.getElementById('mobile-portfolio-btn').onclick = () => ui.game.mobilePortfolioPanel.classList.remove('hidden');
    document.getElementById('mobile-market-btn').onclick = () => ui.game.mobileMarketPanel.classList.remove('hidden');
    
    document.querySelectorAll('.close-modal, .close-mobile-panel').forEach(btn => {
        btn.onclick = () => {
            ui.modals.overlay.classList.add('hidden');
            ui.game.mobileMarketPanel.classList.add('hidden');
            ui.game.mobilePortfolioPanel.classList.add('hidden');
        };
    });
}

async function handleDiceRoll() {
    console.log('Dice roll triggered');
    
    // Emergency Fetch if players are missing
    if (!gameData.players || gameData.players.length === 0) {
        console.log('Players missing for room:', gameData.room?.id);
        // Handshake again just in case
        await sb.from('profiles').upsert([{ id: gameData.user.id, username: gameData.user.username }], { onConflict: 'id' });
        await fetchPlayers(gameData.room.id);
    }

    if (!gameData.players || gameData.players.length === 0) {
        return showToast(`Room Error: No players found in room ${gameData.room?.room_code}. Try refreshing.`, "error");
    }

    const currentIndex = gameData.room.current_turn_index || 0;
    const currentPlayer = gameData.players[currentIndex];
    
    if (!currentPlayer || currentPlayer.user_id !== gameData.user.id) {
        return showToast(`Waiting for ${currentPlayer?.profiles?.username || 'other player'}...`, 'error');
    }
    
    const rollBtn = document.getElementById('roll-dice-btn');
    const dice = document.getElementById('dice-container');
    const diceVal = document.getElementById('dice-value');

    if (rollBtn) rollBtn.disabled = true;
    if (dice) dice.classList.add('dice-rolling');
    
    const roll = Math.floor(Math.random() * 6) + 1;
    
    setTimeout(async () => {
        if (dice) dice.classList.remove('dice-rolling');
        if (diceVal) diceVal.innerText = roll;
        
        const currentPos = gameData.player?.position || 0;
        const newPosition = (currentPos + roll) % BOARD_TILES.length;
        const tile = BOARD_TILES[newPosition];
        
        await sb.from('players').update({ position: newPosition }).eq('id', gameData.player.id);
        processTileAction(tile);
        nextTurn();
    }, 1000);
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
    
    const turnDisplay = document.getElementById('current-player-turn');
    if (turnDisplay) {
        turnDisplay.innerText = isMyTurn ? 'YOUR TURN' : `${currentPlayer?.profiles?.username?.toUpperCase() || 'PLAYER'}'S TURN`;
        turnDisplay.className = isMyTurn ? 'font-black text-bull uppercase text-sm' : 'font-black text-primary uppercase text-sm';
    }
}

async function processTileAction(tile) {
    addLog(`Landed on ${tile.label || tile.company}`);
    
    if (tile.type === BOARD_TILE_TYPES.MARKET_TREND || tile.type === BOARD_TILE_TYPES.WINDFALL) {
        const card = TREND_CARDS[Math.floor(Math.random() * TREND_CARDS.length)];
        showCardModal(card);
        if (gameData.isHost) applyTrend(card);
    } else if (tile.type === BOARD_TILE_TYPES.DIVIDEND) {
        updateCash(5000);
        showToast('Received ₹5,000 Dividend!');
    } else if (tile.type === BOARD_TILE_TYPES.TAX) {
        updateCash(-10000);
        showToast('Paid ₹10,000 Income Tax', 'error');
    }
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

function renderMarket() {
    const html = gameData.stocks.map(s => `
        <div class="bg-white/5 p-4 rounded-2xl border border-white/5 flex items-center justify-between hover:bg-white/10 transition-all cursor-pointer" onclick="openTradeModal('${s.name}')">
            <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-xl flex items-center justify-center font-bold" style="background: ${s.color}20; color: ${s.color}">${s.symbol[0]}</div>
                <div><p class="text-sm font-bold">${s.name}</p><p class="text-[10px] text-white/30">${s.symbol}</p></div>
            </div>
            <div class="text-right">
                <p class="text-sm font-black">${formatCurrency(s.current_price)}</p>
                <p class="text-[10px] ${s.current_price >= s.base_price ? 'text-bull' : 'text-bear'}">${s.current_price >= s.base_price ? '▲' : '▼'} ${Math.abs(((s.current_price - s.base_price)/s.base_price)*100).toFixed(1)}%</p>
            </div>
        </div>
    `).join('');
    const list = document.getElementById('market-list');
    const mobileList = document.getElementById('mobile-market-list');
    if (list) list.innerHTML = html;
    if (mobileList) mobileList.innerHTML = html;
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
