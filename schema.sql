-- ==========================================
-- STOCK MARKET TRADING SIMULATOR (FINAL)
-- ==========================================
-- This schema supports:
-- 1. Card-based market fluctuation logic 
-- 2. Max 10 players per room
-- 3. Top 7 Indian Companies
-- 4. Net-worth based leaderboard calculation

-- Clean up existing tables
DROP TABLE IF EXISTS public.room_cards CASCADE;
DROP TABLE IF EXISTS public.portfolios CASCADE;
DROP TABLE IF EXISTS public.stocks CASCADE;
DROP TABLE IF EXISTS public.players CASCADE;
DROP TABLE IF EXISTS public.rooms CASCADE;
-- Do NOT drop profiles so user identities persist across schema resets

-- 1. Profiles: Core user identity
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY, -- Linked to Supabase Auth ID
    username TEXT UNIQUE NOT NULL,
    avatar_url TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Rooms: The game session container
CREATE TABLE public.rooms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_code TEXT UNIQUE NOT NULL,
    host_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    status TEXT DEFAULT 'lobby' CHECK (status IN ('lobby', 'playing', 'finished')),
    current_turn_index INTEGER DEFAULT 0,
    round_number INTEGER DEFAULT 1,
    max_rounds INTEGER DEFAULT 3,
    max_players INTEGER DEFAULT 10, -- Enforced limit of 10 players
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Players: Player state within a specific room
CREATE TABLE public.players (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id UUID REFERENCES public.rooms(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    cash BIGINT DEFAULT 100000,
    net_worth BIGINT DEFAULT 100000,
    is_ready BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(room_id, user_id)
);

-- 4. Stocks: Market securities unique to each room
-- Top 7 Indian Companies will be populated here
CREATE TABLE public.stocks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id UUID REFERENCES public.rooms(id) ON DELETE CASCADE,
    name TEXT NOT NULL,       -- e.g., 'Reliance Industries'
    symbol TEXT NOT NULL,     -- e.g., 'RELIANCE'
    base_price INTEGER NOT NULL,
    current_price INTEGER NOT NULL,
    volatility TEXT DEFAULT 'MED', -- HIGH, MED, LOW
    last_change INTEGER DEFAULT 0,  -- +/- movement from previous round based on cards
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Portfolios: Stock holdings for each player
CREATE TABLE public.portfolios (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    player_id UUID REFERENCES public.players(id) ON DELETE CASCADE,
    stock_id UUID REFERENCES public.stocks(id) ON DELETE CASCADE,
    quantity INTEGER DEFAULT 0,
    average_buy_price INTEGER DEFAULT 0,
    UNIQUE(player_id, stock_id)
);

-- 6. Room_Cards: The deck and player hands (40 cards per company)
CREATE TABLE public.room_cards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id UUID REFERENCES public.rooms(id) ON DELETE CASCADE,
    stock_id UUID REFERENCES public.stocks(id) ON DELETE CASCADE,
    fluctuation_value INTEGER NOT NULL, -- The value the stock will fluctuate by (e.g., +50, -20)
    player_id UUID REFERENCES public.players(id) ON DELETE SET NULL, -- Who currently holds the card
    status TEXT DEFAULT 'deck' CHECK (status IN ('deck', 'hand', 'submitted')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==========================================
-- RLS POLICIES (Simplified for Development)
-- ==========================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portfolios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_cards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow All Access" ON public.profiles;
CREATE POLICY "Allow All Access" ON public.profiles FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow All Access" ON public.rooms;
CREATE POLICY "Allow All Access" ON public.rooms FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow All Access" ON public.players;
CREATE POLICY "Allow All Access" ON public.players FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow All Access" ON public.stocks;
CREATE POLICY "Allow All Access" ON public.stocks FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow All Access" ON public.portfolios;
CREATE POLICY "Allow All Access" ON public.portfolios FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow All Access" ON public.room_cards;
CREATE POLICY "Allow All Access" ON public.room_cards FOR ALL USING (true) WITH CHECK (true);
