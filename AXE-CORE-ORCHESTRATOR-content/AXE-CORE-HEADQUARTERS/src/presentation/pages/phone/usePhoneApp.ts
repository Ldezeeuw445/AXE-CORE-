import { isAndroidShellRuntime } from '@/infrastructure/config/apiUrl';
import { useIsMobile } from '@/presentation/hooks/use-mobile';

/** A17 / PWA-telefoon: niet de Tauri-desktop en niet de iPad. */
export function usePhoneApp(): boolean {
  return useIsMobile() || isAndroidShellRuntime();
}
