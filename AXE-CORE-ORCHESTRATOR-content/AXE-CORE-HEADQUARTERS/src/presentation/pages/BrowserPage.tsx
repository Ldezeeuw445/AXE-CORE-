import BrowserApp from '@/presentation/components/browser/BrowserApp';
import { ZweefLaag } from '@/presentation/components/layout/zweef/ZweefLaag';
import { BolWidget } from '@/presentation/components/layout/zweef/BolWidget';
import { BezigVlag } from '@/presentation/components/layout/zweef/BezigVlag';

export default function BrowserPage() {
  return (
    <>
      <BrowserApp />
      <BezigVlag />
      <ZweefLaag>
        <BolWidget />
      </ZweefLaag>
    </>
  );
}
