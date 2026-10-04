/**
 * Obsidian-tab: de echte kluis als rustig dashboard. Geen radar.
 * Kaarten zijn de mappen — tab, agent, taak, repo — en openen de notitie.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { TabRail } from '@/presentation/components/layout/useTabRail';
import { useSearchParams } from 'react-router';
import { motion } from 'framer-motion';
import ObsidianMemoryPanel from '@/presentation/components/axe-core/ObsidianMemoryPanel';
import {
  listRecentObsidianNotes,
  type ObsidianNote,
} from '@/infrastructure/persistence/obsidianMemoryService';
import { maybeSeedKluisBoom } from '@/application/obsidian/kluisZaad';
import {
  KLUIS_TAKKEN,
  kluisKaartenVan,
  kluisTakLabel,
  type KluisKaart,
  type KluisTak,
} from '@/domain/obsidian/kluisBoom';
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

  const selectPath = useCallback((path: string | null) => {
    if (path) setSearchParams({ note: path }, { replace: true });
    else setSearchParams({}, { replace: true });
  }, [setSearchParams]);

  useEffect(() => {
    let levend = true;
    void maybeSeedKluisBoom()
      .then(() => listRecentObsidianNotes(400))
      .then((data) => { if (levend) setNotes(data); });
    return () => { levend = false; };
  }, []);

  const kaarten = useMemo(() => kluisKaartenVan(notes), [notes]);
  const selected = notes.find((n) => n.path === selectedPath) ?? null;
  const gekoppeld = notes.some((n) => n.path.startsWith('AXE/'));

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
          onNotesChanged={(list) => setNotes(list)}
          onSelectPath={selectPath}
        />
      </TabRail>
      <TabRuimte>
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto" data-axe-kluis-bord>
          <div className="mb-3 text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>
            {gekoppeld
              ? `AXE vault · ${notes.length} notes`
              : 'Seeding the AXE vault…'}
          </div>

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
