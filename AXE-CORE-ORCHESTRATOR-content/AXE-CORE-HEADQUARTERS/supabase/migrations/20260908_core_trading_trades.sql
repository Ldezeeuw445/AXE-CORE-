-- core_trading_trades: one row per AXE Algo trade, open -> closed, joining
-- entry rationale to exit outcome. Replaces the fragmented picture spread
-- across the 200-cap paper mirror, the ~20-trace rolling decision log, the
-- ~2-day cycle journal and the write-only Obsidian per-trade notes: none of
-- those is queryable, none joins "why it entered" to "what happened", and
-- none survives past its own cap/window.
--
-- Written 2026-09-08 following the Phase 2 audit in AXE_ARCHITECTURE.md /
-- AXE_PROGRESS.md. Deliberately NOT reusing broker_trades / positions
-- (uuid-keyed against a different, unrelated "accounts" table) or
-- mt5_positions / mt5_closed_positions (right shape, split across two
-- tables with no entry+exit join and no strategy/confidence/rationale
-- columns at all) — ARCHITECTURE.md's 2026-08-23 audit explicitly
-- recommended against forcing those into a new use rather than starting
-- clean, since account_id there is a different id space (uuid vs MetaAPI's
-- text account ids).

create table if not exists public.core_trading_trades (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,

  -- Join key back to the app's own record of the trade (the DemoTrade-shaped
  -- id minted in demoTradingService.executeDemoTrade, reused for both the
  -- paper book and every MetaAPI-mirrored live fill). Nullable because a
  -- broker-side close the reconciler cannot match to an open row still gets
  -- recorded, just without an entry side.
  local_trade_id text,

  -- MetaAPI account id (text — matches mt5_positions/mt5_closed_positions'
  -- convention, NOT public.accounts.id which is a uuid for a different
  -- account model entirely). Null for a pure-paper trade.
  account_id text,
  -- Label snapshot at write time, not a live join to tradingAccountsService —
  -- account labels can be renamed later and this row should keep saying what
  -- it said when the trade happened.
  account_label text,
  venue text not null default 'paper', -- 'paper' | 'metaapi'

  symbol text not null,
  side text not null, -- 'buy' | 'sell'
  qty numeric,

  entry_price numeric,
  exit_price numeric,
  stop_loss numeric,
  take_profit numeric,

  strategy text,
  framework text,
  timeframe text,
  confidence real, -- entry-time confidence, 0-1
  rationale text, -- entry reason/comment, uncapped (vs DemoTrade's 500-char cap)
  intel_report_id text,
  comment text, -- the MT5 31-char order comment, for cross-referencing broker records

  status text not null default 'open', -- 'open' | 'closed'
  pnl numeric,
  return_pct numeric,
  exit_reason text,

  obsidian_note_path text, -- links to the per-trade note tradeNotesService already writes

  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists core_trading_trades_status_idx on public.core_trading_trades (status);
create index if not exists core_trading_trades_account_idx on public.core_trading_trades (account_id);
create index if not exists core_trading_trades_symbol_idx on public.core_trading_trades (symbol);
create index if not exists core_trading_trades_local_id_idx on public.core_trading_trades (local_trade_id);
create index if not exists core_trading_trades_opened_at_idx on public.core_trading_trades (opened_at desc);

alter table public.core_trading_trades enable row level security;

-- Same pattern as core_obsidian_notes (svc_core_obsidian_notes: ALL/true) —
-- this is single-user personal software talking to its own Supabase project,
-- not multi-tenant SaaS, and the rest of the trading-desk code (tradeNotesService,
-- coreDB.ts) already writes core_* tables the same unauthenticated-open way.
-- Matching it here rather than inventing a stricter auth.uid()-scoped policy
-- avoids silently breaking inserts from code paths that don't reliably carry
-- a Supabase auth session.
drop policy if exists svc_core_trading_trades on public.core_trading_trades;
create policy svc_core_trading_trades on public.core_trading_trades
  for all using (true) with check (true);

comment on table public.core_trading_trades is
  'One row per AXE Algo trade (open -> closed), joining entry rationale (strategy, timeframe, confidence, comment) to exit outcome (pnl, return_pct, exit_reason). Written by tradingTradesService.ts.';
