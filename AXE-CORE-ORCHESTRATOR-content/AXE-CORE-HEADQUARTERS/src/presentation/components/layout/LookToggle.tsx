/**
 * De standwissel, in de kopbalk.
 *
 * Staat hier en niet alleen in Settings omdat het een keuze is die je maakt
 * terwijl je kijkt: je wilt zien wat het met het scherm doet dat op dat moment
 * voor je staat, niet met het instellingenscherm. Drie klikken heen en drie
 * terug maakt van een vergelijking een herinnering.
 *
 * Dezelfde bron als de kaart in Settings -- allebei useLook, dus ze kunnen niet
 * uit de pas lopen.
 */
import { Layers, Square } from 'lucide-react';
import { IconButton } from '@/presentation/components/shared/IconButton';
import { useLook } from '@/presentation/hooks/useLook';
import { otherLook } from '@/domain/look';

export function LookToggle() {
  const [look, setLook] = useLook();
  const glass = look === 'glass';

  return (
    <IconButton
      onClick={() => setLook(otherLook(look))}
      aria-label={glass ? 'Naar de zwarte stand' : 'Naar de glasstand'}
      title={glass ? 'Glasplaat — klik voor de zwarte plaat' : 'Zwarte plaat — klik voor glas'}
      aria-pressed={glass}
    >
      {glass
        ? <Layers size={16} style={{ color: 'var(--accent-cyan)' }} />
        : <Square size={16} />}
    </IconButton>
  );
}
