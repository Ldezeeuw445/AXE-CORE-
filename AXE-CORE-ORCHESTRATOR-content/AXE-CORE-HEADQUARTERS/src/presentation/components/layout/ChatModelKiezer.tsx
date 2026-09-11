/**
 * Waar AXE mee denkt, te wisselen vanaf de plek waar je het antwoord leest.
 *
 * ## Waarom in de chatbalk en niet alleen in Settings
 *
 * De keuze gaat over dít gesprek: zwaarder model voor een lastige vraag,
 * goedkoper voor een snelle. In Settings is diezelfde keuze een lijst zonder
 * context -- je ziet niet wat er net misging, dus je weet niet waarom je zou
 * wisselen. Hier staat hij naast het antwoord dat aanleiding geeft.
 *
 * Onder elk AXE-antwoord stond al `provider · model`. Dat vertelde je WAT het
 * werd; dit maakt er een knop van.
 *
 * ## Wat het schrijft
 *
 * Het primaire slot in voiceStore, dezelfde plek die Settings gebruikt. Niet een
 * tweede voorkeur ernaast -- twee plekken die hetzelfde instellen gaan het ooit
 * oneens zijn, en dan zegt het scherm iets anders dan er draait.
 *
 * De sleutel komt uit de opgeslagen verbinding van die provider, niet uit het
 * slot dat er stond. Wissel je van provider en neem je de oude sleutel mee, dan
 * stuur je de sleutel van de een naar de ander -- die faalt, en de melding wijst
 * naar het model in plaats van naar de sleutel.
 */
import { useState, useMemo, useCallback } from 'react';
import { ChevronDown, Check, Infinity as InfinityIcon } from 'lucide-react';
import { useVoiceStore } from '@/presentation/store/voiceStore';
import { PROVIDERS, type ProviderId } from '@/domain/providers';
import { chatModelKeuzes, isActief, modelLabel, type ChatModelKeuze } from '@/domain/chatModelKeuzes';

function verbindingen(): Record<string, { key?: string }> {
  try { return JSON.parse(localStorage.getItem('axe_llm_connections') ?? '{}'); }
  catch { return {}; }
}

export function ChatModelKiezer() {
  const primair = useVoiceStore(s => s.primarySlot);
  const setPrimair = useVoiceStore(s => s.setPrimarySlot);
  const [open, setOpen] = useState(false);

  // Bij het openen opnieuw lezen: heb je net in Settings een sleutel ingevuld,
  // dan hoort die provider hier meteen te staan.
  const keuzes = useMemo(
    () => (open ? chatModelKeuzes(verbindingen(), PROVIDERS.map(p => p.id)) : []),
    [open],
  );

  const kies = useCallback((k: ChatModelKeuze) => {
    const conns = verbindingen();
    setPrimair({
      provider: k.provider,
      key: conns[k.provider]?.key ?? '',
      model: k.model,
    });
    setOpen(false);
  }, [setPrimair]);

  const huidigLabel = primair
    ? modelLabel(primair.provider, primair.model || '')
    : 'geen model';

  return (
    <span className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        title="Waar AXE mee denkt — wisselen geldt vanaf je volgende bericht"
        className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full"
        style={{ color: 'var(--text-secondary)', border: '1px solid var(--border-default)' }}
      >
        {huidigLabel}
        <ChevronDown size={9} />
      </button>

      {open && (
        <>
          {/* Klik ernaast sluit hem. Zonder dit blijft hij open zodra je iets
              anders doet, en dan dekt hij het gesprek af. */}
          <span className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            className="absolute bottom-full mb-1 left-0 z-50 rounded-card overflow-hidden max-h-72 overflow-y-auto"
            style={{
              minWidth: 260,
              background: 'var(--bg-panel, rgba(12,16,24,0.98))',
              border: '1px solid var(--border-default)',
              boxShadow: '0 12px 32px rgba(0,0,0,0.45)',
            }}
          >
            {keuzes.length === 0 && (
              <div className="px-3 py-2 text-[10px]" style={{ color: 'var(--text-muted)' }}>
                Geen provider met een sleutel. Vul er een in bij Settings.
              </div>
            )}
            {keuzes.map(k => {
              const aan = isActief(k, primair);
              return (
                <button
                  key={`${k.provider}:${k.model}`}
                  onClick={() => kies(k)}
                  className="w-full text-left px-3 py-1.5 flex items-start gap-2 hover:bg-white/5"
                >
                  <span style={{ width: 12, flexShrink: 0, paddingTop: 2 }}>
                    {aan && <Check size={10} style={{ color: 'var(--accent-cyan)' }} />}
                  </span>
                  <span className="min-w-0">
                    <span className="text-[11px] flex items-center gap-1"
                      style={{ color: aan ? 'var(--accent-cyan)' : 'var(--text-primary)' }}>
                      {k.label}
                      {/* Het teken dat deze weg je niets per token kost. Kleur
                          in de letters en niet in een vlak -- Law 10. */}
                      {k.opAbonnement && <InfinityIcon size={9} style={{ color: 'var(--m-happened)' }} />}
                    </span>
                    <span className="text-[9px] block truncate" style={{ color: 'var(--text-muted)' }}>
                      {k.provider} · {k.toelichting}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </span>
  );
}

export type { ProviderId };
