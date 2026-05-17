// Board Layout and Game Content Configuration

const COMPANIES = [
    { name: 'RELIANCE IND', symbol: 'RELIANCE', color: '#6366f1', sector: 'Energy', basePrice: 2400 },
    { name: 'TCS', symbol: 'TCS', color: '#3b82f6', sector: 'IT', basePrice: 3800 },
    { name: 'HDFC BANK', symbol: 'HDFCBANK', color: '#f59e0b', sector: 'Finance', basePrice: 1600 },
    { name: 'INFOSYS', symbol: 'INFY', color: '#10b981', sector: 'IT', basePrice: 1500 },
    { name: 'ICICI BANK', symbol: 'ICICIBANK', color: '#ec4899', sector: 'Finance', basePrice: 1000 },
    { name: 'SBI', symbol: 'SBIN', color: '#0ea5e9', sector: 'Banking', basePrice: 600 },
    { name: 'BHARTI AIRTEL', symbol: 'BHARTIARTL', color: '#8b5cf6', sector: 'Telecom', basePrice: 1200 }
];

const BOARD_TILE_TYPES = {
    START: 'start',
    BUY_SELL: 'buy_sell',
    MARKET_TREND: 'market_trend',
    BROKER: 'broker',
    WINDFALL: 'windfall',
    TAX: 'tax',
    DIVIDEND: 'dividend',
    FRAUD: 'fraud'
};

const BOARD_TILES = [
    { id: 0, type: BOARD_TILE_TYPES.START, label: 'START' },
    { id: 1, type: BOARD_TILE_TYPES.BUY_SELL, company: 'RELIANCE IND' },
    { id: 2, type: BOARD_TILE_TYPES.MARKET_TREND, label: 'TREND' },
    { id: 3, type: BOARD_TILE_TYPES.BUY_SELL, company: 'TCS' },
    { id: 4, type: BOARD_TILE_TYPES.BROKER, label: 'BROKER' },
    { id: 5, type: BOARD_TILE_TYPES.BUY_SELL, company: 'HDFC BANK' },
    { id: 6, type: BOARD_TILE_TYPES.TAX, label: 'INC TAX' },
    { id: 7, type: BOARD_TILE_TYPES.BUY_SELL, company: 'INFOSYS' },
    { id: 8, type: BOARD_TILE_TYPES.WINDFALL, label: 'WINDFALL' },
    { id: 9, type: BOARD_TILE_TYPES.BUY_SELL, company: 'ICICI BANK' },
    { id: 10, type: BOARD_TILE_TYPES.DIVIDEND, label: 'DIVIDEND' },
    { id: 11, type: BOARD_TILE_TYPES.BUY_SELL, company: 'SBI' },
    { id: 12, type: BOARD_TILE_TYPES.FRAUD, label: 'FRAUD' },
    { id: 13, type: BOARD_TILE_TYPES.BUY_SELL, company: 'BHARTI AIRTEL' },
    { id: 14, type: BOARD_TILE_TYPES.MARKET_TREND, label: 'TREND' },
    { id: 15, type: BOARD_TILE_TYPES.BUY_SELL, company: 'RELIANCE IND' },
    { id: 16, type: BOARD_TILE_TYPES.BROKER, label: 'BROKER' },
    { id: 17, type: BOARD_TILE_TYPES.BUY_SELL, company: 'TCS' },
    { id: 18, type: BOARD_TILE_TYPES.WINDFALL, label: 'WINDFALL' },
    { id: 19, type: BOARD_TILE_TYPES.BUY_SELL, company: 'HDFC BANK' }
];

const TREND_CARDS = [
    { title: 'BULL RUN!', description: 'Economy is booming! All share prices increase by 15%.', effect: { type: 'global', change: 1.15 } },
    { title: 'WEAK MONSOON', description: 'Agriculture affected. Nifty and FMCG prices fall by 10%.', effect: { type: 'sector', sector: ['Index', 'FMCG'], change: 0.90 } },
    { title: 'FII INFLOW', description: 'Foreign investors are buying! Banking stocks jump by 20%.', effect: { type: 'sector', sector: ['Banking', 'Finance'], change: 1.20 } },
    { title: 'TECH DISRUPTION', description: 'New AI breakthroughs. IT sector share prices jump by 25%.', effect: { type: 'sector', sector: ['IT'], change: 1.25 } },
    { title: 'GST HIKE', description: 'Government increases taxes. All share prices drop by 5%.', effect: { type: 'global', change: 0.95 } },
    { title: 'DIVIDEND PARTY', description: 'Companies announce record dividends! Everyone gets ₹5,000.', effect: { type: 'cash', amount: 5000 } }
];

// Hexagon math for board generation
function getHexagonPoints(cx, cy, r) {
    const points = [];
    for (let i = 0; i < 6; i++) {
        const angle = (Math.PI / 180) * (60 * i - 30);
        points.push(`${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`);
    }
    return points.join(' ');
}

// Circular board layout calculation
function calculateBoardPath() {
    const centerX = 500;
    const centerY = 500;
    const radius = 380;
    const tiles = [];
    
    for (let i = 0; i < BOARD_TILES.length; i++) {
        const angle = (2 * Math.PI * i) / BOARD_TILES.length - Math.PI / 2;
        const x = centerX + radius * Math.cos(angle);
        const y = centerY + radius * Math.sin(angle);
        tiles.push({ ...BOARD_TILES[i], x, y });
    }
    return tiles;
}

const BOARD_LAYOUT = calculateBoardPath();
