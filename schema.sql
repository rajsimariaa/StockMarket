-- ============================================================================
-- 🏆 STOCK MARKET BOARD GAME (SMBG) DATABASE SCHEMA
-- Target Engine: PostgreSQL / Supabase
-- Description: Normalized & Redundancy-Free schema matching App Static IDs
-- ============================================================================

-- Clean up existing tables
DROP VIEW IF EXISTS v_room_officers CASCADE;
DROP TABLE IF EXISTS transactions CASCADE;
DROP TABLE IF EXISTS room_player_turns CASCADE;
DROP TABLE IF EXISTS room_dealt_cards CASCADE;
DROP TABLE IF EXISTS room_portfolios CASCADE;
DROP TABLE IF EXISTS room_price_history CASCADE;
DROP TABLE IF EXISTS room_company_prices CASCADE;
DROP TABLE IF EXISTS room_players CASCADE;
DROP TABLE IF EXISTS rooms CASCADE;
DROP TABLE IF EXISTS fluctuation_cards CASCADE;
DROP TABLE IF EXISTS companies CASCADE;
DROP TABLE IF EXISTS players CASCADE;

-- ----------------------------------------------------------------------------
-- 1. core user/player profile registry
-- ----------------------------------------------------------------------------
CREATE TABLE players (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    username VARCHAR(50) NOT NULL UNIQUE,
    email VARCHAR(255) NOT NULL UNIQUE,
    avatar_url TEXT,
    last_seen_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    highest_score NUMERIC(15, 2) DEFAULT 0.00,
    highest_win_streak INT DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_players_username ON players(username);

-- ----------------------------------------------------------------------------
-- 2. companies reference database (Aligned with Static IDs)
-- ----------------------------------------------------------------------------
CREATE TABLE companies (
    id VARCHAR(50) PRIMARY KEY,
    exchange VARCHAR(10) NOT NULL CHECK (exchange IN ('NSE', 'NASDAQ', 'NYSE')),
    symbol VARCHAR(15) NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL,
    base_price NUMERIC(10, 2) NOT NULL CHECK (base_price > 0)
);

CREATE INDEX idx_companies_exchange ON companies(exchange);

-- ----------------------------------------------------------------------------
-- 3. price fluctuation cards (hint deck) (Aligned with Static IDs)
-- ----------------------------------------------------------------------------
CREATE TABLE fluctuation_cards (
    id VARCHAR(50) PRIMARY KEY,
    company_id VARCHAR(50) NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    hint_text VARCHAR(255) NOT NULL,
    fluctuation_percent NUMERIC(5, 2) NOT NULL CHECK (fluctuation_percent != 0.00)
);

-- ----------------------------------------------------------------------------
-- 4. game rooms (active sessions)
-- ----------------------------------------------------------------------------
CREATE TABLE rooms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(6) NOT NULL UNIQUE,
    host_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'active', 'finished')),
    max_players INT NOT NULL DEFAULT 10 CHECK (max_players >= 2 AND max_players <= 10),
    total_rounds INT NOT NULL DEFAULT 5 CHECK (total_rounds > 0),
    stock_exchange VARCHAR(10) NOT NULL CHECK (stock_exchange IN ('NSE', 'NASDAQ', 'NYSE')),
    
    -- Advanced Rules Toggles
    short_sell_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    loan_mortgage_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    chairman_ceo_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    
    -- Game Progression Counters
    current_round INT NOT NULL DEFAULT 0,
    current_sub_round INT NOT NULL DEFAULT 0 CHECK (current_sub_round BETWEEN 0 AND 3),
    current_turn_player_id UUID REFERENCES players(id) ON DELETE SET NULL,
    turn_order JSONB DEFAULT '[]'::jsonb,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_rooms_code ON rooms(code);

-- ----------------------------------------------------------------------------
-- 5. active players inside a game room
-- ----------------------------------------------------------------------------
CREATE TABLE room_players (
    room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    cash NUMERIC(15, 2) NOT NULL DEFAULT 1000000.00 CHECK (cash >= -5000000.00),
    loan_amount NUMERIC(15, 2) NOT NULL DEFAULT 0.00 CHECK (loan_amount >= 0.00),
    loan_taken_round INT DEFAULT 0,
    is_ready BOOLEAN NOT NULL DEFAULT FALSE,
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    PRIMARY KEY (room_id, player_id)
);

-- ----------------------------------------------------------------------------
-- 6. active stock prices inside a game room
-- ----------------------------------------------------------------------------
CREATE TABLE room_company_prices (
    room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    company_id VARCHAR(50) NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    current_price NUMERIC(10, 2) NOT NULL CHECK (current_price > 0),
    PRIMARY KEY (room_id, company_id)
);

-- ----------------------------------------------------------------------------
-- 7. price history tracking for interactive UI charts
-- ----------------------------------------------------------------------------
CREATE TABLE room_price_history (
    room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    company_id VARCHAR(50) NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    round_number INT NOT NULL,
    price NUMERIC(10, 2) NOT NULL CHECK (price > 0),
    PRIMARY KEY (room_id, company_id, round_number)
);

-- ----------------------------------------------------------------------------
-- 8. player portfolios (owned and mortgaged shares)
-- ----------------------------------------------------------------------------
CREATE TABLE room_portfolios (
    room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    company_id VARCHAR(50) NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    shares_owned INT NOT NULL DEFAULT 0,
    shares_mortgaged INT NOT NULL DEFAULT 0 CHECK (shares_mortgaged >= 0),
    PRIMARY KEY (room_id, player_id, company_id)
);

-- ----------------------------------------------------------------------------
-- 9. fluctuation cards dealt to players per round
-- ----------------------------------------------------------------------------
CREATE TABLE room_dealt_cards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    card_id VARCHAR(50) NOT NULL REFERENCES fluctuation_cards(id) ON DELETE CASCADE,
    round_number INT NOT NULL,
    is_discarded BOOLEAN NOT NULL DEFAULT FALSE,
    discarded_by_role VARCHAR(10) CHECK (discarded_by_role IN ('CEO', 'CHAIRMAN'))
);

CREATE INDEX idx_room_dealt_cards_room_player ON room_dealt_cards(room_id, player_id);

-- ----------------------------------------------------------------------------
-- 10. sub-round turn completion logs
-- ----------------------------------------------------------------------------
CREATE TABLE room_player_turns (
    room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    round_number INT NOT NULL,
    sub_round_number INT NOT NULL,
    has_acted BOOLEAN NOT NULL DEFAULT FALSE,
    trade_made BOOLEAN NOT NULL DEFAULT FALSE,
    PRIMARY KEY (room_id, player_id, round_number, sub_round_number)
);

-- ----------------------------------------------------------------------------
-- 11. immutable transactions ledger
-- ----------------------------------------------------------------------------
CREATE TABLE transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
    company_id VARCHAR(50) REFERENCES companies(id) ON DELETE CASCADE,
    round_number INT NOT NULL,
    sub_round_number INT NOT NULL,
    transaction_type VARCHAR(20) NOT NULL CHECK (transaction_type IN (
        'BUY', 'SELL', 
        'SHORT_SELL', 'SHORT_COVER', 
        'MORTGAGE', 'REDEEM_MORTGAGE', 
        'TAKE_LOAN', 'REPAY_LOAN',
        'AUTO_LIQUIDATE'
    )),
    shares_count INT NOT NULL DEFAULT 0,
    share_price NUMERIC(10, 2),
    total_amount NUMERIC(15, 2) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_transactions_room_player ON transactions(room_id, player_id);

-- ----------------------------------------------------------------------------
-- 12. dynamic officers view (chairman & ceo calculations)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_room_officers AS
WITH ranked_holders AS (
    SELECT 
        rp.room_id,
        rp.company_id,
        rp.player_id,
        rp.shares_owned,
        ROW_NUMBER() OVER (
            PARTITION BY rp.room_id, rp.company_id 
            ORDER BY rp.shares_owned DESC, rp.player_id ASC
        ) as share_rank
    FROM room_portfolios rp
    WHERE rp.shares_owned >= 50000
)
SELECT 
    room_id,
    company_id,
    player_id,
    shares_owned,
    CASE 
        WHEN share_rank = 1 AND shares_owned >= 100000 THEN 'CHAIRMAN'
        WHEN (share_rank = 2 AND shares_owned >= 50000) OR (share_rank = 1 AND shares_owned >= 50000 AND shares_owned < 100000) THEN 'CEO'
        ELSE 'NONE'
    END as officer_role
FROM ranked_holders
WHERE 
    (share_rank = 1 AND shares_owned >= 100000) 
    OR (share_rank = 2 AND shares_owned >= 50000) 
    OR (share_rank = 1 AND shares_owned >= 50000 AND shares_owned < 100000);

-- ============================================================================
-- 📊 SEED DATA: SEEDING EXCHANGES, COMPANIES, AND DECK OF CARDS (EXACT ID MATCH)
-- ============================================================================

-- 1. SEED COMPANIES FOR NSE (India)
INSERT INTO companies (id, exchange, symbol, name, base_price) VALUES
('nse-rel', 'NSE', 'RELIANCE', 'Reliance Industries Ltd.', 2400.00),
('nse-tcs', 'NSE', 'TCS', 'Tata Consultancy Services Ltd.', 3200.00),
('nse-hdfc', 'NSE', 'HDFCBANK', 'HDFC Bank Ltd.', 1500.00),
('nse-infy', 'NSE', 'INFY', 'Infosys Ltd.', 1400.00),
('nse-icici', 'NSE', 'ICICIBANK', 'ICICI Bank Ltd.', 900.00);

-- 2. SEED COMPANIES FOR NASDAQ (USA Tech)
INSERT INTO companies (id, exchange, symbol, name, base_price) VALUES
('nas-aapl', 'NASDAQ', 'AAPL', 'Apple Inc.', 175.00),
('nas-msft', 'NASDAQ', 'MSFT', 'Microsoft Corp.', 420.00),
('nas-googl', 'NASDAQ', 'GOOGL', 'Alphabet Inc.', 150.00),
('nas-amzn', 'NASDAQ', 'AMZN', 'Amazon.com Inc.', 180.00),
('nas-nvda', 'NASDAQ', 'NVDA', 'Nvidia Corp.', 900.00);

-- 3. SEED COMPANIES FOR NYSE (USA Corporate)
INSERT INTO companies (id, exchange, symbol, name, base_price) VALUES
('nyse-brk', 'NYSE', 'BRK.A', 'Berkshire Hathaway Inc.', 600.00),
('nyse-jpm', 'NYSE', 'JPM', 'JPMorgan Chase & Co.', 190.00),
('nyse-xom', 'NYSE', 'XOM', 'Exxon Mobil Corp.', 120.00),
('nyse-wmt', 'NYSE', 'WMT', 'Walmart Inc.', 60.00),
('nyse-lly', 'NYSE', 'LLY', 'Eli Lilly & Co.', 750.00);

-- ============================================================================
-- 🃏 SEED DATA: DECK OF FLUCTUATION CARDS (EXACT ID MATCH)
-- ============================================================================

-- NSE Company Fluctuation Cards
INSERT INTO fluctuation_cards (id, company_id, hint_text, fluctuation_percent) VALUES
('fc-rel1', 'nse-rel', 'INCREASE OF FII LIMIT', 20.00),
('fc-rel2', 'nse-rel', 'PETROCHEMICAL SUBSIDIES ANNOUNCED', 10.00),
('fc-rel3', 'nse-rel', 'CRUDE OIL MARGIN CRUSH', -12.00),
('fc-rel4', 'nse-rel', 'HIGH TELECOM OVERHEAD CAEX', -5.00),

('fc-tcs1', 'nse-tcs', 'TCS BAGS $2B CLOUD INTEGRATION CONTRACT', 18.00),
('fc-tcs2', 'nse-tcs', 'AI OPTIMIZATION INCREASES MARGINS', 8.00),
('fc-tcs3', 'nse-tcs', 'US TECH SPENDING CANCELLED', -15.00),
('fc-tcs4', 'nse-tcs', 'EMPLOYEE RETENTION WAGE OVERHEAD', -6.00),

('fc-hdfc1', 'nse-hdfc', 'DOLLAR DEPRECIATES AGAINST RUPEE', 5.00),
('fc-hdfc2', 'nse-hdfc', 'MERGER SYNERGIES AT RECORD HIGH', 7.00),
('fc-hdfc3', 'nse-hdfc', 'RISING FARM LOAN DEFAULTS NPA', -10.00),
('fc-hdfc4', 'nse-hdfc', 'SERVER OUTAGE PENALTY', -8.00),

('fc-inf1', 'nse-infy', 'SECURES HUGE EUROPEAN AI INFRAS', 14.00),
('fc-inf2', 'nse-infy', 'NEW CEO OUTLINES AGGRESSIVE STRATEGY', 6.00),
('fc-inf3', 'nse-infy', 'PROMOTERS REDUCE STAKE', -5.00),
('fc-inf4', 'nse-infy', 'ACCOUNTING FRAUD WHISTLEBLOWER', -20.00),

('fc-ici1', 'nse-icici', 'RETAIL CREDIT BOOM AT 25% YOY', 10.00),
('fc-ici2', 'nse-icici', 'BROKERAGE STRONG BUY RATING', 5.00),
('fc-ici3', 'nse-icici', 'CORPORATE DEBT PROVISIONS RISE', -12.00),
('fc-ici4', 'nse-icici', 'HIGH INTEREST RATES CAP DEMAND', -4.00);

-- NASDAQ Company Fluctuation Cards
INSERT INTO fluctuation_cards (id, company_id, hint_text, fluctuation_percent) VALUES
('fc-ap1', 'nas-aapl', 'VISION PRO SALES BEAT EXPECTATIONS', 16.00),
('fc-ap2', 'nas-aapl', 'IPHONE UPGRADE CYCLE ACCELERATES', 9.00),
('fc-ap3', 'nas-aapl', 'EU REGULATORS IMPOSE GIANT FINE', -14.00),
('fc-ap4', 'nas-aapl', 'SUPPLY CHAIN DELAYS IPAD UNIT', -5.00),

('fc-ms1', 'nas-msft', 'AZURE AI EXPANDS CLOUD DOMINANCE', 15.00),
('fc-ms2', 'nas-msft', 'WINDOWS COPILOT WIDESPREAD ADOPTION', 7.00),
('fc-ms3', 'nas-msft', 'CYBER ATTACK COMPROMISES EMAILS', -11.00),
('fc-ms4', 'nas-msft', 'ANTITRUST BLOCKS NEW ACQUISITION', -6.00),

('fc-go1', 'nas-googl', 'CLOUD SECURES PROFITABILITY STREAK', 12.00),
('fc-go2', 'nas-googl', 'GEMINI AI AD REVENUE DOUBLE DIGIT', 8.00),
('fc-go3', 'nas-googl', 'DOJ WINS MONOPOLY ANTITRUST SUIT', -18.00),
('fc-go4', 'nas-googl', 'ADVERTISING CAPTURED BY TIKTOK', -7.00),

('fc-am1', 'nas-amzn', 'PRIME SUBSCRIPTION RETENTION UP', 10.00),
('fc-am2', 'nas-amzn', 'AWS CONTRACTS POWER CHEAP SOLAR', 6.00),
('fc-am3', 'nas-amzn', 'FTC ANNOUNCES BREAKUP INVESTIGATION', -15.00),
('fc-am4', 'nas-amzn', 'WAREHOUSE LABOUR STRIKES AT HOLIDAY', -8.00),

('fc-nv1', 'nas-nvda', 'BLACKWELL CHIPS SOLD OUT 18 MONTHS', 25.00),
('fc-nv2', 'nas-nvda', 'RECORD GROSS MARGIN REACHES 78%', 12.00),
('fc-nv3', 'nas-nvda', 'US EXPANDS CHIP EXPORT CURBS', -16.00),
('fc-nv4', 'nas-nvda', 'COMPETITOR REVEALS FASTER INFRA', -9.00);

-- NYSE Company Fluctuation Cards
INSERT INTO fluctuation_cards (id, company_id, hint_text, fluctuation_percent) VALUES
('fc-brk1', 'nyse-brk', 'CASH PILE REACHES RECORD $180B', 8.00),
('fc-brk2', 'nyse-brk', 'INSURANCE UNDERWRITING SURGES', 5.00),
('fc-brk3', 'nyse-brk', 'CONSUMER PORTFOLIO VALUATION SLIDE', -9.00),
('fc-brk4', 'nyse-brk', 'GEICO LOSS FREQUENCIES SPIKE', -4.00),

('fc-jp1', 'nyse-jpm', 'MERGERS BOOM BRINGS M&A FEES', 14.00),
('fc-jp2', 'nyse-jpm', 'NET INTEREST INCOME OUTLOOK UPGRADE', 7.00),
('fc-jp3', 'nyse-jpm', 'REGULATORS DEMAND BUFFER DEPOSIT', -10.00),
('fc-jp4', 'nyse-jpm', 'CREDIT DELINQUENCIES ESCALATE', -6.00),

('fc-xo1', 'nyse-xom', 'GUYANA OFFSHORE RESERVES OUTPERFORM', 11.00),
('fc-xo2', 'nyse-xom', 'NATURAL GAS PRICING SHARP ADVANCE', 6.00),
('fc-xo3', 'nyse-xom', 'OPEC UNEXPECTED QUOTA EXTENSION', -13.00),
('fc-xo4', 'nyse-xom', 'CARBON EMISSIONS REGULATORY PENALTY', -5.00),

('fc-wm1', 'nyse-wmt', 'WALMART RAISES FULL YEAR GUIDANCE', 10.00),
('fc-wm2', 'nyse-wmt', 'E-COMMERCE GROWS 22% EXPRESS DELIV', 6.00),
('fc-wm3', 'nyse-wmt', 'FREIGHT COST SPIKE ON PORT BLOCKS', -8.00),
('fc-wm4', 'nyse-wmt', 'RETAIL THEFT CAUSES SHRINKAGE', -5.00),

('fc-ly1', 'nyse-lly', 'MOUNJARO DRUG GLOBAL APPROVAL', 22.00),
('fc-ly2', 'nyse-lly', 'ALZHEIMER PHASE III HIGH SCORE', 13.00),
('fc-ly3', 'nyse-lly', 'FDA MANUFACTURING FACILITY INQUIRY', -15.00),
('fc-ly4', 'nyse-lly', 'CHEAP COMPETITOR BIOSIMILAR OBESITY', -10.00);

-- ============================================================================
-- ⚡ REAL-TIME SYNC IDENTITY ENFORCEMENT
-- ============================================================================
-- Enforce REPLICA IDENTITY FULL to enable real-time filters on room columns
ALTER TABLE rooms REPLICA IDENTITY FULL;
ALTER TABLE room_players REPLICA IDENTITY FULL;
ALTER TABLE room_dealt_cards REPLICA IDENTITY FULL;
ALTER TABLE room_company_prices REPLICA IDENTITY FULL;
ALTER TABLE room_portfolios REPLICA IDENTITY FULL;
ALTER TABLE room_player_turns REPLICA IDENTITY FULL;

-- ============================================================================
-- 🔑 ROW LEVEL SECURITY BYPASS (BULLTPROOF MULTIPLAYER PROTOTYPING)
-- ============================================================================
-- Proactively disable RLS on all tables so they work instantly after schema creation
ALTER TABLE players DISABLE ROW LEVEL SECURITY;
ALTER TABLE rooms DISABLE ROW LEVEL SECURITY;
ALTER TABLE room_players DISABLE ROW LEVEL SECURITY;
ALTER TABLE room_company_prices DISABLE ROW LEVEL SECURITY;
ALTER TABLE room_price_history DISABLE ROW LEVEL SECURITY;
ALTER TABLE room_portfolios DISABLE ROW LEVEL SECURITY;
ALTER TABLE room_dealt_cards DISABLE ROW LEVEL SECURITY;
ALTER TABLE room_player_turns DISABLE ROW LEVEL SECURITY;
ALTER TABLE transactions DISABLE ROW LEVEL SECURITY;
ALTER TABLE companies DISABLE ROW LEVEL SECURITY;
ALTER TABLE fluctuation_cards DISABLE ROW LEVEL SECURITY;


