-- NOTE: All access via supabaseAdmin (service role).
-- No anon access granted by design.

-- Demo personalizzate per l'outreach (/demo/<slug>, slug sempre "demo-…").
-- Usata da artifacts/api-server/src/lib/demoProspects.ts e routes/demo-prospects.ts.
-- Esegui in Supabase → SQL Editor.

create table if not exists public.demo_prospects (
  id bigint generated always as identity primary key,
  -- UNIQUE è necessario: la creazione ritenta su violazione 23505 (slug già usato).
  slug text not null unique,
  property_name text not null,
  manual_content text not null,
  suggested_question text,
  first_message_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.demo_prospects enable row level security;
