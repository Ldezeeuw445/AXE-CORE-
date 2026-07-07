-- User settings table: persists AI keys and preferences per user across all browsers
create table if not exists public.user_settings (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  key         text not null,
  value       jsonb not null default '{}',
  updated_at  timestamptz not null default now(),
  unique(user_id, key)
);

alter table public.user_settings enable row level security;

-- Users can only access their own settings
create policy "user_settings_select" on public.user_settings
  for select using (auth.uid() = user_id);
create policy "user_settings_insert" on public.user_settings
  for insert with check (auth.uid() = user_id);
create policy "user_settings_update" on public.user_settings
  for update using (auth.uid() = user_id);
create policy "user_settings_delete" on public.user_settings
  for delete using (auth.uid() = user_id);

-- Also allow UPDATE on core_system_state for authenticated users (for health checks)
create policy "system_state_update" on public.core_system_state
  for update using (auth.role() = 'authenticated');
