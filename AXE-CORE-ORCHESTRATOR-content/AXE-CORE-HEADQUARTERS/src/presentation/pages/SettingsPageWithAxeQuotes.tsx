import SettingsPage from '@/presentation/pages/SettingsPage';
import { MindsetQuotesSection } from '@/presentation/components/settings/MindsetQuotesSection';

/**
 * Wraps the full Settings page and pins the AXE Quotes editor at the top
 * so Luka can manage user quotes without hunting through a huge file.
 */
export default function SettingsPageWithAxeQuotes() {
  return (
    <div className="flex-1 flex flex-col overflow-hidden min-h-0">
      <div
        className="flex-shrink-0 px-4 pt-4 pb-2 border-b"
        style={{ borderColor: 'var(--border-subtle)', background: '#000' }}
      >
        <div className="max-w-2xl mx-auto">
          <MindsetQuotesSection />
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-hidden">
        <SettingsPage />
      </div>
    </div>
  );
}
