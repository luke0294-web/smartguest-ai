-- NOTE: All access via supabaseAdmin (service role).
-- No anon access granted by design.

-- Tabella log chat Marco (allineata a Drizzle lib/db chat_logs + POST /properties/:slug/chat).
-- Esegui in Supabase → SQL Editor.

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

drop policy if exists "chat_logs_anon_insert" on public.chat_logs;
drop policy if exists "chat_logs_anon_select" on public.chat_logs;
drop policy if exists "chat_logs_anon_update" on public.chat_logs;
drop policy if exists "chat_logs_anon_delete" on public.chat_logs;
