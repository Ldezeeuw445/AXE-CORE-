# Waarom de dev-config poort 5012 gebruikt en niet 5000

`tauri.coreplaat.conf.json` wijst met `devUrl` naar `http://localhost:5000`.
Dat werkt niet, en het faalt op een manier die er niet uitziet als een
poortprobleem: het venster opent, blijft leeg, en er staat geen foutmelding.

Gemeten op 2026-09-05:

    $ lsof -nP -iTCP:5000 -sTCP:LISTEN
    ControlCe 737 luka ... TCP *:5000 (LISTEN)

    $ curl -i http://localhost:5000/
    HTTP/1.1 403 Forbidden
    Server: AirTunes/890.79.5

Poort 5000 is **AirPlay Receiver** van macOS. Die luistert daar zodra de
functie aanstaat (Systeeminstellingen → Algemeen → AirDrop en Handoff), en hij
antwoordt met 403 op alles. De dev-server van Vite komt er dus nooit bij, en
Tauri laadt een lege 403.

Dit had ook opgelost kunnen worden door AirPlay Receiver uit te zetten. Dat is
een systeeminstelling van de gebruiker en die verandert een build-opstelling
niet voor je; 5012 verzetten kost niets en raakt niemand.

De productie-config blijft ongewijzigd: die gebruikt `frontendDist` en heeft
geen dev-server nodig, dus daar heeft 5000 nooit iets uitgemaakt.


## En waarom `--port 5012` niet genoeg was

Eerste poging gaf:

    Error: PORT environment variable is required but was not provided.

`vite.config.ts` leest `process.env.PORT` en gooit als die ontbreekt -- de
vlag `--port` op de commandoregel wordt pas *na* het laden van de config
gelezen, en de config komt nooit zover. Het is dus `PORT=5012 npm run dev`,
niet `npm run dev -- --port 5012`.

Die eis komt uit de Replit-opstelling (zie de opmerking boven regel 28 in
vite.config.ts). Op deze Mac is er geen Replit-werkstroom die hem zet, dus
elke ingang die de dev-server start moet hem zelf meegeven.
