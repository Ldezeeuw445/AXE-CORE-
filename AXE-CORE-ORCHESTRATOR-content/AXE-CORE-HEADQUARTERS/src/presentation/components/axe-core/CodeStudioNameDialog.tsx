import { useEffect, useRef, useState } from 'react';

/** In-app name prompt — window.prompt is blocked/broken in Tauri webviews. */
export function CodeStudioNameDialog({
  open,
  title,
  placeholder,
  onSubmit,
  onCancel,
}: {
  open: boolean;
  title: string;
  placeholder?: string;
  onSubmit: (value: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setValue('');
      setTimeout(() => inputRef.current?.focus(), 40);
    }
  }, [open]);

  if (!open) return null;

  const submit = () => {
    const v = value.trim();
    if (!v) return;
    onSubmit(v);
  };

  return (
    <div
      className="absolute inset-0 z-[60] flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(3px)' }}
      onClick={onCancel}
    >
      <div
        className="w-[360px] rounded-lg p-4 space-y-3"
        style={{ background: '#111', border: '1px solid rgba(34,211,238,0.25)', boxShadow: '0 16px 48px rgba(0,0,0,0.8)' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="text-[12px] font-medium" style={{ color: 'rgba(255,255,255,0.9)' }}>{title}</div>
        <input
          ref={inputRef}
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') submit();
            if (e.key === 'Escape') onCancel();
          }}
          placeholder={placeholder ?? 'path/relative/to/root'}
          className="w-full text-[12px] px-2.5 py-2 rounded-md outline-none"
          style={{ background: 'var(--bg-base)', border: '1px solid var(--border-active)', color: 'var(--text-primary)' }}
        />
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-3 py-1.5 rounded text-[11px]"
            style={{ color: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.1)' }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!value.trim()}
            className="px-3 py-1.5 rounded text-[11px] font-medium disabled:opacity-40"
            style={{ background: 'var(--accent-cyan)', color: '#000' }}
          >
            Create
          </button>
        </div>
      </div>
    </div>
  );
}

const AGENT_MSGS_KEY = 'axe_code_studio_agent_messages';
const AGENT_INPUT_KEY = 'axe_code_studio_agent_input';

export function loadAgentMessages<T>(): T[] {
  try {
    const raw = sessionStorage.getItem(AGENT_MSGS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveAgentMessages(messages: unknown[]): void {
  try {
    sessionStorage.setItem(AGENT_MSGS_KEY, JSON.stringify(messages.slice(-80)));
  } catch { /* quota */ }
}

export function loadAgentInput(): string {
  try {
    return sessionStorage.getItem(AGENT_INPUT_KEY) ?? '';
  } catch {
    return '';
  }
}

export function saveAgentInput(v: string): void {
  try {
    sessionStorage.setItem(AGENT_INPUT_KEY, v);
  } catch { /* ignore */ }
}
