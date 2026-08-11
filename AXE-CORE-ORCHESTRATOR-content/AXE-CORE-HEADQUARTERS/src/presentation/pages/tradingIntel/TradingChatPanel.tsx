/**
 * TradingChatPanel — talk to AXE ALGO directly. Bottom-right of the Brain
 * tab. Thin wrapper: state lives in useAxeAlgoChat, UI in
 * AxeAlgoChatSurface — both shared with the RightPanel widget and the
 * floating window, so it's one chat everywhere, not three.
 */
import { useAxeAlgoChat } from '@/presentation/hooks/useAxeAlgoChat';
import { AxeAlgoChatSurface } from '@/presentation/components/shared/AxeAlgoChatSurface';
import { useAxeAlgoWidgetStore } from '@/presentation/store/axeAlgoWidgetStore';
import { AGENT_NAME, type TradingDeskState } from './useTradingDeskState';

export function TradingChatPanel({ desk }: { desk: TradingDeskState }) {
  const chat = useAxeAlgoChat(desk);
  const openFloating = useAxeAlgoWidgetStore(s => s.openFloating);
  return <AxeAlgoChatSurface chat={chat} title={`Talk to ${AGENT_NAME}`} onExpand={openFloating} />;
}
