-- Stripe-ready: clienti e abbonamenti per host (FK su hosts.id = bigserial).
-- NON eseguito automaticamente: applica manualmente in Supabase → SQL Editor.
-- Il backend usa il service role; RLS senza policy = negato per anon/auth JWT.

-- ─── stripe_customers ───────────────────────────────────────────────────────
create table if not exists public.stripe_customers (
  id uuid primary key default gen_random_uuid(),
  host_id bigint not null references public.hosts (id) on delete cascade,
  stripe_customer_id text not null unique,
  created_at timestamptz not null default now()
);

create index if not exists stripe_customers_host_id_idx on public.stripe_customers (host_id);

alter table public.stripe_customers enable row level security;

-- ─── subscriptions ───────────────────────────────────────────────────────────
create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  host_id bigint not null references public.hosts (id) on delete cascade,
  stripe_subscription_id text not null unique,
  stripe_price_id text not null,
  status text not null default 'inactive',
  -- active | inactive | past_due | canceled | trialing
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists subscriptions_host_id_idx on public.subscriptions (host_id);
create index if not exists subscriptions_status_idx on public.subscriptions (status);

alter table public.subscriptions enable row level security;
