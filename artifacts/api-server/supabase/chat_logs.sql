-- Tabella log chat Marco (allineata a Drizzle lib/db chat_logs + POST /properties/:slug/chat).
-- Esegui in Supabase → SQL Editor. Poi verifica RLS: il backend usa SUPABASE_ANON_KEY.

create table if not exists public.chat_logs (
  id bigserial primary key,
  property_slug varchar(255) not null,
  guest_message text not null,
  marco_reply text not null,
  resolved boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists chat_logs_property_slug_idx
  on public.chat_logs (property_slug);

create index if not exists chat_logs_property_slug_created_at_idx
  on public.chat_logs (property_slug, created_at desc);

alter table public.chat_logs enable row level security;

-- Il server API usa la chiave anon: policy permissive (restringi in produzione, es. service_role solo server).
create policy "chat_logs_anon_insert"
  on public.chat_logs
  for insert
  to anon
  with check (true);

create policy "chat_logs_anon_select"
  on public.chat_logs
  for select
  to anon
  using (true);

create policy "chat_logs_anon_update"
  on public.chat_logs
  for update
  to anon
  using (true)
  with check (true);
