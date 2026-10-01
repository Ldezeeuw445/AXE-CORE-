/**
 * Wat een klare taak achterlaat.
 *
 * Bouwlijst 6.6: "elke taak laat een rapport achter". Dat was er niet -- een
 * klare job zei zijn samenvatting in de chat en verdween daarna. De jobstore
 * bewaart hem niet eens: `bewaarbareJobs` gooit `stappen` weg bij het opslaan,
 * en de store is per apparaat. Vroeg je morgen "wat heeft die onderzoekstaak
 * opgeleverd", dan was het antwoord nergens meer.
 *
 * De vorm is niet nieuw: de `axe`-CLI schrijft al een rapport als
 * `# <titel>\n\n<tekst>` met `category: 'report'` (zie `cli/axe_laag/run.py`).
 * Dit is diezelfde vorm, nu in de map `projects` zodat hij op de juiste berg
 * landt en bij de andere projectdocumenten staat.
 *
 * Puur: geen store, geen netwerk, zodat de vorm te testen is zonder een job te
 * laten draaien.
 */
import type { AxeJob } from './axeJobRegels';
import { mapSleutel } from '@/domain/memory/mappen';

export interface JobRapport {
  /** De sleutel in het geheugen: `projects/<slug>`. Stabiel, dus een upsert. */
  sleutel: string;
  /** Markdown, met de titel als kop -- zelfde vorm als `axe report`. */
  inhoud: string;
  tags: string[];
}

/**
 * Een rapport uit een afgeronde job, of null als er niets te rapporteren is.
 *
 * Null bij een job die nog loopt, en bij een job zonder samenvatting: een
 * rapport met alleen een titel is ruis die later als kennis terugkomt.
 */
export function jobRapportVan(job: AxeJob): JobRapport | null {
  if (job.state !== 'done' && job.state !== 'failed') return null;
  const samenvatting = (job.summary ?? '').trim();
  if (!samenvatting) return null;

  const titel = (job.title || job.sourceText || 'Taak').trim().slice(0, 80);
  const geslaagd = job.state === 'done';
  const duur = job.finishedAt && job.startedAt
    ? Math.max(0, Math.round((job.finishedAt - job.startedAt) / 1000))
    : null;

  const regels = [
    `# ${titel}`,
    '',
    `- Agent: ${job.agent}`,
    `- Uitkomst: ${geslaagd ? 'klaar' : 'gestopt'}`,
    ...(duur !== null ? [`- Duur: ${duur} s`] : []),
    '',
    '## Opdracht',
    '',
    job.sourceText.trim().slice(0, 2000),
    '',
    geslaagd ? '## Resultaat' : '## Waar het op stopte',
    '',
    samenvatting.slice(0, 4000),
  ];

  return {
    sleutel: mapSleutel('projects', `${titel}-${job.id}`),
    inhoud: regels.join('\n'),
    tags: ['rapport', job.agent, geslaagd ? 'klaar' : 'gestopt'],
  };
}
