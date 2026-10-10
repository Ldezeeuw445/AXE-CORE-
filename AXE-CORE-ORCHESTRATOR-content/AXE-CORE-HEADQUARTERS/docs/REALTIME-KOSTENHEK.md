# Kostenhek voor AXE-spraak

Realtime-spraak heeft nu een eindige levensduur. De bestaande verbinding sluit
na 90 seconden zonder nieuwe spraak, na tien minuten totaal, na dertig
modelantwoorden of bij 20.000 gemeten sessietokens. Achtergrondtaken lopen
door; de gebruiker kan het gesprek met de microfoonknop weer beginnen.

`response.done.response.usage.total_tokens` wordt zonder tekst of audio bewaard
in `axe-realtime-usage-v1`. Dubbele response-ID's tellen niet opnieuw. Bij
50.000 tokens op een Amsterdamse kalenderdag weigert deze app-installatie
nieuwe spraaksessies. Cached input telt conservatief mee. Bij ontbrekende usage
of onbruikbare opslag sluit de verbinding, in plaats van ongemeten door te gaan.

Dit is een tokenplafond per browserprofiel/app-installatie, geen geldbedrag,
geen atomair budget over meerdere tabbladen en geen organisatiebreed OpenAI-
plafond. Andere apparaten, verwijderde lokale opslag en andere API-clients vallen
er niet onder. De laatste betaalde response kan het plafond overschrijden;
usage komt pas na die response binnen. Transcriptie wordt apart gefactureerd.

De GA-sessie stuurt maximaal 512 outputtokens per response en gebruikt een
gespreksvenster van 8.000 tokens na instructies, met `retention_ratio: 0.8`.
Oude audio wordt daardoor eerder uit de modelcontext verwijderd; duurzaam
gespreksgeheugen en de bestaande taakuitvoering worden niet verwijderd.

Een geweigerde sessieconfiguratie sluit de verbinding. `pagehide`, handmatig
ophangen en een verbroken datakanaal ruimen timers en WebRTC op en zetten de
versturende microfoontrack uit. Modelantwoorden en taakmeldingen verlengen de
inactiviteitstimer niet. Achtergrondgeluid dat VAD als spraak ziet kan dat wel;
de tijd-, response- en tokenlimieten blijven dan gelden.

Tests simuleren WebRTC en tijd zonder betaalde provider-aanroepen. Een echte
spraakcontrole op een bijgewerkte Mac/iPhone blijft nodig om uitrol en de
daadwerkelijke tokenbesparing te bevestigen.
