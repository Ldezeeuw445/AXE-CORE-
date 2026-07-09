-- Add terminal and LangGraph to the live system-state registry

insert into public.core_system_state (service, display, status, enabled) values
  ('terminal',  'AXE Terminal',        'unknown', true),
  ('langgraph', 'LangGraph Orchestrator', 'unknown', true)
on conflict (service) do nothing;
