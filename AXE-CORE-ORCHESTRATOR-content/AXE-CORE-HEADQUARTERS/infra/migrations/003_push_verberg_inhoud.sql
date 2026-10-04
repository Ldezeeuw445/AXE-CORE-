-- Privacy op het slotscherm, per apparaat.
--
-- Een melding toont zijn volledige titel op een vergrendeld scherm, ook voor wie
-- naast je zit. Met `verberg_inhoud` aan krijgt DIT apparaat alleen "AXE has
-- something" te zien; de inhoud staat er pas als je de app opent.
--
-- ## Waarom op de abonnementsrij en niet op de gebruiker
--
-- Het is een eigenschap van het toestel, niet van de persoon: de iPhone in je
-- zak wil het verbergen, de Mac op je bureau hoeft dat niet. Eén rij per
-- apparaat bestond al (het endpoint is de sleutel), dus de keuze hoort daarbij.
--
-- Standaard uit: wie niets aanraakt krijgt het gedrag van vóór deze kolom.
--
-- Eén opdracht per aanroep toepassen: in één keer doorduwen loopt op dit project
-- in een timeout en past dan niets toe (zie 002_push_meldingen.sql).

alter table public.core_push_subscriptions
  add column if not exists verberg_inhoud boolean not null default false;
