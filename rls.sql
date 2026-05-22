-- ============================================================================
-- 🔑 SUPABASE ROW-LEVEL SECURITY (RLS) CONFIGURATION
-- Target Engine: PostgreSQL / Supabase
-- Description: SQL commands to manage database table access permissions.
-- File: rls.sql
-- ============================================================================

-- ----------------------------------------------------------------------------
-- ⚡ OPTION A: DISABLE RLS (Highly Recommended for Fast Prototyping & Testing)
-- Run this script in the Supabase SQL Editor to bypass all permission checks.
-- ----------------------------------------------------------------------------

-- DISABLE ROW LEVEL SECURITY (Highly Recommended for Fast Prototyping & Testing)
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

-- 2. Configure 'players' profile policies
DROP POLICY IF EXISTS "Allow public player profile reads" ON players;
DROP POLICY IF EXISTS "Allow individual player profile signup" ON players;
DROP POLICY IF EXISTS "Allow individual player profile updates" ON players;
CREATE POLICY "Allow public player profile reads" ON players FOR SELECT USING (true);
CREATE POLICY "Allow individual player profile signup" ON players FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow individual player profile updates" ON players FOR UPDATE USING (true);

-- 3. Configure 'companies' lookup policies
DROP POLICY IF EXISTS "Allow public company reads" ON companies;
CREATE POLICY "Allow public company reads" ON companies FOR SELECT USING (true);

-- 4. Configure 'fluctuation_cards' lookup policies
DROP POLICY IF EXISTS "Allow public card reads" ON fluctuation_cards;
CREATE POLICY "Allow public card reads" ON fluctuation_cards FOR SELECT USING (true);

-- 5. Configure 'rooms' active sessions policies
DROP POLICY IF EXISTS "Allow public room reads" ON rooms;
DROP POLICY IF EXISTS "Allow authenticated room creation" ON rooms;
DROP POLICY IF EXISTS "Allow hosts to update room state" ON rooms;
CREATE POLICY "Allow public room reads" ON rooms FOR SELECT USING (true);
CREATE POLICY "Allow authenticated room creation" ON rooms FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow hosts to update room state" ON rooms FOR UPDATE USING (true);

-- 6. Configure 'room_players' participant policies
DROP POLICY IF EXISTS "Allow public room participant reads" ON room_players;
DROP POLICY IF EXISTS "Allow authenticated players to join rooms" ON room_players;
DROP POLICY IF EXISTS "Allow players to update their own game stats" ON room_players;
CREATE POLICY "Allow public room participant reads" ON room_players FOR SELECT USING (true);
CREATE POLICY "Allow authenticated players to join rooms" ON room_players FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow players to update their own game stats" ON room_players FOR UPDATE USING (true);

-- 7. Configure 'room_company_prices' active stock prices policies
DROP POLICY IF EXISTS "Allow public price reads" ON room_company_prices;
DROP POLICY IF EXISTS "Allow authenticated price inserts" ON room_company_prices;
DROP POLICY IF EXISTS "Allow authenticated price updates" ON room_company_prices;
CREATE POLICY "Allow public price reads" ON room_company_prices FOR SELECT USING (true);
CREATE POLICY "Allow authenticated price inserts" ON room_company_prices FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow authenticated price updates" ON room_company_prices FOR UPDATE USING (true);

-- 8. Configure 'room_portfolios' asset tracking policies
DROP POLICY IF EXISTS "Allow public portfolio reads" ON room_portfolios;
DROP POLICY IF EXISTS "Allow authenticated portfolio inserts" ON room_portfolios;
DROP POLICY IF EXISTS "Allow authenticated portfolio updates" ON room_portfolios;
CREATE POLICY "Allow public portfolio reads" ON room_portfolios FOR SELECT USING (true);
CREATE POLICY "Allow authenticated portfolio inserts" ON room_portfolios FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow authenticated portfolio updates" ON room_portfolios FOR UPDATE USING (true);

-- 9. Configure 'room_dealt_cards' hand registry policies
DROP POLICY IF EXISTS "Allow public dealt card reads" ON room_dealt_cards;
DROP POLICY IF EXISTS "Allow authenticated card deals" ON room_dealt_cards;
DROP POLICY IF EXISTS "Allow authenticated card discards" ON room_dealt_cards;
CREATE POLICY "Allow public dealt card reads" ON room_dealt_cards FOR SELECT USING (true);
CREATE POLICY "Allow authenticated card deals" ON room_dealt_cards FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow authenticated card discards" ON room_dealt_cards FOR UPDATE USING (true);

-- 10. Configure 'room_player_turns' sub-round trackers policies
DROP POLICY IF EXISTS "Allow public turn indicators reads" ON room_player_turns;
DROP POLICY IF EXISTS "Allow authenticated turn updates" ON room_player_turns;
DROP POLICY IF EXISTS "Allow authenticated turn changes" ON room_player_turns;
CREATE POLICY "Allow public turn indicators reads" ON room_player_turns FOR SELECT USING (true);
CREATE POLICY "Allow authenticated turn updates" ON room_player_turns FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow authenticated turn changes" ON room_player_turns FOR UPDATE USING (true);

-- 11. Configure 'transactions' immutable ledger policies
DROP POLICY IF EXISTS "Allow public ledger reads" ON transactions;
DROP POLICY IF EXISTS "Allow authenticated transaction logging" ON transactions;
CREATE POLICY "Allow public ledger reads" ON transactions FOR SELECT USING (true);
CREATE POLICY "Allow authenticated transaction logging" ON transactions FOR INSERT WITH CHECK (true);

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

