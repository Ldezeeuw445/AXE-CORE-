/**
 * Obsidian-tab: de echte kluis als rustig dashboard. Geen radar.
 * Kaarten zijn de mappen — tab, agent, taak, repo — en openen de notitie.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { TabRail } from '@/presentation/components/layout/useTabRail';
import { useSearchParams } from 'react-router';
import { motion } from 'framer-motion';
import ObsidianMemoryPanel from '@/presentation/components/axe-core/ObsidianMemoryPanel';
import { type ObsidianNote } from '@/infrastructure/persistence/obsidianMemoryService';
import { zaaiEnLeesKluis } from '@/application/obsidian/kluisZaad';
import { leesWerkWaarheid } from '@/application/werk/leesWerk';
import {
  KLUIS_TAKKEN,
  kluisKaartenVan,
  kluisTakLabel,
  type KluisKaart,
  type KluisTak,
} from '@/domain/obsidian/kluisBoom';
import {
  kluisGrafiekVan,
  kluisNotitiesVoorBord,
  type KluisGrafiek,
} from '@/domain/obsidian/kluisGrafiek';
import { voegKluisNotitiesSamen } from '@/domain/obsidian/kluisNotities';
import { zichtbareTaakMeldingen } from '@/domain/taken/taakMelding';
import type { WerkItem } from '@/domain/werkBron';
import {
  Kaart,
  KaartRaster,
  SectieBlok,
  StatRij,
  TabRuimte,
} from '@/presentation/components/layout/tabMaatstaf';

const TAK_VOLGORDE: readonly KluisTak[] = [
  'workplaces', 'agents', 'tasks', 'repos', 'memory',
];

function NoteLijf({ content }: { content: string }) {
  const regels = content.split('\n');
  return (
    <div className="space-y-1 text-[12px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
      {regels.map((regel, i) => {
        const t = regel.trimEnd();
        if (!t.trim()) return <div key={i} className="h-2" />;
        if (t.startsWith('#')) {
          return (
            <div key={i} className="pt-1 text-[13px] font-semibold" style={{ color: 'var(--text-primary)' }}>
              {t.replace(/^#+\s*/, '')}
            </div>
          );
        }
        return <div key={i}>{t}</div>;
      })}
    </div>
  );
}

export default function ObsidianMemory() {
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedPath = searchParams.get('note');
  const [notes, setNotes] = useState<ObsidianNote[]>([]);
  const [werk, setWerk] = useState<WerkItem[]>([]);

  const selectPath = useCallback((path: string | null) => {
    if (path) setSearchParams({ note: path }, { replace: true });
    else setSearchParams({}, { replace: true });
  }, [setSearchParams]);

  useEffect(() => {
    let levend = true;
    void zaaiEnLeesKluis().then((data) => {
      if (levend) setNotes((prev) => voegKluisNotitiesSamen(data, prev));
    });
    void leesWerkWaarheid().then((w) => { if (levend) setWerk(w); });
    return () => { levend = false; };
  }, []);

  const bordNotes = useMemo(() => kluisNotitiesVoorBord(notes, werk), [notes, werk]);
  const kaarten = useMemo(() => kluisKaartenVan(bordNotes), [bordNotes]);
  const grafiek = useMemo(() => kluisGrafiekVan(bordNotes), [bordNotes]);
  const meldingen = useMemo(
    () => zichtbareTaakMeldingen(werk.map((w) => ({ id: w.id, title: w.titel, status: w.status }))),
    [werk],
  );
  const selected = notes.find((n) => n.path === selectedPath)
    ?? bordNotes.find((n) => n.path === selectedPath)
    ?? null;
  const gekoppeld = bordNotes.some((n) => n.path.startsWith('AXE/'));

  return (
    <motion.div
      className="flex min-h-0 flex-1 flex-col"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.25 }}
    >
      <TabRail kant="links">
        <ObsidianMemoryPanel
          gestapeld
          externalSelectedPath={selectedPath}
          onNotesChanged={(list) => setNotes((prev) => voegKluisNotitiesSamen(prev, list))}
          onSelectPath={selectPath}
        />
      </TabRail>
      <TabRuimte>
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto" data-axe-kluis-bord>
          <div className="mb-3 text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>
            {gekoppeld
              ? `AXE vault · ${bordNotes.length} notes`
              : 'Seeding the AXE vault…'}
          </div>

          {meldingen.length > 0 && (
            <SectieBlok id="alerts" titel="TASK NOTICES">
              <KaartRaster>
                {meldingen.map((m) => (
                  <Kaart key={m.id} compact titel={m.mislukt ? 'Stuck' : 'Done'}>
                    <div className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>{m.tekst}</div>
                    <div className="mt-1 font-mono text-[10px]" style={{ color: 'var(--text-muted)' }}>
                      {m.stuurde ? 'sent' : 'in-app only'}
                    </div>
                  </Kaart>
                ))}
              </KaartRaster>
            </SectieBlok>
          )}

          {grafiek.knopen.length > 0 && (
            <SectieBlok id="graph" titel="ARCHITECTURE">
              <KluisGrafiekKaart
                grafiek={grafiek}
                actief={selectedPath}
                onOpen={selectPath}
              />
            </SectieBlok>
          )}

          <StatRij className="flex-none mb-4">
            {KLUIS_TAKKEN.map((tak) => (
              <Kaart key={tak} compact>
                <div className="py-1 text-center">
                  <div className="font-mono-data text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
                    {kaarten[tak].length}
                  </div>
                  <div className="text-xs-custom" style={{ color: 'var(--text-muted)' }}>
                    {kluisTakLabel(tak)}
                  </div>
                </div>
              </Kaart>
            ))}
          </StatRij>

          {TAK_VOLGORDE.map((tak) => {
            const lijst = kaarten[tak];
            if (lijst.length === 0) return null;
            return (
              <SectieBlok
                key={tak}
                id={tak}
                titel={kluisTakLabel(tak).toUpperCase()}
                extra={<span className="text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>{lijst.length}</span>}
              >
                <KaartRaster>
                  {lijst.map((kaart) => (
                    <KluisNoteKaart
                      key={kaart.path}
                      kaart={kaart}
                      actief={selectedPath === kaart.path}
                      onOpen={() => selectPath(kaart.path)}
                    />
                  ))}
                </KaartRaster>
              </SectieBlok>
            );
          })}

          {selected && (
            <SectieBlok id="open" titel="OPEN NOTE">
              <Kaart titel={selected.title}>
                <div className="mb-2 font-mono text-[10px]" style={{ color: 'var(--text-muted)' }}>
                  {selected.path}
                </div>
                <NoteLijf content={selected.content} />
              </Kaart>
            </SectieBlok>
          )}
        </div>
      </TabRuimte>
    </motion.div>
  );
}

function KluisNoteKaart({
  kaart,
  actief,
  onOpen,
}: {
  kaart: KluisKaart;
  actief: boolean;
  onOpen: () => void;
}) {
  return (
    <Kaart
      className={actief ? 'outline outline-1 outline-[var(--accent-cyan)]' : undefined}
      titel={kaart.title}
    >
      <button
        type="button"
        onClick={onOpen}
        className="w-full text-left"
        data-axe-kluis-pad={kaart.path}
        data-axe-kluis-tak={kaart.tak}
      >
        <div className="mb-1 font-mono text-[10px]" style={{ color: 'var(--text-muted)' }}>
          {kaart.groep}
        </div>
        <div className="text-[11px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
          {kaart.samenvatting || kaart.path}
        </div>
        <div className="mt-2 font-mono text-[10px]" style={{ color: 'var(--accent-cyan)' }}>
          Open
        </div>
      </button>
    </Kaart>
  );
}

const SOORT_KLEUR: Record<string, string> = {
  tab: 'var(--accent-cyan)',
  agent: '#38BDF8',
  task: 'var(--warning)',
  repo: '#34D399',
};

function KluisGrafiekKaart({
  grafiek,
  actief,
  onOpen,
}: {
  grafiek: KluisGrafiek;
  actief: string | null;
  onOpen: (path: string) => void;
}) {
  const rijen = (['tab', 'agent', 'task', 'repo'] as const).map((soort) => ({
    soort,
    knopen: grafiek.knopen.filter((k) => k.soort === soort),
  })).filter((r) => r.knopen.length > 0);

  return (
    <Kaart>
      <div data-axe-kluis-grafiek className="flex flex-col gap-3">
        {rijen.map((rij) => (
          <div key={rij.soort} className="flex flex-wrap justify-center gap-2">
            {rij.knopen.map((k) => (
              <button
                key={k.path}
                type="button"
                onClick={() => onOpen(k.path)}
                data-axe-kluis-knoop={k.path}
                className="rounded-lg px-2.5 py-1 text-left"
                style={{
                  background: 'var(--bg-base)',
                  border: `1px solid ${actief === k.path ? 'var(--accent-cyan)' : 'rgba(255,255,255,0.08)'}`,
                }}
              >
                <div className="font-mono text-[9px]" style={{ color: SOORT_KLEUR[k.soort] }}>{k.soort}</div>
                <div className="text-[11px]" style={{ color: 'var(--text-primary)' }}>{k.label}</div>
              </button>
            ))}
          </div>
        ))}
        {grafiek.lijnen.length > 0 && (
          <div className="font-mono text-[10px]" style={{ color: 'var(--text-muted)' }}>
            {grafiek.lijnen.length} links · same notes as the cards
          </div>
        )}
      </div>
    </Kaart>
  );
}
