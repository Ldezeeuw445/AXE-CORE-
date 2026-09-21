import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Folder, GripHorizontal, Image, Mic, Paperclip, Plus, SquareArrowOutUpRight, X } from 'lucide-react';
import { AxeStatusOrb } from '@/presentation/components/layout/AxeStatusOrb';
import { BorderBeam } from 'border-beam';
import { useVoiceStore } from '@/presentation/store/voiceStore';
import { onlineDevices, type Device } from '@/infrastructure/gateways/computerRelay';
import { voorkeurMachine } from '@/infrastructure/persistence/voorkeurMachineService';
import { closeCurrentAuxWindow, restoreMainWindow } from '@/infrastructure/gateways/windowManagerService';
import { isTauriRuntime } from '@/infrastructure/config/apiUrl';

/**
 * This card is a real, undecorated (decorations:false) Tauri window, not a
 * div in the main window's DOM — see openPersonalComputerUse() in
 * windowManagerService.ts. Without a title bar there is no native way to
 * move or resize it, so both handles below call the window's own drag APIs
 * directly rather than tracking mouse deltas in JS: startDragging() and
 * startResizeDragging() hand the OS-level drag session to the window
 * manager, which is both correct (matches every other window on the Mac)
 * and far less code than reimplementing it.
 */
async function beginWindowDrag() {
  if (!isTauriRuntime()) return;
  const { getCurrentWindow } = await import('@tauri-apps/api/window');
  await getCurrentWindow().startDragging();
}

async function beginWindowResize() {
  if (!isTauriRuntime()) return;
  const { getCurrentWindow } = await import('@tauri-apps/api/window');
  await getCurrentWindow().startResizeDragging('SouthEast');
}

const QUICK = [
  { label: 'Downloads', prompt: 'Show me what is in Downloads.', icon: Folder },
  { label: 'Documents', prompt: 'Show me the Documents folder.', icon: Folder },
  { label: 'Screenshots', prompt: 'Find my recent screenshots.', icon: Image },
  { label: 'Desktop', prompt: 'Show me what is on the Desktop.', icon: Folder },
] as const;

export default function ComputerUseOverlay() {
  const voice = useVoiceStore();
  const [text, setText] = useState('');
  const [devices, setDevices] = useState<Device[]>([]);
  const [preferred, setPreferred] = useState<string | null>(null);

  useEffect(() => {
    void voice.loadConversation();
    const refresh = async () => {
      const [live, pref] = await Promise.all([onlineDevices().catch(() => []), voorkeurMachine().catch(() => null)]);
      setDevices(live);
      setPreferred(pref);
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 5_000);
    return () => window.clearInterval(timer);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const machine = useMemo(() => devices.find(d => d.id === preferred) ?? devices[0] ?? null, [devices, preferred]);
  const last = [...voice.conversation].reverse().find(m => m.role === 'axe');
  const busy = voice.voiceStatus === 'processing' || voice.voiceStatus === 'listening';

  async function submit(value = text) {
    const task = value.trim();
    if (!task || busy) return;
    setText('');
    await voice.sendMessage(`Use Personal Computer Use on my selected Mac for this task: ${task}`);
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void submit();
  }

  return (
    <main className="computer-use-overlay">
      <BorderBeam size="pulse-outside" colorVariant="mono" active strength={0.9}>
      <section className="computer-use-overlay__card" data-axe-doel="computer-use-composer">
        <div
          className="computer-use-overlay__draghandle"
          onMouseDown={() => void beginWindowDrag()}
          title="Drag to move"
        >
          <GripHorizontal size={14} />
        </div>
        <form className="computer-use-overlay__composer" onSubmit={onSubmit}>
          <div className="computer-use-overlay__particle">
            <AxeStatusOrb size={64} toonLabel={false} status={busy ? 'processing' : undefined} />
          </div>
          <input
            autoFocus
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="Start a task on your Mac…"
            aria-label="Personal Computer Use task"
          />
          <button type="button" className="computer-use-overlay__icon" title="Attach"><Paperclip size={17} /></button>
          <button type="button" className="computer-use-overlay__icon" title={voice.voiceStatus !== 'idle' ? 'Stop talking to AXE' : 'Talk to AXE'} onClick={() => void (voice.voiceStatus !== 'idle' ? voice.stopListening() : voice.startListening())}><Mic size={17} /></button>
          <button type="submit" className="computer-use-overlay__plus" title="Run task" disabled={!text.trim() || busy}><Plus size={20} /></button>
        </form>

        <div className="computer-use-overlay__meta">
          <span className={machine ? 'is-online' : 'is-offline'}>
            {machine ? `${machine.label} · online` : 'No Mac worker online'}
          </span>
          <span>{busy ? 'AXE is working…' : 'Personal Computer Use'}</span>
        </div>

        {last?.text && <div className="computer-use-overlay__reply">{last.text}</div>}

        <div className="computer-use-overlay__quick">
          {QUICK.map(item => {
            const Icon = item.icon;
            return (
              <button key={item.label} type="button" onClick={() => void submit(item.prompt)} disabled={busy}>
                <Icon size={22} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>

        <div className="computer-use-overlay__footer">
          <button type="button" onClick={() => void restoreMainWindow()}><SquareArrowOutUpRight size={14} /> AXE Core</button>
          <button type="button" onClick={() => void closeCurrentAuxWindow()}><X size={14} /> Close</button>
        </div>

        <div
          className="computer-use-overlay__resizehandle"
          onMouseDown={() => void beginWindowResize()}
          title="Drag to resize"
        />
      </section>
      </BorderBeam>
    </main>
  );
}
