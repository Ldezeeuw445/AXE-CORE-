import BrowserApp from '@/presentation/components/browser/BrowserApp';
import { ZweefLaag } from '@/presentation/components/layout/zweef/ZweefLaag';
import { BolWidget } from '@/presentation/components/layout/zweef/BolWidget';

export default function BrowserPage() {
  return (
    <>
      <BrowserApp />
      <ZweefLaag>
        <BolWidget />
      </ZweefLaag>
    </>
  );
}
