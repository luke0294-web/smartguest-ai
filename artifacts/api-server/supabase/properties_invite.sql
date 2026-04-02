-- Invito host post-conversione lead: token monouso su properties (setup password).
-- Esegui in Supabase → SQL Editor dopo ceo_hosts_leads.sql.

alter table public.properties add column if not exists invite_token text;
alter table public.properties add column if not exists invite_token_expires_at timestamptz;

create unique index if not exists properties_invite_token_uidx
  on public.properties (invite_token)
  where invite_token is not null;
