/**
 * De vier pillen onder de composer.
 *
 * Uit het voorbeeld: een gekleurd icoon, een grijs label, een dun randje, geen
 * vulling. Dat laatste is niet alleen smaak -- het is wet 10 (kleur zit in de
 * letters, nooit in een vlak). Vier gevulde pillen in vier kleuren onder een
 * zwarte composer zouden het drukste ding op het scherm zijn, en dan zegt de
 * kleur niets meer.
 *
 * De lijst en de kleuren staan in domain/snelacties.ts, met een test die de
 * accenten ver genoeg uit elkaar houdt.
 */
import { Brain, Sparkles, CirclePlay, WandSparkles } from 'lucide-react';
import { SNELACTIES, type SnelactieIcoon } from '@/domain/snelacties';

const ICOON: Record<SnelactieIcoon, typeof Brain> = {
  brein: Brain,
  context: Sparkles,
  levering: CirclePlay,
  scherpen: WandSparkles,
};

export function ComposerSnelacties({ onKies }: { onKies: (prompt: string) => void }) {
  return (
    <div className="axe-snelacties">
      {SNELACTIES.map((actie) => {
        const Icoon = ICOON[actie.icoon];
        return (
          <button
            key={actie.id}
            type="button"
            className="axe-snelactie"
            title={actie.prompt}
            onClick={() => onKies(actie.prompt)}
          >
            <Icoon size={15} style={{ color: actie.accent }} />
            <span>{actie.label}</span>
          </button>
        );
      })}
    </div>
  );
}
