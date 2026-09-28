-- NorthSea P1-C: governed automatic research gate. Alleen toevoegen; default UIT.
--
-- Zonder deze kolom (of met hem op false) verandert er niets: de engine vraagt dan bij
-- een onderzoekbare blokkade (seller_unqualified/buyer_unqualified) precies één keer per
-- deal+blokkade een Chase-item aan (action_queue, dedupe_key) in plaats van zelf te
-- betalen. Pas als dit expliciet op true staat, of als een mens dat ene Chase-item zelf
-- afrondt, mag de engine één begrensd, betaald onderzoek uitvoeren voor die deal+blokkade
-- -- nooit vaker, nooit stilzwijgend elke 15 minuten.
alter table public.deal_automation_policy
  add column if not exists auto_investigate_blockers boolean not null default false,
  add column if not exists auto_investigate_blockers_max_calls_per_day integer not null default 0;

comment on column public.deal_automation_policy.auto_investigate_blockers is
  'Staat de engine toe zelf (betaald) onderzoek te starten op een onderzoekbare blokkade, '
  'zonder eerst een Chase-goedkeuring te vragen. Default false: veilig, geen automatische kosten.';
comment on column public.deal_automation_policy.auto_investigate_blockers_max_calls_per_day is
  'Harde bovengrens op het aantal automatische onderzoeksaanroepen per dag over alle deals heen, '
  'ook wanneer auto_investigate_blockers=true. 0 = geen (dus effectief uit, ook als de vlag aanstaat).';
