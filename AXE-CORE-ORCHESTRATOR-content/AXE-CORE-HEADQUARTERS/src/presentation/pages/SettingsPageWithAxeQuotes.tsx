import SettingsPage from '@/presentation/pages/SettingsPage';
import { MindsetQuotesSection } from '@/presentation/components/settings/MindsetQuotesSection';

/**
 * Settings + AXE Quotes as one vertical stack (full width).
 * Quotes sit below the main settings scroll so they align with other blocks
 * (Voice Provider / Trust / etc.) instead of a centered top banner.
 */
export default function SettingsPageWithAxeQuotes() {
  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
      <div className="flex-1 min-h-0 overflow-hidden">
        <SettingsPage />
      </div>
      <div
        className="flex-shrink-0 w-full overflow-y-auto px-4 py-4"
        style={{
          borderTop: '1px solid rgba(255,255,255,0.06)',
          background: '#000',
        }}
      >
        <div className="w-full max-w-none">
          <MindsetQuotesSection />
        </div>
      </div>
    </div>
  );
}
