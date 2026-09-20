import { useEffect, useState } from 'react';
import { AxeStatusOrb } from '@/presentation/components/layout/AxeStatusOrb';
import { useVoiceStore } from '@/presentation/store/voiceStore';
import { ACTIVITEIT_GEBEURTENIS, type AxeActiviteit } from '@/shared/axeActiviteit';

export function StandaloneAxeParticle() {
  const voiceStatus = useVoiceStore(s => s.voiceStatus);
  const [activity, setActivity] = useState<AxeActiviteit | null>(null);

  useEffect(() => {
    let timer: number | undefined;
    const onActivity = (event: Event) => {
      setActivity((event as CustomEvent<AxeActiviteit>).detail ?? null);
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => setActivity(null), 2600);
    };
    window.addEventListener(ACTIVITEIT_GEBEURTENIS, onActivity);
    return () => {
      window.removeEventListener(ACTIVITEIT_GEBEURTENIS, onActivity);
      if (timer) window.clearTimeout(timer);
    };
  }, []);

  const label = activity?.label.toLowerCase() ?? '';
  const work = {
    zoekt: /search|zoek|research|find|scan|onderzoek/.test(label),
    verbindt: /connect|verbind|navigate|open|session|sessie/.test(label),
    schrijft: /write|schrijf|draft|compose|reply|antwoord/.test(label),
  };
  const status = activity && voiceStatus === 'idle' ? 'processing' as const : undefined;

  return (
    <div className="standalone-axe-particle" title={activity?.label ?? `AXE · ${voiceStatus}`} data-axe-doel="axe-presence">
      <AxeStatusOrb size={40} toonLabel={false} werk={work} status={status} />
    </div>
  );
}
