import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

const ROOT = join(__dirname, '../..');

function bron(rel: string): string {
  return readFileSync(join(ROOT, rel), 'utf8');
}

describe('tier-router is aangesloten, niet alleen gebouwd', () => {
  it('main.tsx zet de router ná stable chat en vóór de whisper-guard', () => {
    const tekst = bron('app/main.tsx');
    const stable = tekst.indexOf('installStableChat()');
    const router = tekst.indexOf('installTierRouter()');
    const guard = tekst.indexOf('installWhisperVoiceSendGuard()');
    expect(stable).toBeGreaterThan(0);
    expect(router).toBeGreaterThan(stable);
    expect(guard).toBeGreaterThan(router);
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
    expect(bron('presentation/pages/Home.tsx')).toMatch(/coreStandVan\(/);
  });

  it('balk en telefoonchips tonen de laatste stap, niet alleen het statuswoord', () => {
    expect(bron('presentation/components/layout/AxeAgentsBalk.tsx')).toMatch(/regelVan\(/);
    expect(bron('presentation/components/layout/MobileChat.tsx')).toMatch(/laatsteStap\(/);
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
    expect(tekst).toMatch(/jobWachtTekst\(wacht, vraag\)/);
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

  it('Whisper-lus: Esc stopt, job-spraak wacht tot de gebruiker klaar is', () => {
    const tekst = bron('presentation/store/installWhisperVoice.ts');
    expect(tekst).toMatch(/e\.key !== 'Escape'/);
    expect(tekst).toMatch(/stopListening\(\)/);
    expect(tekst).toMatch(/flushAxeSpraakRij/);
    expect(tekst).toMatch(/conversationActive/);
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
});
