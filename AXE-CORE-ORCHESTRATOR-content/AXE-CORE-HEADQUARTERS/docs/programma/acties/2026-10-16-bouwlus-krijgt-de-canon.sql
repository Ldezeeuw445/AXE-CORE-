-- De bouwlus (core_bouw_aanvullen, elk uur; de planner op de Mac voert hem uit)
-- kreeg tot nu toe geen opdracht: hij koos "iets waardevols" uit de README.
-- Hiermee werkt hij de programmataken uit docs/programma/programma.json af, in volgorde.
-- Plakken in Supabase -> project AXE Companion (pqnngpcgbdwxavbatbia) -> SQL Editor -> Run.
-- Terugdraaien: update public.core_bouw_apps set opdracht = null where repo in ('trading-os','axe-companion','axon-memory');

update public.core_bouw_apps set updated_at = now(), opdracht = case repo
when 'trading-os' then $o$PROGRAMME (AXE Core docs/programma, programma.json). This repo is Trading OS; product canon: the Trading OS master spec, phases T0-T10, foundation first. Work these tasks in order and start your report with the task id:
1) TOS-SEC-4: no provider API key may reach the browser bundle (Polygon, TwelveData, FMP, FRED keys only server-side via engine-proxy), and every fallback or demo value (hardcoded $100,000 net worth, BREAKING headlines, ticker, random order book, random fallback quotes, candles and macro) is labelled as sample data, never as live.
2) T4: persist chart drawings per user, symbol and timeframe in Supabase (own rows, RLS on user_id), without the external Python service.
3) T5: a local indicator engine in TypeScript (EMA, SMA, RSI, MACD, ATR, VWAP) with unit tests, used by the chart instead of the missing VITE_TRADING_TERMINAL_API_URL service.
Never touch billing, broker execution, secrets or production data; never weaken auth or RLS.
$o$
when 'axe-companion' then $o$PROGRAMME (AXE Core docs/programma, programma.json). This repo is AXE Companion, mobile first; product canon: the AXE Companion master spec, phases C0-C10. Another session works on branch claude/axe-companion-audit-launch-nz58dg, so keep changes small and in separate files where you can. Work these tasks in order and start your report with the task id:
1) INTEL-FREE: insider trades, congressional trades and short volume work without Unusual Whales: SEC EDGAR Form 4 or FMP insider trading for insiders, FMP senate and house trading for Congress, FINRA daily short sale volume for short volume. Unusual Whales stays optional behind UNUSUAL_WHALES_ENABLED; a failing source shows as unavailable with its reason instead of failing the whole intel view.
2) C6: prove push end to end (a watcher alert reaches a subscribed device) and add a test for the delivery path.
3) TOS-SEC-2 prep: the MT5 sync writes (src/app/actions/mt5Cloud.ts, runCloudMt5Sync) go through a server-side service client, so user write rights on broker_trades and user_broker_accounts can be removed later.
Never touch billing, live trading execution, secrets or production data.
$o$
when 'axon-memory' then $o$PROGRAMME (AXE Core docs/programma, programma.json). This repo is AXON Memory; product canon: the AXON master spec, phases A0-A12. PR Ldezeeuw445/axon-memory-app#2 already fixes api_keys RLS, the missing notes in the context pack, the consent screen and PKCE: do not redo those. Work these tasks in order and start your report with the task id:
1) AXON-A3: every item in the context pack carries its memory_items id and its source, with a test that proves it.
2) AXON-A4: retire, update and delete a memory through MCP tools (owner-scoped), with tests.
3) A10 copy only: remove forbidden UI words and the "Most chosen" and "Limited founder pricing" copy; show the top plan as Power in copy (do not rename plan keys, Stripe products or entitlements).
Never touch billing, secrets or production data.
$o$
else opdracht end
where repo in ('trading-os', 'axe-companion', 'axon-memory')
returning repo, left(opdracht, 70) as begin;
