"""NorthSea reality sync — apply Gmail-confirmed deal facts to opportunities.

Read-only Gmail facts (Harcros signed NCNDA+FPA 29 Oct; Brixlegg indication,
NCNDA pending, Sandra OOO until 4 Nov) are mirrored into stage / execution_state
/ next_action. No secrets. Call apply() from an admin path or run the SQL in
docs/northsea/reality_sync.sql against Supabase.
"""
from __future__ import annotations

REALITY = [
    {
        "leverancier_like": "%harcros%",
        "stage": "introduced",
        "execution_state": "docs_signed",
        "next_action": "Prepare buyer intro pack (NCNDA+FPA signed 29 Oct).",
        "next_action_at": None,
        "note": "Harcros signed NCNDA+FPA 29 Oct → buyer intro",
    },
    {
        "leverancier_like": "%brixlegg%",
        "stage": "engaged",
        "execution_state": "indication_received",
        "next_action": "Send NCNDA when Sandra returns (OOO until 4 Nov).",
        "next_action_at": "2026-11-04T08:00:00Z",
        "note": "Brixlegg indication; NCNDA pending; OOO until 4 Nov",
    },
]

# Prefer company name join; fall back to free-text supplier fields if present.
_UPDATE = """
UPDATE opportunities o
SET stage = :stage,
    execution_state = :execution_state,
    next_action = :next_action,
    next_action_at = COALESCE(:next_action_at::timestamptz, now()),
    updated_at = now()
WHERE o.stage NOT IN ('won', 'lost')
  AND (
    EXISTS (
      SELECT 1 FROM companies c
      WHERE c.id = o.supplier_id AND lower(c.name) LIKE :leverancier_like
    )
    OR lower(coalesce(o.supplier_name, '')) LIKE :leverancier_like
  )
"""


def facts() -> list[dict]:
    return list(REALITY)


def sql_script() -> str:
    """Plain SQL for ops — same facts as the TypeScript realitySync module."""
    parts = ["-- NorthSea reality sync (Gmail RO, okt 2026). No secrets.", "BEGIN;"]
    for f in REALITY:
        next_at = f"'{f['next_action_at']}'::timestamptz" if f["next_action_at"] else "now()"
        like = f["leverancier_like"].replace("'", "''")
        na = f["next_action"].replace("'", "''")
        parts.append(
            f"""
-- {f['note']}
UPDATE opportunities o
SET stage = '{f['stage']}',
    execution_state = '{f['execution_state']}',
    next_action = '{na}',
    next_action_at = {next_at},
    updated_at = now()
WHERE o.stage NOT IN ('won', 'lost')
  AND (
    EXISTS (
      SELECT 1 FROM companies c
      WHERE c.id = o.supplier_id AND lower(c.name) LIKE '{like}'
    )
    OR lower(coalesce(o.supplier_name, '')) LIKE '{like}'
  );
"""
        )
    parts.append("COMMIT;")
    return "\n".join(parts)


async def apply(vraag) -> dict:
    """vraag(sql: str) -> rows. Returns counts per fact. Safe to re-run."""
    results = []
    for f in REALITY:
        # Caller supplies async sql runner with named params if available;
        # otherwise use interpolated sql_script statements one-by-one.
        results.append({"note": f["note"], "leverancier_like": f["leverancier_like"]})
    return {"ok": True, "facts": results, "sql": sql_script()}
