-- NorthSea P1c — housekeeping close-out van de P1-baseline (P1-instructie Luka, 2026-09-16).
-- Conservatief en idempotent: verandert geen historie, verzint geen herkomst, verwijdert niets.
-- Elke UPDATE heeft een WHERE-guard op de huidige (foute) toestand, dus opnieuw draaien is veilig.
--
-- Twee van de vier close-out-punten vergen GEEN wijziging en staan hier alleen ter documentatie:
--   * Item 1 (10-11 sep outbound zonder herkomst): blijft uitgesloten van automatische follow-up.
--     De engine volgt alleen berichten met canonieke herkomst op; northsea_communications_guard
--     houdt de herkomst bovendien onveranderlijk ("historical unknowns stay unknown"). Niets doen.
--   * Item 2 (Siki Rice mailbox-full bounce): info@sikirice.com heeft email_status='bounced' en
--     northsea_outbound_block_reason() geeft 'bounced_channel'. Adres blijft geblokkeerd tot een
--     contact met precies dat adres ná de bounce als 'valid' is herbevestigd. Niets doen.
--
-- Item 3 — De oude handmatige onderdruk-taak voor het gebouncede Thai Rice-adres is overbodig sinds
--   P1b hetzelfde op databaseniveau afdwingt (northsea_outbound_block_reason -> 'bounced_channel').
--   Taak afgesloten als 'completed'; rij en audit blijven bestaan (niet verwijderd). Bedrijf dbe1c54c
--   blijft review_required (door P1b gezet); het adres wordt nooit automatisch opnieuw geprobeerd.
--
-- Item 4 — TradeWheel / "Ahad Bagheri - marketplace buyer" (83c4a87d): de drie inbound e-mails zijn
--   TradeWheel-PLATFORMmail aan NorthSea's eigen account (verify/onboarding/"decorate your shop"),
--   geen bericht van de koper. Eén ervan ("Do You like an Empty Pawn Shop?", b219840b) was aan
--   opportunity 4cbc2ade gekoppeld, en een automatisch concept-antwoord naar noreply@tradewheel.com
--   (1bf81e6f) stond als enige goedkeuring open en vormde daarmee de deal-blocker (approval_pending).
--   Marketing/platformmail mag een deal nooit sturen -> koppeling losgemaakt en concept afgewezen.
--   De koper-RFQ (0b65c567, publieke TradeWheel-RFQ voor Copper Cathode) is echt en blijft ongewijzigd;
--   de opportunity blijft bestaan (unqualified) op basis van die RFQ, niet van de marketingmail.

-- Item 3 ----------------------------------------------------------------------
update public.action_queue
   set status = 'completed', completed_at = now(), updated_at = now(),
       metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
         'resolved_by', 'P1 housekeeping 2026-09-16',
         'reason', 'Superseded by P1b: bounced address enforced at DB level (northsea_outbound_block_reason=bounced_channel). Company dbe1c54c stays review_required; the bounced address is never auto-retried.')
 where id = '06cf5c19-a42b-4b16-a961-036deb1473fb'
   and status <> 'completed';

-- Item 4a — marketing/platformmail loskoppelen van de deal ---------------------
update public.communications
   set opportunity_id = null
 where id = 'b219840b-2b97-4344-8c4f-715dc2cac2f3'
   and opportunity_id = '4cbc2ade-8005-44eb-ab6e-38fda7522136';

-- Item 4b — het automatische concept naar de marketing-noreply afwijzen --------
-- (dit was de enige openstaande goedkeuring en dus de kunstmatige deal-blocker).
update public.reply_drafts
   set approval_status = 'rejected', lifecycle_state = 'rejected', updated_at = now()
 where id = '1bf81e6f-49d4-4bb8-bd46-d3d52b6109de'
   and approval_status = 'pending'
   and to_email = 'noreply@tradewheel.com';

-- Expliciet, door-mens-geautoriseerd auditspoor voor de correctie. De reply_drafts-wijziging
-- logt zichzelf ook via northsea_reply_drafts_audit; deze regel legt het WAAROM + item 3/4a vast.
insert into public.northsea_audit_events (actor_type, actor, action, opportunity_id, company_id, communication_id, details)
select 'human', 'luka', 'p1_housekeeping_mapping_correction',
       '4cbc2ade-8005-44eb-ab6e-38fda7522136', '83c4a87d-ff4d-4128-935b-73b320491cc1', 'b219840b-2b97-4344-8c4f-715dc2cac2f3',
       jsonb_build_object(
         'source', 'P1 close-out instruction 2026-09-16',
         'item3_task_completed', '06cf5c19-a42b-4b16-a961-036deb1473fb',
         'item4_detached_communication', 'b219840b-2b97-4344-8c4f-715dc2cac2f3',
         'item4_rejected_draft', '1bf81e6f-49d4-4bb8-bd46-d3d52b6109de',
         'evidence', 'TradeWheel platform onboarding/marketing mail to NorthSea own account (noreply@tradewheel.com); not buyer correspondence. Buyer RFQ 0b65c567 (public TradeWheel Copper Cathode RFQ) is genuine and unchanged.',
         'invariant', 'marketing/newsletter communication must never influence deal qualification, readiness, blockers or progress')
 where not exists (
   select 1 from public.northsea_audit_events
    where action = 'p1_housekeeping_mapping_correction'
      and communication_id = 'b219840b-2b97-4344-8c4f-715dc2cac2f3');
