import { useEffect, useMemo, useState } from 'react';
import { Folder, GripHorizontal, Image, Mic, Paperclip, Plus, SquareArrowOutUpRight, X } from 'lucide-react';
import { AxeStatusOrb } from '@/presentation/components/layout/AxeStatusOrb';
import { BorderBeam } from 'border-beam';
import { AxeComposerVak } from '@/presentation/components/layout/AxeComposerVak';
import { useVoiceStore } from '@/presentation/store/voiceStore';
import { dispatchComputerTask, onlineDevices, type Device } from '@/infrastructure/gateways/computerRelay';
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
  { label: 'Downloads', path: 'Downloads', screenshotsOnly: false, icon: Folder },
  { label: 'Documents', path: 'Documents', screenshotsOnly: false, icon: Folder },
  { label: 'Screenshots', path: 'Desktop', screenshotsOnly: true, icon: Image },
  { label: 'Desktop', path: 'Desktop', screenshotsOnly: false, icon: Folder },
] as const;

export default function ComputerUseOverlay() {
  const voice = useVoiceStore();
  const [text, setText] = useState('');
  const [devices, setDevices] = useState<Device[]>([]);
  const [preferred, setPreferred] = useState<string | null>(null);
  const [toolBusy, setToolBusy] = useState(false);
  const [toolReply, setToolReply] = useState<string | null>(null);
  const [permissions, setPermissions] = useState<{ screen_recording: boolean; accessibility: boolean } | null>(null);

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
  const busy = voice.voiceStatus === 'processing' || voice.voiceStatus === 'listening' || toolBusy;

  useEffect(() => {
    if (!machine) {
      setPermissions(null);
      return;
    }
    let cancelled = false;
    void dispatchComputerTask({
      tool: 'computer.permissions',
      tier: 'observe',
      workspace: '@device',
      device: machine.id,
      args: {},
    }).then(result => {
      if (cancelled || !result.ok) return;
      try {
        const parsed = JSON.parse(result.text) as { screen_recording?: boolean; accessibility?: boolean };
        setPermissions({ screen_recording: parsed.screen_recording === true, accessibility: parsed.accessibility === true });
      } catch { /* older worker: readiness remains unknown */ }
    });
    return () => { cancelled = true; };
  }, [machine?.id]);

  async function requestPermission(tool: 'computer.permissions.request_screen' | 'computer.permissions.request_accessibility') {
    if (!machine || toolBusy) return;
    setToolBusy(true);
    setToolReply(null);
    try {
      const result = await dispatchComputerTask({
        tool,
        tier: 'safe_execute',
        workspace: '@device',
        device: machine.id,
        args: {},
      });
      setToolReply(result.text);
      const status = await dispatchComputerTask({
        tool: 'computer.permissions',
        tier: 'observe',
        workspace: '@device',
        device: machine.id,
        args: {},
      });
      if (status.ok) {
        const parsed = JSON.parse(status.text) as { screen_recording?: boolean; accessibility?: boolean };
        setPermissions({ screen_recording: parsed.screen_recording === true, accessibility: parsed.accessibility === true });
      }
    } catch (e) {
      setToolReply(e instanceof Error ? e.message : String(e));
    } finally {
      setToolBusy(false);
    }
  }
  async function runQuick(path: 'Desktop' | 'Documents' | 'Downloads', screenshotsOnly: boolean) {
    if (!machine || toolBusy) {
      if (!machine) setToolReply('No Mac worker is online, so AXE cannot read that folder.');
      return;
    }
    setToolBusy(true);
    setToolReply(null);
    try {
      const result = await dispatchComputerTask({
        tool: 'personal.files.list',
        tier: 'observe',
        workspace: 'AXE Core',
        device: machine.id,
        args: { path },
      });
      if (!result.ok) {
        setToolReply(result.text);
        return;
      }
      if (!screenshotsOnly) {
        setToolReply(result.text);
        return;
      }
      const shots = result.text
        .split('\n')
        .filter(line => /screen ?shot|schermafbeelding|\.png$|\.jpe?g$|\.webp$/i.test(line))
        .slice(0, 80);
      setToolReply(shots.length ? shots.join('\n') : 'No screenshot-like image files found on the Desktop.');
    } finally {
      setToolBusy(false);
    }
  }

  async function submit(value = text) {
    const task = value.trim();
    if (!task || busy) return;
    setText('');
    // This surface is explicitly for machine actions. Give this one turn the
    // structured/native tool loop even when Luka keeps ordinary chat on the
    // legacy marker route; clear it immediately afterwards so the preference
    // never leaks into unrelated conversations.
    try { localStorage.setItem('axe_native_tools_once', '1'); } catch { /* private mode */ }
    try {
      await voice.sendMessage(`Use Personal Computer Use on my selected Mac for this task: ${task}`);
    } finally {
      try { localStorage.removeItem('axe_native_tools_once'); } catch { /* private mode */ }
    }
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
        <AxeComposerVak
          waarde={text}
          opWaarde={setText}
          opVerstuur={() => void submit()}
          plaatshouder="Start a task on your Mac…"
          links={
            <div className="computer-use-overlay__particle">
              <AxeStatusOrb size={20} toonLabel={false} status={busy ? 'processing' : undefined} />
            </div>
          }
          rechts={
            <>
              <button type="button" className="computer-use-overlay__icon" title="Attach"><Paperclip size={17} /></button>
              <button
                type="button"
                className="computer-use-overlay__icon"
                title={voice.voiceStatus !== 'idle' ? 'Stop talking to AXE' : 'Talk to AXE'}
                onClick={() => void (voice.voiceStatus !== 'idle' ? voice.stopListening() : voice.startListening())}
              >
                <Mic size={17} />
              </button>
              <button
                type="button"
                className="computer-use-overlay__plus"
                title="Run task"
                disabled={!text.trim() || busy}
                onClick={() => void submit()}
              >
                <Plus size={20} />
              </button>
            </>
          }
        />

        <div className="computer-use-overlay__meta">
          <span className={machine ? 'is-online' : 'is-offline'}>
            {machine ? `${machine.label} · online` : 'No Mac worker online'}
          </span>
          <span>{busy ? 'AXE is working…' : 'Personal Computer Use'}</span>
        </div>

        {machine && (
          <div className="computer-use-overlay__permissions">
            <button
              type="button"
              data-ready={permissions?.screen_recording === true ? 'yes' : 'no'}
              onClick={() => permissions?.screen_recording ? undefined : void requestPermission('computer.permissions.request_screen')}
              title={permissions?.screen_recording ? 'Screen Recording granted' : 'Grant Screen Recording on this Mac'}
            >
              Screen {permissions?.screen_recording ? '✓' : 'needs permission'}
            </button>
            <button
              type="button"
              data-ready={permissions?.accessibility === true ? 'yes' : 'no'}
              onClick={() => permissions?.accessibility ? undefined : void requestPermission('computer.permissions.request_accessibility')}
              title={permissions?.accessibility ? 'Accessibility granted' : 'Grant Accessibility on this Mac'}
            >
              Control {permissions?.accessibility ? '✓' : 'needs permission'}
            </button>
          </div>
        )}

        {(toolReply ?? last?.text) && <div className="computer-use-overlay__reply">{toolReply ?? last?.text}</div>}

        <div className="computer-use-overlay__quick">
          {QUICK.map(item => {
            const Icon = item.icon;
            return (
              <button key={item.label} type="button" onClick={() => void runQuick(item.path, item.screenshotsOnly)} disabled={busy}>
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
