-- Stock Market Board Game - CLEAN SLATE SCHEMA
-- This script WIPES old broken constraints and sets up the Name/Password system perfectly.

-- 1. CLEANUP (Wipe old broken tables to fix Foreign Key errors)
DROP TABLE IF EXISTS public.game_logs CASCADE;
DROP TABLE IF EXISTS public.portfolios CASCADE;
DROP TABLE IF EXISTS public.stocks CASCADE;
DROP TABLE IF EXISTS public.players CASCADE;
DROP TABLE IF EXISTS public.rooms CASCADE;
DROP TABLE IF EXISTS public.profiles CASCADE;
DROP TABLE IF EXISTS public.game_users CASCADE;

-- 2. Enable Extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 3. Custom Users (Our Name/Password System)
CREATE TABLE public.game_users (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_text TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 4. Profiles (Linked to our CUSTOM game_users, NOT Supabase Auth)
CREATE TABLE public.profiles (
    id UUID REFERENCES public.game_users(id) ON DELETE CASCADE PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    avatar_url TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 5. Rooms
CREATE TABLE public.rooms (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    room_code TEXT UNIQUE NOT NULL,
    host_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    status TEXT DEFAULT 'lobby' CHECK (status IN ('lobby', 'playing', 'ended')),
    current_turn_index INTEGER DEFAULT 0,
    round_number INTEGER DEFAULT 1,
    max_rounds INTEGER DEFAULT 10,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    market_trend_info JSONB DEFAULT '{}'::jsonb
);

-- 6. Players
CREATE TABLE public.players (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    room_id UUID REFERENCES public.rooms(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    cash BIGINT DEFAULT 100000,
    position INTEGER DEFAULT 0,
    color TEXT,
    is_ready BOOLEAN DEFAULT false,
    turn_order INTEGER,
    chairman_chips JSONB DEFAULT '{}'::jsonb,
    net_worth BIGINT DEFAULT 100000,
    UNIQUE(room_id, user_id)
);

-- 7. Stocks
CREATE TABLE public.stocks (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    room_id UUID REFERENCES public.rooms(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    symbol TEXT NOT NULL,
    current_price INTEGER NOT NULL,
    base_price INTEGER NOT NULL,
    volatility TEXT DEFAULT 'medium',
    color TEXT
);

-- 8. Portfolios
CREATE TABLE public.portfolios (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    player_id UUID REFERENCES public.players(id) ON DELETE CASCADE,
    stock_id UUID REFERENCES public.stocks(id) ON DELETE CASCADE,
    quantity INTEGER DEFAULT 0,
    average_buy_price INTEGER DEFAULT 0,
    UNIQUE(player_id, stock_id)
);

-- 9. Game Logs
CREATE TABLE public.game_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    room_id UUID REFERENCES public.rooms(id) ON DELETE CASCADE,
    message TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- 10. Auto-Profile Trigger
CREATE OR REPLACE FUNCTION public.handle_new_user() 
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, username)
  VALUES (new.id, new.username)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_user_created ON public.game_users;
CREATE TRIGGER on_user_created
  AFTER INSERT OR UPDATE ON public.game_users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 11. Permissions
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated, service_role;

-- 12. "God Mode" RLS Policies (Open Access)
DO $$ 
DECLARE 
    t TEXT;
BEGIN
    FOR t IN SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' 
    LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
        EXECUTE format('DROP POLICY IF EXISTS "Open Access" ON public.%I', t);
        EXECUTE format('CREATE POLICY "Open Access" ON public.%I FOR ALL USING (true) WITH CHECK (true)', t);
    END LOOP;
END $$;

-- 13. Enable Realtime
BEGIN;
  DROP PUBLICATION IF EXISTS supabase_realtime;
  CREATE PUBLICATION supabase_realtime FOR ALL TABLES;
COMMIT;
