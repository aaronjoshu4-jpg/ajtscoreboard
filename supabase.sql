-- Run once in Supabase → SQL Editor. Creates a private table for the scoreboard.
create table if not exists public.ajt_kv (
  key text primary key,
  value text not null,
  ver bigint not null default 1,
  updated_at timestamptz not null default now()
);
-- Row level security ON with NO policies = the public/anon key can NOT read or write it.
-- Only the Netlify function (using your secret service key) can.
alter table public.ajt_kv enable row level security;
