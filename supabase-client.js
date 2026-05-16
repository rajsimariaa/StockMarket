// Supabase Client Configuration
const supabaseUrl = 'https://qbhqkcriilqatjegqikv.supabase.co';
const supabaseKey = 'sb_publishable_nFmIbhCmm0eNDIiy6SyrXw_6x6JMs-c';

const sb = supabase.createClient(supabaseUrl, supabaseKey);

// Shared state
const gameData = {
    room: null,
    player: null,
    players: [],
    stocks: [],
    logs: [],
    isHost: false,
    currentTurnPlayer: null,
    pawnPositions: {}, // userId -> position
};

// UI Elements mapping
const ui = {
    screens: {
        auth: document.getElementById('auth-screen'),
        lobby: document.getElementById('lobby-screen'),
        waiting: document.getElementById('waiting-screen'),
        game: document.getElementById('game-screen')
    },
    auth: {
        username: document.getElementById('username'),
        password: document.getElementById('password'),
        btn: document.getElementById('auth-btn'),
        toggle: document.getElementById('toggle-auth')
    },
    lobby: {
        createBtn: document.getElementById('create-room-btn'),
        joinBtn: document.getElementById('join-room-btn'),
        roomInput: document.getElementById('room-code-input'),
        displayName: document.getElementById('display-name'),
        avatar: document.getElementById('user-avatar')
    },
    waiting: {
        roomCode: document.getElementById('current-room-code'),
        playerList: document.getElementById('player-list'),
        startBtn: document.getElementById('start-game-btn'),
        playerCount: document.getElementById('player-count'),
        copyBtn: document.getElementById('copy-link-btn')
    },
    game: {
        board: document.getElementById('board-svg'),
        pawns: document.getElementById('pawns-container'),
        dice: document.getElementById('dice-container'),
        diceValue: document.getElementById('dice-value'),
        rollBtn: document.getElementById('roll-dice-btn'),
        netWorth: document.getElementById('net-worth'),
        cash: document.getElementById('cash-value'),
        mobileCash: document.getElementById('mobile-cash'),
        stockValue: document.getElementById('stock-value'),
        marketList: document.getElementById('market-list'),
        mobileMarketList: document.getElementById('mobile-market-list'),
        portfolioList: document.getElementById('portfolio-list'),
        mobilePortfolioList: document.getElementById('mobile-portfolio-list'),
        logs: document.getElementById('game-logs'),
        turnDisplay: document.getElementById('current-player-turn'),
        mobileMarketPanel: document.getElementById('mobile-market-panel'),
        mobilePortfolioPanel: document.getElementById('mobile-portfolio-panel')
    },
    modals: {
        overlay: document.getElementById('modal-overlay'),
        trade: document.getElementById('trade-modal'),
        card: document.getElementById('card-modal'),
        closeBtns: document.querySelectorAll('.close-modal, .close-mobile-panel')
    },
    trade: {
        name: document.getElementById('trade-stock-name'),
        price: document.getElementById('trade-stock-price'),
        holding: document.getElementById('trade-user-holding'),
        avg: document.getElementById('trade-user-avg'),
        qty: document.getElementById('trade-qty'),
        total: document.getElementById('trade-total'),
        buyBtn: document.getElementById('buy-btn'),
        sellBtn: document.getElementById('sell-btn'),
        plus: document.getElementById('qty-plus'),
        minus: document.getElementById('qty-minus')
    }
};

// Utility: Show Toast
function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    const msg = document.getElementById('toast-msg');
    const icon = document.getElementById('toast-icon');

    msg.innerText = message;
    icon.className = `w-6 h-6 rounded-full ${type === 'success' ? 'bg-bull' : 'bg-bear'}`;

    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
}

// Utility: Format Currency
function formatCurrency(val) {
    return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        maximumFractionDigits: 0
    }).format(val);
}
