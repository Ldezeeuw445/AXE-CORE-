-- ============================================================
-- core_llm_models
-- Central registry for model metadata used by the AXE CORE router.
-- Keeps Ollama models separated so routing can target qwen/deepseek/llama/etc.
-- ============================================================

create table if not exists public.core_llm_models (
  id              uuid primary key default gen_random_uuid(),
  name            text not null unique,
  display_name    text not null,
  provider        text not null default 'ollama',
  category        text not null default 'general',
  description     text not null default '',
  priority        integer not null default 999,
  enabled         boolean not null default true,
  metadata        jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_core_llm_models_provider on public.core_llm_models(provider);
create index if not exists idx_core_llm_models_priority on public.core_llm_models(priority);

alter table public.core_llm_models enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'core_llm_models'
      and policyname = 'svc_core_llm_models'
  ) then
    create policy svc_core_llm_models on public.core_llm_models using (true);
  end if;
end $$;

insert into public.core_llm_models (name, display_name, provider, category, description, priority, enabled, metadata) values
  ('qwen2.5-coder',      'Qwen2.5-Coder',      'ollama', 'code',        'Code schrijven, refactors, debugging',        1, true, '{}'::jsonb),
  ('deepseek-coder-v2',   'DeepSeek-Coder-V2',   'ollama', 'code',        'Grote codebases, programmeren',               2, true, '{}'::jsonb),
  ('llama3.1:8b',        'Llama 3.1',          'ollama', 'analysis',    'Algemene agent taken, planning',              3, true, '{}'::jsonb),
  ('mistral:7b',         'Mistral 7B',         'ollama', 'lightweight', 'Lichtgewicht lokale agents',                  4, true, '{}'::jsonb),
  ('gemma3:4b',          'Gemma 3',            'ollama', 'general',     'Algemene assistentie',                         5, true, '{}'::jsonb)
on conflict (name) do nothing;
