create table if not exists public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text,
  state jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "users can read their own profile state"
on public.profiles
for select
to authenticated
using (auth.uid() = user_id);

create policy "users can insert their own profile state"
on public.profiles
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "users can update their own profile state"
on public.profiles
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
