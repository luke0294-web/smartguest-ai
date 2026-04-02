-- Tabelle per Dashboard CEO: hosts, leads + colonne opzionali su properties (reset password).
-- Esegui in Supabase → SQL Editor. Il backend usa SUPABASE_ANON_KEY: policy permissive solo per test.

-- ─── hosts (login host / password gestita dal CEO) ─────────────────────────
create table if not exists public.hosts (
  id bigserial primary key,
  email text not null unique,
  host_password text not null,
  created_at timestamptz not null default now()
);

create index if not exists hosts_email_lower_idx on public.hosts (lower(email));

alter table public.hosts enable row level security;

drop policy if exists "hosts_anon_select" on public.hosts;
drop policy if exists "hosts_anon_insert" on public.hosts;
drop policy if exists "hosts_anon_update" on public.hosts;
drop policy if exists "hosts_anon_delete" on public.hosts;

create policy "hosts_anon_select" on public.hosts for select to anon using (true);
create policy "hosts_anon_insert" on public.hosts for insert to anon with check (true);
create policy "hosts_anon_update" on public.hosts for update to anon using (true) with check (true);
create policy "hosts_anon_delete" on public.hosts for delete to anon using (true);

-- ─── leads (registrazione / landing) ────────────────────────────────────────
create table if not exists public.leads (
  id bigserial primary key,
  host_name text not null,
  email text not null,
  property_name text not null,
  status text not null default 'Nuovo',
  created_at timestamptz not null default now()
);

create index if not exists leads_created_at_idx on public.leads (created_at desc);

alter table public.leads enable row level security;

drop policy if exists "leads_anon_insert" on public.leads;
drop policy if exists "leads_anon_select" on public.leads;
drop policy if exists "leads_anon_update" on public.leads;
drop policy if exists "leads_anon_delete" on public.leads;

-- In produzione limita INSERT al solo form pubblico (es. service role o edge function).
create policy "leads_anon_insert" on public.leads for insert to anon with check (true);
create policy "leads_anon_select" on public.leads for select to anon using (true);
create policy "leads_anon_update" on public.leads for update to anon using (true) with check (true);
create policy "leads_anon_delete" on public.leads for delete to anon using (true);

-- ─── properties: colonne usate da auth reset / full-edit CEO (se mancano) ─
alter table public.properties add column if not exists reset_token text;
alter table public.properties add column if not exists reset_requested_at timestamptz;
alter table public.properties add column if not exists host_password text;
