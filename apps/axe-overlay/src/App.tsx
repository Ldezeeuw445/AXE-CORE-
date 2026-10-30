import { useCallback, useEffect, useRef, useState } from "react";
import { getLaunchAtLogin, resizeOverlay, setLaunchAtLogin } from "./config";
import { pingBackend, sendChat, type ChatMessage } from "./chat";

type UiMsg = { id: string; role: "user" | "assistant" | "error"; content: string };

const SYSTEM: ChatMessage = {
  role: "system",
  content:
    "Je bent AXE, Luka's floating notch-assistent op macOS. Kort, concreet, Nederlands tenzij anders gevraagd. Geen secrets printen. Geen trades/payments/mail versturen.",
};

export default function App() {
  const [open, setOpen] = useState(false);
  const [online, setOnline] = useState<boolean | null>(null);
  const [origin, setOrigin] = useState("");
  const [msgs, setMsgs] = useState<UiMsg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [loginItem, setLoginItem] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  const refreshHealth = useCallback(async () => {
    const r = await pingBackend();
    setOnline(r.ok);
    setOrigin(r.origin.replace(/^https?:\/\//, ""));
  }, []);

  useEffect(() => {
    void refreshHealth();
    void getLaunchAtLogin().then(setLoginItem);
    const t = window.setInterval(() => void refreshHealth(), 45_000);
    return () => window.clearInterval(t);
  }, [refreshHealth]);

  useEffect(() => {
    void resizeOverlay(open);
  }, [open]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [msgs, open]);

  const toggle = () => setOpen((v) => !v);

  const onSend = async () => {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    const userMsg: UiMsg = { id: `u-${Date.now()}`, role: "user", content: text };
    setMsgs((m) => [...m, userMsg]);
    setBusy(true);
    try {
      const history: ChatMessage[] = [
        SYSTEM,
        ...[...msgs, userMsg]
          .filter((x) => x.role !== "error")
          .slice(-12)
          .map((x) => ({ role: x.role as "user" | "assistant", content: x.content })),
      ];
      const reply = await sendChat(history);
      setMsgs((m) => [...m, { id: `a-${Date.now()}`, role: "assistant", content: reply }]);
      setOnline(true);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setMsgs((m) => [
        ...m,
        {
          id: `e-${Date.now()}`,
          role: "error",
          content: `${msg}\n\nZet je API-sleutel in:\n~/Library/Application Support/nl.axe.overlay/config.json\n{ "apiKey": "…" }`,
        },
      ]);
      setOnline(false);
    } finally {
      setBusy(false);
    }
  };

  const onToggleLogin = async () => {
    const next = !loginItem;
    await setLaunchAtLogin(next);
    setLoginItem(next);
  };

  return (
    <div className="shell">
      <button
        type="button"
        className={`notch${open ? " expanded" : ""}`}
        onClick={toggle}
        aria-expanded={open}
        aria-label="AXE overlay"
      >
        <span className={`dot ${online === true ? "ok" : online === false ? "bad" : ""}`} />
        <span className="brand">AXE</span>
        <span className="hint">{open ? "sluit" : "chat"}</span>
      </button>

      {open && (
        <div className="panel" role="dialog" aria-label="AXE chat">
          <div className="panel-head">
            <span>{origin || "backend"}</span>
            <button type="button" onClick={() => void refreshHealth()}>
              ping
            </button>
            <button type="button" onClick={toggle}>
              ×
            </button>
          </div>
          <div className="messages" ref={listRef}>
            {msgs.length === 0 && (
              <div className="msg assistant">
                Floating AXE — typ hier. Praat met de AXE-backend (geen secrets in de app).
              </div>
            )}
            {msgs.map((m) => (
              <div key={m.id} className={`msg ${m.role}`}>
                {m.content}
              </div>
            ))}
          </div>
          <form
            className="composer"
            onSubmit={(e) => {
              e.preventDefault();
              void onSend();
            }}
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Vraag AXE…"
              disabled={busy}
              autoFocus
            />
            <button type="submit" disabled={busy || !input.trim()}>
              {busy ? "…" : "→"}
            </button>
          </form>
          <div className="footer">
            <label>
              <input type="checkbox" checked={loginItem} onChange={() => void onToggleLogin()} />
              Start bij inloggen
            </label>
          </div>
        </div>
      )}
    </div>
  );
}
