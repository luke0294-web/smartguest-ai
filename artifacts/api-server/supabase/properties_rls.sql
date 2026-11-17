-- Attiva la Row Level Security sulla tabella properties.
--
-- Il backend usa solo la service-role key (che ignora RLS), quindi questo
-- script non cambia nulla per l'app. Serve a chiudere l'accesso diretto via
-- PostgREST con la chiave anon/publishable: senza RLS chiunque abbia quella
-- chiave (è pubblica per definizione) potrebbe leggere o modificare tutte le
-- strutture, email degli host e token di invito/reset inclusi.
--
-- Nessuna policy viene creata di proposito: con RLS attiva e zero policy,
-- anon e authenticated non vedono nulla; la service role continua a funzionare.
--
-- Da eseguire una volta nello SQL Editor di Supabase. È idempotente.

alter table public.properties enable row level security;

-- Verifica: tutte le tabelle dell'app devono risultare con rowsecurity = true.
select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in ('properties', 'hosts', 'leads', 'chat_logs', 'demo_prospects', 'stripe_customers', 'subscriptions')
order by tablename;
