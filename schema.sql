-- ==========================================
-- STOCK MARKET TRADING SIMULATOR (FINAL)
-- ==========================================
-- This schema supports:
-- 1. Round-based trading (3 Rounds total)
-- 2. Turn-sequential logic with 45s timer
-- 3. Automated market fluctuations
-- 4. Net-worth based leaderboard calculation

-- Clean up existing tables
DROP TABLE IF EXISTS public.portfolios CASCADE;
DROP TABLE IF EXISTS public.stocks CASCADE;
DROP TABLE IF EXISTS public.players CASCADE;
DROP TABLE IF EXISTS public.rooms CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;

-- 1. Profiles: Core user identity
CREATE TABLE public.profiles (
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
    max_rounds INTEGER DEFAULT 3, -- Hardcoded limit for the sprint
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
CREATE TABLE public.stocks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id UUID REFERENCES public.rooms(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    symbol TEXT NOT NULL,
    base_price INTEGER NOT NULL,
    current_price INTEGER NOT NULL,
    volatility TEXT DEFAULT 'MED', -- HIGH, MED, LOW
    last_change INTEGER DEFAULT 0,  -- The +/- movement from previous round
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

-- ==========================================
-- RLS POLICIES (Simplified for Development)
-- ==========================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portfolios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow All Access" ON public.profiles FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow All Access" ON public.rooms FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow All Access" ON public.players FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow All Access" ON public.stocks FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow All Access" ON public.portfolios FOR ALL USING (true) WITH CHECK (true);
