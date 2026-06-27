create table if not exists public.agent_queries (
  id         uuid        primary key default gen_random_uuid(),
  question   text        not null,
  city       text,
  created_at timestamptz not null default now()
);
create table if not exists public.page_visits (
  id         uuid        primary key default gen_random_uuid(),
  created_at timestamptz not null default now()
);
alter table public.agent_queries enable row level security;
alter table public.page_visits   enable row level security;
create policy "insert_agent_queries" on public.agent_queries for insert with check (true);
create policy "insert_page_visits"   on public.page_visits   for insert with check (true);
