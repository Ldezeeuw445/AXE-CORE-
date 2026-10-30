-- Fase 1: disable known-stale / failing schedules.
-- KEEP enabled: VPS 5-min git pull deploy path, AI provider proxy jobs,
-- NorthSea crews that still run, trading demo proposal jobs.
-- Apply manually with service role when ready. Read-only review first.

-- Known failing northsea engine tick (incident 2026-10-11); crews stay.
UPDATE public.core_schedules
SET enabled = false, updated_at = now()
WHERE job_key = 'northsea:engine'
  AND enabled = true;

-- Owner-acties that only poll stale "waiting" without a live owner path
UPDATE public.core_schedules
SET enabled = false, updated_at = now()
WHERE job_key ILIKE '%owner_act%'
  AND enabled = true
  AND last_status = 'fail';

-- Review: select job_key, enabled, last_status from core_schedules order by job_key;
