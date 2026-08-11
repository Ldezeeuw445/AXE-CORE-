/**
 * AxeAlgoFloatingChat — persistent floating chat window, mounted once at
 * the App shell root (sibling to <Outlet/>, same pattern as RightPanel) so
 * it stays open across every route in the app, not just the Trading tab.
 * position: fixed rather than absolute — several ancestors in the shell
 * are overflow-hidden, which would clip an absolutely-positioned panel.
 */
import { useAxeAlgoChat } from '@/presentation/hooks/useAxeAlgoChat';
import { AxeAlgoChatSurface } from '@/presentation/components/shared/AxeAlgoChatSurface';
import { useAxeAlgoWidgetStore } from '@/presentation/store/axeAlgoWidgetStore';

export function AxeAlgoFloatingChat() {
  const floatingOpen = useAxeAlgoWidgetStore(s => s.floatingOpen);
  const closeFloating = useAxeAlgoWidgetStore(s => s.closeFloating);
  const chat = useAxeAlgoChat();

  if (!floatingOpen) return null;

  return (
    <div
      className="flex flex-col"
      style={{
        position: 'fixed',
        right: 16,
        bottom: 16,
        width: 360,
        height: 520,
        maxHeight: 'calc(100dvh - 32px)',
        zIndex: 200,
        boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
        borderRadius: 12,
      }}
    >
      <AxeAlgoChatSurface chat={chat} title="AXE ALGO" onClose={closeFloating} />
    </div>
  );
}
