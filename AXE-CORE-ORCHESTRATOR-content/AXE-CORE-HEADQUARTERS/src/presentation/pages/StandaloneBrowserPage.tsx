import BrowserApp from '@/presentation/components/browser/BrowserApp';

/** Standalone desktop browser — opens outside AppShell in its own Tauri window. */
export default function StandaloneBrowserPage() {
  return <BrowserApp standalone />;
}
