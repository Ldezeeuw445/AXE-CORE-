/**
 * nativePrompt — window.prompt replacement for Tauri WebView.
 * Shows a fixed modal via DOM (no React dependency) so Code Studio
 * New File / Folder work without the broken native prompt dialog.
 */

let styleInjected = false;

function ensureStyle() {
  if (styleInjected || typeof document === 'undefined') return;
  styleInjected = true;
  const s = document.createElement('style');
  s.id = 'axe-native-prompt-style';
  s.textContent = `
    #axe-native-prompt-root {
      position: fixed; inset: 0; z-index: 99999;
      display: flex; align-items: center; justify-content: center;
      background: rgba(0,0,0,0.72); backdrop-filter: blur(4px);
    }
    #axe-native-prompt-box {
      width: min(420px, 92vw);
      background: #0a0f12;
      border: 1px solid rgba(34,211,238,0.35);
      border-radius: 12px;
      padding: 16px 18px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.8), 0 0 24px rgba(34,211,238,0.12);
    }
    #axe-native-prompt-title {
      font: 600 12px/1.3 system-ui, sans-serif;
      color: #67e8f9; margin: 0 0 10px;
    }
    #axe-native-prompt-input {
      width: 100%; box-sizing: border-box;
      background: #050505; color: #e2e8f0;
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 8px; padding: 10px 12px;
      font: 13px/1.4 ui-monospace, monospace; outline: none;
    }
    #axe-native-prompt-input:focus {
      border-color: rgba(34,211,238,0.5);
    }
    #axe-native-prompt-actions {
      display: flex; gap: 8px; justify-content: flex-end; margin-top: 12px;
    }
    #axe-native-prompt-actions button {
      border-radius: 8px; padding: 7px 14px; font: 600 11px system-ui;
      cursor: pointer; border: 1px solid transparent;
    }
    #axe-native-prompt-cancel {
      background: transparent; color: #94a3b8; border-color: rgba(255,255,255,0.1);
    }
    #axe-native-prompt-ok {
      background: #22d3ee; color: #000;
    }
  `;
  document.head.appendChild(s);
}

/** Async prompt that works in Tauri (window.prompt does not). */
export function nativePrompt(message: string, defaultValue = ''): Promise<string | null> {
  if (typeof document === 'undefined') return Promise.resolve(null);
  ensureStyle();

  return new Promise((resolve) => {
    const existing = document.getElementById('axe-native-prompt-root');
    if (existing) existing.remove();

    const root = document.createElement('div');
    root.id = 'axe-native-prompt-root';
    root.innerHTML = `
      <div id="axe-native-prompt-box" role="dialog" aria-modal="true">
        <p id="axe-native-prompt-title"></p>
        <input id="axe-native-prompt-input" autocomplete="off" spellcheck="false" />
        <div id="axe-native-prompt-actions">
          <button type="button" id="axe-native-prompt-cancel">Cancel</button>
          <button type="button" id="axe-native-prompt-ok">Create</button>
        </div>
      </div>
    `;
    document.body.appendChild(root);

    const title = root.querySelector('#axe-native-prompt-title') as HTMLParagraphElement;
    const input = root.querySelector('#axe-native-prompt-input') as HTMLInputElement;
    const ok = root.querySelector('#axe-native-prompt-ok') as HTMLButtonElement;
    const cancel = root.querySelector('#axe-native-prompt-cancel') as HTMLButtonElement;

    title.textContent = message;
    input.value = defaultValue;
    setTimeout(() => { input.focus(); input.select(); }, 30);

    const finish = (value: string | null) => {
      root.remove();
      resolve(value);
    };

    ok.onclick = () => finish(input.value.trim() || null);
    cancel.onclick = () => finish(null);
    root.addEventListener('click', (e) => {
      if (e.target === root) finish(null);
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') finish(input.value.trim() || null);
      if (e.key === 'Escape') finish(null);
    });
  });
}
