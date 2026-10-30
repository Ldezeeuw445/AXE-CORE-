import { useNavigate } from 'react-router';
import { LineChart, ExternalLink } from 'lucide-react';
import { PageHeader, AxeCard, AxeButton } from '@/presentation/components/ui/AxeUI';

/**
 * Compact Trading demo hub for AXE Core (fase 1).
 * Live / deep trading UI lives in Companion / Trading OS — not here.
 * Demo only: 500k MT5 demo proposals; no real trades from this screen.
 */
export default function TradingDemoHub() {
  const navigate = useNavigate();
  return (
    <div className="axe-tabruimte h-full overflow-y-auto pt-4 pb-6 sm:pt-5">
      <PageHeader
        eyebrow="Trading · demo"
        title="Trading"
        description="500k MT5 demo proposals only. No live orders from Core. Deep desk → Companion / Trading OS."
      />
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <AxeCard className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <LineChart size={18} style={{ color: 'var(--accent-cyan)' }} />
            <span className="text-[14px] font-semibold" style={{ color: 'var(--text-primary)' }}>Demo proposals</span>
          </div>
          <p className="text-[12px] mb-3" style={{ color: 'var(--text-muted)' }}>
            Open the existing trading surface for demo signals and proposals. Payments and live orders stay blocked.
          </p>
          <AxeButton onClick={() => navigate('/trading-intel')}>Open demo desk</AxeButton>
        </AxeCard>
        <AxeCard className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <ExternalLink size={18} style={{ color: 'var(--accent-cyan)' }} />
            <span className="text-[14px] font-semibold" style={{ color: 'var(--text-primary)' }}>Deeper UI</span>
          </div>
          <p className="text-[12px] mb-3" style={{ color: 'var(--text-muted)' }}>
            Full charts and broker tools live in AXE Companion / Trading OS — open from Apps or Companion.
          </p>
          <AxeButton onClick={() => navigate('/apps')}>Apps & products</AxeButton>
        </AxeCard>
      </div>
    </div>
  );
}
