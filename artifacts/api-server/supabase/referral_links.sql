-- Run in Supabase → SQL Editor (service role / migration).
-- Referral & partnership links for host-configured suggestions in guest chat.

ALTER TABLE public.properties
ADD COLUMN IF NOT EXISTS referral_links TEXT;
