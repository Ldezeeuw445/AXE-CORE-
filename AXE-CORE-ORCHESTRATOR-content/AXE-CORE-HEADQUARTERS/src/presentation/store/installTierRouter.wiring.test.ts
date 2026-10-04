import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

const ROOT = join(__dirname, '../..');

function bron(rel: string): string {
  return readFileSync(join(ROOT, rel), 'utf8');
}

describe('tier-router is aangesloten, niet alleen gebouwd', () => {
  /* De whisper-guard stond hier ook in. Die is op 29 sep 2026 uit main.tsx
     gehaald (`ba4ac856`, "voice has ONE path on every surface") en de lus is
     deze ronde helemaal weg. Een test die eist dat een verwijderde installer
     er nog staat, meet niets -- hij houdt alleen de meetlat rood. */
  it('main.tsx zet de router ná stable chat', () => {
    const tekst = bron('app/main.tsx');
    const stable = tekst.indexOf('installStableChat()');
    const router = tekst.indexOf('installTierRouter()');
    expect(stable).toBeGreaterThan(0);
    expect(router).toBeGreaterThan(stable);
  });

  /* Deze ronde. Het gedrag zit in application/besturingsBeurt en wordt daar
     echt aangeroepen getest; wat een unit-test niet kan zien is ÓF de
     presentatielaag hem aanroept en in welke volgorde. Dat is precies wat
     hieronder staat -- en precies wat er misging: `herkenBesturing` bestond
     met vijftien groene tests en nul aanroepers. */
  it('het regelpad voor lopend werk wordt aangeroepen, na de gesproken ja/nee en vóór het knippen', () => {
    const tekst = bron('presentation/store/installTierRouter.ts');
    const goedkeuring = tekst.indexOf('probeerGesprokenGoedkeuring(text)');
    const besturing = tekst.indexOf('await probeerBesturing(text)');
    const knippen = tekst.indexOf('splitsAxeBeurten(text)');
    expect(besturing).toBeGreaterThan(goedkeuring);
    expect(knippen).toBeGreaterThan(besturing);
    expect(tekst).toMatch(/besturingsBeurt\s*\(/);
  });

  it('het modelpad voert zijn controls ook echt uit', () => {
    const tekst = bron('presentation/store/installTierRouter.ts');
    expect(tekst).toMatch(/plan\.controls/);
    expect(tekst).toMatch(/controlBeurt\s*\(/);
  });

  /* De kale titels waren naad 1: het model kreeg geen enkele [jN] en kon dus
     nergens naar wijzen. Deze assertie houdt die bug weg. */
  it('de lopende taken gaan genummerd naar het plan, niet als kale titels', () => {
    const tekst = bron('presentation/store/installTierRouter.ts');
    expect(tekst).toMatch(/lopendeRegels\s*\(/);
    expect(tekst).not.toMatch(/lopendeJobs\([^)]*\)\s*\.map\(\(j\) => j\.title\)/);
  });

  it('planBeurt geeft de lopende lijst aan de parser door', () => {
    expect(bron('application/tierRouter/planBeurt.ts')).not.toMatch(/parseBeurtPlan\(raw\)/);
    expect(bron('application/tierRouter/planBeurt.ts')).toMatch(/parseBeurtPlan\(raw, lopend\)/);
  });

  it('jobs overleven een herstart en de monitors worden weer opgestart', () => {
    const store = bron('presentation/store/axeJobStore.ts');
    expect(store).toMatch(/zustand\/middleware/);
    expect(store).toMatch(/persist\(/);
    expect(store).toMatch(/bewaarbareJobs/);

    const tekst = bron('presentation/store/installTierRouter.ts');
    // De AANROEP, niet de definitie: die staat hoger in het bestand.
    const installed = tekst.indexOf('installed = true');
    const hervat = tekst.indexOf('\n  hervatJobMonitors();');
    expect(installed).toBeGreaterThan(0);
    expect(hervat).toBeGreaterThan(installed);
  });

  /* De monitor was `while (true)` met een vaste poll van 4 s: geen limiet,
     geen backoff, en een netwerkfout liet de job eeuwig op 'running' staan. */
  it('de monitor loopt af in plaats van eeuwig door te pollen', () => {
    const tekst = bron('presentation/store/installTierRouter.ts');
    expect(tekst).toMatch(/volgendePollMs\(/);
    expect(tekst).toMatch(/monitorMoetStoppen\(/);
    expect(tekst).toMatch(/MONITOR_MAX_FOUTEN/);
    expect(tekst).toMatch(/verlorenTaakTekst|onbereikbaarTekst/);
    expect(tekst.match(/4_000/g) ?? []).toHaveLength(0);
  });

  it('de bol en de kopstand weten dat er gewerkt wordt', () => {
    expect(bron('presentation/components/axe-core/sphere/AxeCoreSphere.tsx'))
      .toMatch(/useAxeJobStore\.subscribe\(/);
    expect(bron('presentation/components/axe-core/sphere/AxeCoreSphere.tsx')).toMatch(/werkStand\(/);
    // De telefoon-sphere ademt mee op hetzelfde signaal.
    expect(bron('presentation/components/axe-core/sphere/TelefoonSphere.tsx')).toMatch(/useAxeJobStore\.subscribe\(/);
    expect(bron('presentation/components/axe-core/sphere/TelefoonSphere.tsx')).toMatch(/werkStand\(/);
    expect(bron('presentation/pages/Home.tsx')).toMatch(/coreStandVan\(/);
  });

  it('balk en telefoonchips tonen de laatste stap, niet alleen het statuswoord', () => {
    expect(bron('presentation/components/layout/AxeAgentsBalk.tsx')).toMatch(/regelVan\(/);
    expect(bron('presentation/components/layout/MobileChat.tsx')).toMatch(/laatsteStap\(/);
  });

  /* Het tweede register. installStableChat startte zijn eigen durable tasks
     met een eigen localStorage-sleutel en een eigen poller: wat daar begon
     stond niet in de balk, niet op de telefoon, en was nergens mee te
     besturen. Eén deur (`voerJobsUit`), één register (`useAxeJobStore`). */
  it('stable chat start geen eigen durable tasks meer', () => {
    const tekst = bron('presentation/store/installStableChat.ts');
    expect(tekst).toMatch(/voerJobsUit\s*\(/);
    expect(tekst).not.toMatch(/createDurableTask\s*\(/);
    expect(tekst).not.toMatch(/monitorDurableTask/);
    // De sleutel mag alleen nog voorkomen als uitleg, niet als opslag.
    expect(tekst).not.toMatch(/localStorage\.(get|set)Item\(\s*ACTIVE_TASKS_KEY/);
  });

  it('het oude register wordt bij het opstarten overgenomen en opgeruimd', () => {
    const tekst = bron('presentation/store/installTierRouter.ts');
    expect(tekst).toMatch(/neemOudRegisterOver\(\)/);
    expect(tekst).toMatch(/removeItem\(SLEUTEL\)/);
  });

  it('onderschept sendMessage en valt terug op het oude pad', () => {
    const tekst = bron('presentation/store/installTierRouter.ts');
    expect(tekst).toMatch(/kiesAxeRoute\s*\(/);
    expect(tekst).toMatch(/if\s*\(\s*!keuze\.intercept\s*\)/);
    expect(tekst).toMatch(/await original\(text\)/);
    expect(tekst).toMatch(/voerTier1Uit/);
    expect(tekst).toMatch(/voerJobsUit/);
    expect(tekst).toMatch(/createDurableTask/);
    expect(tekst).toMatch(/pushTierRoute/);
  });

  it('knipte jobs starten op de achtergrond — sendMessage wacht niet', () => {
    const tekst = bron('presentation/store/installTierRouter.ts');
    expect(tekst).toMatch(/splitsAxeBeurten/);
    expect(tekst).toMatch(/function startAxeJobs/);
    expect(tekst).toMatch(/void startJobsParallel/);
    expect(tekst).toMatch(/void monitorTier3/);
    expect(tekst).not.toMatch(/await startAxeJobs/);
    expect(tekst).not.toMatch(/await startJobsParallel/);
    expect(tekst).not.toMatch(/await monitorTier3/);
    expect(tekst).toMatch(/injecteerJobResultaat/);
    expect(tekst).toMatch(/speakZonderKap/);
    expect(tekst).toMatch(/sessieSamenvatting/);
    expect(tekst).not.toMatch(/auto_send_qualification|auto_reply_nonbinding|auto_send_followups/);
  });

  it('gesproken ja/nee bedient de echte geparkeerde durable task', () => {
    const tekst = bron('presentation/store/installTierRouter.ts');
    expect(tekst).toMatch(/probeerGesprokenGoedkeuring/);
    expect(tekst).toMatch(/gesprokenGoedkeuringsBesluit/);
    expect(tekst).toMatch(/magMetStemGoedkeuren/);
    expect(tekst).toMatch(/decideDurableTaskApproval/);
    expect(tekst).toMatch(/goedkeuringVoorActie/);
    expect(tekst).toMatch(/jobWachtTekst\(wacht, gk\.tekst\)/);
  });

  it('expliciete Mac-opdrachten omzeilen de kernel niet meer', () => {
    const tekst = bron('presentation/store/installTierRouter.ts');
    expect(tekst).toMatch(/explicit mac -> durable kernel/);
    expect(tekst).toMatch(/list_devices\/run_on_device/);
    expect(tekst).not.toMatch(/if \(detectMacRoute\(text\)\) \{\s*await original\(text\)/);
  });

  it('de agents-balk zit in de composer, niet alleen als los bestand', () => {
    const vak = bron('presentation/components/layout/AxeComposerVak.tsx');
    expect(vak).toMatch(/<AxeAgentsBalk\s*\/>/);
    const balk = bron('presentation/components/layout/AxeAgentsBalk.tsx');
    expect(balk).toMatch(/balkLabel/);
    expect(balk).toMatch(/surface-bg/);
    expect(balk).toMatch(/tint-line/);
  });

  it('tier 1 wacht niet op RAG of het grote model', () => {
    const tekst = bron('presentation/store/installTierRouter.ts');
    expect(tekst).toMatch(/groetAntwoord\s*\(/);
    expect(tekst).toMatch(/haalTier1Kijk\s*\(/);
    expect(tekst).not.toMatch(/await\s+buildRagContext\s*\(/);
    expect(tekst).not.toMatch(/auto_send_qualification|auto_reply_nonbinding|auto_send_followups/);
  });

  it('de cognitive stream toont de gekozen tier', () => {
    // De stroom wordt afgeleid in aiCoreStroom.ts; AICore.tsx toont hem alleen.
    const tekst = bron('presentation/pages/aiCoreStroom.ts');
    expect(tekst).toMatch(/evt\.routeTier/);
    expect(tekst).toMatch(/route · tier/);
    expect(tekst).toMatch(/beurtRegel/);
    expect(tekst).toMatch(/firstAudioMs/);
  });

  it('tier 2 spreekt zin voor zin tijdens de stream', () => {
    const tekst = bron('presentation/store/installTierRouter.ts');
    expect(tekst).toMatch(/startAxeSpraakStroom/);
    expect(tekst).toMatch(/stroom\.voer\(/);
    expect(tekst).toMatch(/stroom\.sluit\(/);
    expect(tekst).toMatch(/stroom\.stop\(/);
    expect(tekst).toMatch(/pushBeurtLatentie/);
    expect(tekst).toMatch(/startBeurtIndienNodig/);
  });

  it('de orb leest mic- en TTS-niveaus, geen tweede getUserMedia', () => {
    const tekst = bron('presentation/components/layout/AxeStatusOrb.tsx');
    expect(tekst).toMatch(/getMicLevel/);
    expect(tekst).toMatch(/getGlobalTtsLevel/);
    expect(tekst).not.toMatch(/getUserMedia\s*\(/);
  });
  /* ── De vijf skills (1 okt 2026) ─────────────────────────────────────────
     Gemeten: `probeerPlan` draait vóór de regels én nog eens binnen de
     tier-3-tak. Een benoemde skill werd daardoor opnieuw beslist door een
     planmodel -- tot 6 s wachten, en `route.skill` ging verloren omdat het
     model zijn eigen request teruggeeft. Een unit-test ziet die volgorde niet;
     dit is de enige plek waar hij staat. */
  it('haalt een benoemde skill niet nog eens door het planmodel', () => {
    const tekst = bron('presentation/store/installTierRouter.ts');
    expect(tekst).toMatch(/if \(!keuze\.skill && await probeerPlan\(text, keuze\)\) return;/);
  });

  it('schrijft de taakmap in de kluis bij dispatch', () => {
    const tekst = bron('presentation/store/installTierRouter.ts');
    expect(tekst).toMatch(/kluis: schrijfTaakKluis/);
    expect(bron('application/tierRouter/stuurAxeJobs.ts')).toMatch(/deps\.kluis/);
  });

  it('geeft device uit het plan door, in plaats van hem te laten vallen', () => {
    const tekst = bron('presentation/store/installTierRouter.ts');
    expect(tekst).toMatch(/device: j\.device \?\? null,/);
    expect(bron('application/tierRouter/stuurAxeJobs.ts')).toMatch(/device: s\.device \?\? null/);
    expect(bron('application/tierRouter/stuurAxeJobs.ts')).toMatch(/device,/);
  });

  it('geeft de skill uit het plan door in plaats van hem op null te zetten', () => {
    const tekst = bron('presentation/store/installTierRouter.ts');
    // Stond hier hard als `skill: null`. Geen verbod op `skill: null` in het
    // hele bestand: de besturingsroute en de mac-route hebben er echt geen, en
    // een test die een geldig patroon verbiedt is een val voor de volgende.
    expect(tekst).toMatch(/skill: j\.skill \?\? null,/);
  });

  it('stuurt bij een skill de instructie uit de tabel mee, niet alleen Luka\'s zin', () => {
    const tekst = bron('presentation/store/installTierRouter.ts');
    expect(tekst).toMatch(/skillDef\(keuze\.skill\)/);
    expect(tekst).toMatch(/def\.request/);
  });

});
