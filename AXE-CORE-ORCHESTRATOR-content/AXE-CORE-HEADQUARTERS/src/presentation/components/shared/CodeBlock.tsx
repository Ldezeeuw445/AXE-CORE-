/**
 * Een codeblok met een kopieerknop.
 *
 * ## Waarom dit bestaat
 *
 * De chat en MarkdownMessage toonden code al in een <pre>, maar zonder manier
 * om hem eruit te halen dan selecteren met de muis -- en dat gaat mis zodra het
 * blok scrollt of er een regel afbreekt. Elk commando dat AXE voorstelt moest
 * je dus met de hand overtypen.
 *
 * Het crashscherm had die knop al (AppShell), en dat was het bewijs dat hij
 * hier hoorde: als het de moeite waard is om een foutmelding te kunnen
 * kopiëren, dan is het dat voor een commando zeker.
 *
 * ## Waarom de melding na twee seconden weggaat
 *
 * Een vinkje dat blijft staan zegt niets meer: bij het tweede blok weet je niet
 * of je dát hebt gekopieerd of nog het eerste. Hij hoort te verdwijnen zodat
 * "gekopieerd" altijd over de laatste klik gaat.
 */
import { useState, useCallback, useRef, useEffect } from 'react';
import { Check, Copy } from 'lucide-react';

interface Props {
  code: string;
  /** Bijvoorbeeld 'bash' of 'ts'. Alleen als label; er wordt niet gekleurd. */
  taal?: string;
  /** Maximale hoogte voordat hij scrollt. */
  maxHoogte?: number;
  className?: string;
}

export function CodeBlock({ code, taal, maxHoogte = 320, className }: Props) {
  const [gekopieerd, setGekopieerd] = useState(false);
  const timer = useRef<number | null>(null);

  // Opruimen bij unmount: anders zet een timer state op een component dat er
  // niet meer is, en dat is precies het soort waarschuwing dat je gaat negeren.
  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);

  const kopieer = useCallback(() => {
    void navigator.clipboard?.writeText(code).then(() => {
      setGekopieerd(true);
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setGekopieerd(false), 2000);
    }).catch(() => { /* geen klembord: de tekst staat er nog om te selecteren */ });
  }, [code]);

  return (
    <div className={`relative group rounded-card overflow-hidden ${className ?? ''}`}
      style={{ border: '1px solid var(--border-default)' }}>
      <div className="flex items-center justify-between px-2.5 py-1"
        style={{ borderBottom: '1px solid var(--border-default)', background: 'rgba(255,255,255,0.03)' }}>
        <span className="text-[9px] font-mono-data" style={{ color: 'var(--text-muted)' }}>
          {taal || 'code'}
        </span>
        <button
          onClick={kopieer}
          title={gekopieerd ? 'Gekopieerd' : 'Naar het klembord'}
          className="text-[9px] flex items-center gap-1 opacity-60 hover:opacity-100"
          style={{ color: gekopieerd ? 'var(--m-happened)' : 'var(--text-secondary)' }}
        >
          {gekopieerd ? <Check size={10} /> : <Copy size={10} />}
          {gekopieerd ? 'gekopieerd' : 'kopieer'}
        </button>
      </div>
      <pre
        className="px-2.5 py-2 overflow-auto text-[11px] leading-relaxed"
        style={{ maxHeight: maxHoogte, background: 'rgba(0,0,0,0.28)' }}
      >
        <code style={{ color: 'var(--text-secondary)' }}>{code}</code>
      </pre>
    </div>
  );
}
