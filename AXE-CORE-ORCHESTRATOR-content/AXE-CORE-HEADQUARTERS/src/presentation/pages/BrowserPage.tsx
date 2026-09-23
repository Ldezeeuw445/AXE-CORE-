import BrowserApp from '@/presentation/components/browser/BrowserApp';
import { BezigVlag } from '@/presentation/components/layout/zweef/BezigVlag';

/* De zwevende bol hangt sinds 14 september in de schil (ZwevendeBol in AppShell)
   en komt met de cyaan driehoek, op elke pagina -- niet meer alleen hier. */
export default function BrowserPage() {
  return (
    <>
      <BrowserApp />
      <BezigVlag />
    </>
  );
}
