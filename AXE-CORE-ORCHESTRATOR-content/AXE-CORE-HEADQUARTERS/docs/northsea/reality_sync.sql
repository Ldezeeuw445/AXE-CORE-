-- NorthSea reality sync (Gmail RO, okt 2026). No secrets.
-- Apply once against Supabase/Postgres for opportunities lagging behind mail.
BEGIN;

-- Harcros: NCNDA+FPA signed 29 Oct → buyer intro
UPDATE opportunities o
SET stage = 'introduced',
    execution_state = 'docs_signed',
    next_action = 'Prepare buyer intro pack (NCNDA+FPA signed 29 Oct).',
    next_action_at = now(),
    updated_at = now()
WHERE o.stage NOT IN ('won', 'lost')
  AND (
    EXISTS (
      SELECT 1 FROM companies c
      WHERE c.id = o.supplier_id AND lower(c.name) LIKE '%harcros%'
    )
    OR lower(coalesce(o.supplier_name, '')) LIKE '%harcros%'
  );

-- Brixlegg: indication; NCNDA pending; Sandra OOO until 4 Nov
UPDATE opportunities o
SET stage = 'engaged',
    execution_state = 'indication_received',
    next_action = 'Send NCNDA when Sandra returns (OOO until 4 Nov).',
    next_action_at = '2026-11-04T08:00:00Z'::timestamptz,
    updated_at = now()
WHERE o.stage NOT IN ('won', 'lost')
  AND (
    EXISTS (
      SELECT 1 FROM companies c
      WHERE c.id = o.supplier_id AND lower(c.name) LIKE '%brixlegg%'
    )
    OR lower(coalesce(o.supplier_name, '')) LIKE '%brixlegg%'
  );

COMMIT;
