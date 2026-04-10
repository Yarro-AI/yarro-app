-- Sprint E, Part 2: Drop extras RPC
-- All items are now tickets in c1_get_dashboard_todo. No separate extras source.

DROP FUNCTION IF EXISTS public.c1_get_dashboard_todo_extras(uuid);
