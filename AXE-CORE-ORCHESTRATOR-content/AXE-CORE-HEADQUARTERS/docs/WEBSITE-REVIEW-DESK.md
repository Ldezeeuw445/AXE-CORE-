# Website Review Desk in Finance

Open Finance en kies Website Review Desk. Het bestaande grootboek blijft apart;
doelen, voorstellen en snapshots worden nooit als inkomsten geboekt.

De pagina leest de sleutel `axe_website_review_desk_v1` uit `user_settings`,
begrensd op de ingelogde eigenaar. De bestaande RLS blijft verantwoordelijk voor
toegang. Geen rapport, klantgegevens, sleutels of privésnapshot in de bundel.
Geen lokale cache die na uitloggen gegevens van de vorige eigenaar kan tonen.

Het rapportmodel en de validatie staan in `reviewDeskService.ts`. Datums zijn
ISO8601 met tijdzone, links uitsluitend HTTPS. Tekst wordt als tekst gerenderd,
niet als HTML of instructie. `null` betekent onbekend, nul is een waarneming.

De weergave haalt iedere minuut de opgeslagen versie op zolang zij open staat.
Dit is geen directe Stripe/Gmail/Metricool-poll. De bestaande externe dagelijkse
controle onderhoudt het rapport. Elke waarneming behoudt haar eigen `asOf`;
`updatedAt` zegt alleen wanneer het rapport is bijgewerkt. Bij een bronfout geen
nul invullen of datum verversen. Noteer de fout met behoud van oude waarneming.

Instructie voor een uitvoerende agent:

> Lees het eigenaargebonden rapport, controleer de oorspronkelijke bronnen en
> werk uitsluitend aantoonbare veranderingen bij. Behoud het gevalideerde schema,
> historische controledatums en onbekende waarden. Maak bij nieuwe interesse een
> briefingoverzicht en antwoordconcept. Tel betalingen niet dubbel en houd doelen
> buiten werkelijke inkomsten. Update met een voorwaarde op de eerder gelezen
> `updated_at`; lees na een conflict opnieuw. Controleer de opgeslagen uitkomst.
> Publiceer nooit de rapportinhoud in Git, openbare pagina’s of logs.

Beveiligingstest: uitgelogd/ander account mag deze rij niet lezen. Dezelfde
geauthenticeerde eigenaar gebruikt dezelfde rij op desktop, iPad en iPhone.
Zonder geldige sessie toont de pagina een inlogmelding, geen verzonnen cijfers.
