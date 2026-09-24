/**
 * MobileSystem — de mobiele home van AXE CORE (`/#/mobile`).
 *
 * Dit is het scherm waar de Samsung-APK op opent, en het is de basis net als de
 * Tauri-home: de plaat met wallpaper (MobileGlass), en in het midden de
 * AXE-sphere zolang er niets gevraagd is — zodra je typt, verschijnt het gesprek
 * (MobileChat) op diezelfde plek, met de composer eronder. De chat draait op de
 * bestaande voiceStore, die al naar de cloud-providers én het lokale model op de
 * Samsung (Gemma) routeert; hier wordt niets van die verbindingen opnieuw
 * gebouwd, alleen mobiel weergegeven.
 *
 * De glance (klok, wat wacht, algo) staat niet meer hier maar op het lock
 * screen. Navigatie naar alle tabs zit in de lade van links (MobileNav).
 *
 * De pagina rendert zijn eigen volledige inhoud, dus hij werkt op de
 * command-surface van de Android-shell (waar de desktop-chrome verborgen is).
 */
import { RotateCcw } from 'lucide-react';
import { AxeCoreSphere } from '@/presentation/components/axe-core/sphere/AxeCoreSphere';
import { MobileGlass, LookToggle } from '@/presentation/components/layout/MobileGlass';
import { MobileComposer } from '@/presentation/components/layout/MobileComposer';
import { MobileChat } from '@/presentation/components/layout/MobileChat';
import { useVoiceStore } from '@/presentation/store/voiceStore';

export default function MobileSystem() {
  const conversation = useVoiceStore((s) => s.conversation);
  const clearConversation = useVoiceStore((s) => s.clearConversation);
  const hasChat = conversation.length > 0;

  return (
    <div className="relative flex h-full min-h-0 w-full flex-col overflow-hidden">
      <MobileGlass />
      <div className="relative z-[1] mx-auto flex h-full w-full max-w-md flex-col px-4 pb-4 pt-2">
        {/* Bovenrij: links "Nieuw" (alleen tijdens een gesprek), rechts zon/maan.
            De hamburger van de lade staat linksboven (AppShell). */}
        <div className="flex flex-none items-center justify-between pt-1">
          {hasChat ? (
            <button
              type="button"
              onClick={() => clearConversation()}
              className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-medium"
              style={{ background: 'var(--surface-bg)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }}
            >
              <RotateCcw size={13} /> Nieuw
            </button>
          ) : (
            <span />
          )}
          <LookToggle />
        </div>

        {/* Sphere als rustpunt; zodra er een gesprek is, komt de chat op die plek. */}
        <div className="relative flex min-h-0 flex-1 flex-col">
          {hasChat ? <MobileChat /> : <AxeCoreSphere />}
        </div>

        <MobileComposer />
      </div>
    </div>
  );
}
