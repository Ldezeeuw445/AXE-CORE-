import BrowserApp from '@/presentation/components/browser/BrowserApp';
import { BezigVlag } from '@/presentation/components/layout/zweef/BezigVlag';
import { usePhoneApp } from '@/presentation/pages/phone/usePhoneApp';
import PhoneBrowser from '@/presentation/pages/phone/PhoneBrowser';

/* De zwevende bol hangt sinds 14 september in de schil (ZwevendeBol in AppShell)
   en komt met de cyaan driehoek, op elke pagina -- niet meer alleen hier. */
export default function BrowserPage() {
  const phone = usePhoneApp();
  if (phone) return <PhoneBrowser />;
  return (
    <div className="axe-browser-v3 flex min-h-0 flex-1 flex-col" data-axe-browser="v3">
      <BrowserApp />
      <BezigVlag />
    </div>
  );
}
