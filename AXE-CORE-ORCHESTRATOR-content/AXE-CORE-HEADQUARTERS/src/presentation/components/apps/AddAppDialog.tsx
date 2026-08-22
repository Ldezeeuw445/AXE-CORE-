/**
 * AddAppDialog — put your own apps in the tab.
 *
 * The registry started as a list of things AXE builds, so every row was
 * something with a repo and a deploy. Ledger, Tangem and a bank app are none
 * of that: they are apps already on the phone, and the only thing the tab needs
 * to know is the package name. `user_added` keeps them apart from the four
 * product surfaces so neither list has to pretend to be the other.
 *
 * The package name is the field most likely to be wrong, and a wrong one fails
 * silently — Android's `getLaunchIntentForPackage` returns null for a typo
 * exactly as it does for an app that is not installed. So on the phone the
 * dialog checks it live and says which of the two it is BEFORE the row is
 * saved; picking from the known list avoids the question entirely.
 */
import { useState } from 'react';
import { Check, Loader2, X } from 'lucide-react';
import { sbInsertRow } from '@/infrastructure/gateways/axeCoreApiService';
import {
  androidShellAvailable, isAppInstalled, KNOWN_PACKAGES,
} from '@/infrastructure/gateways/androidAppsBridge';
import { AxeButton } from '@/presentation/components/ui/AxeUI';

interface AddAppDialogProps {
  onClose: () => void;
  onAdded: () => void;
}

const FIELD =
  'w-full px-3 h-9 rounded-lg bg-white/[0.04] border border-white/[0.08] text-[12px] ' +
  'text-white placeholder:text-white/25 outline-none focus:border-cyan-400/40';

export default function AddAppDialog({ onClose, onAdded }: AddAppDialogProps) {
  const [name, setName] = useState('');
  const [packageName, setPackageName] = useState('');
  const [url, setUrl] = useState('');
  const [iconUrl, setIconUrl] = useState('');
  const [color, setColor] = useState('#22D3EE');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onPhone = androidShellAvailable();
  const installed = onPhone && packageName ? isAppInstalled(packageName) : null;

  const pick = (label: string, pkg: string) => {
    setPackageName(pkg);
    if (!name.trim()) setName(label);
  };

  const save = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) { setError('Give the app a name.'); return; }
    if (!packageName.trim() && !url.trim()) {
      setError('An app needs either an Android package or a URL — otherwise the tile has nothing to open.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await sbInsertRow('registered_apps', {
        name: trimmedName,
        android_package: packageName.trim() || null,
        prod_url: url.trim() || null,
        icon_url: iconUrl.trim() || null,
        color,
        // Keeps Luka's own apps below the product surfaces without needing a
        // second query to work out where the list currently ends.
        sort_order: 500,
        user_added: true,
        enabled: true,
      });
      onAdded();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/70 p-0 sm:p-4">
      <div
        className="w-full sm:max-w-[420px] max-h-[88vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl
          bg-[#0a0a0c] border border-white/[0.08] p-4"
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[14px] font-semibold text-white">Add an app</h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-white/10" aria-label="Close">
            <X size={16} className="text-white/50" />
          </button>
        </div>

        <div className="flex flex-col gap-2.5">
          <div>
            <label className="text-[10px] uppercase tracking-wider text-white/40 mb-1 block">Name</label>
            <input className={FIELD} value={name} onChange={e => setName(e.target.value)} placeholder="Ledger Live" />
          </div>

          <div>
            <label className="text-[10px] uppercase tracking-wider text-white/40 mb-1 block">
              Android package
            </label>
            <input
              className={FIELD}
              value={packageName}
              onChange={e => setPackageName(e.target.value.trim())}
              placeholder="com.ledger.live"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
            />
            {/* Only shown on the phone: off-device there is nothing to check
                against, and a grey "unknown" badge would just add noise. */}
            {onPhone && packageName && (
              <div className="mt-1 text-[10px] flex items-center gap-1">
                {installed
                  ? <><Check size={11} className="text-emerald-400" /><span className="text-emerald-400">Installed on this phone</span></>
                  : <span className="text-amber-400">Not installed — check the package name, or install the app first</span>}
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-1">
            {KNOWN_PACKAGES.map(k => (
              <button
                key={k.packageName}
                onClick={() => pick(k.label, k.packageName)}
                className="px-2 py-1 rounded-md text-[10px] bg-white/[0.04] border border-white/[0.08]
                  text-white/60 hover:text-white hover:border-cyan-400/40"
              >
                {k.label}
              </button>
            ))}
          </div>

          <div>
            <label className="text-[10px] uppercase tracking-wider text-white/40 mb-1 block">
              Website <span className="text-white/25">(optional — used off the phone)</span>
            </label>
            <input className={FIELD} value={url} onChange={e => setUrl(e.target.value)} placeholder="https://…" inputMode="url" />
          </div>

          <div>
            <label className="text-[10px] uppercase tracking-wider text-white/40 mb-1 block">
              Icon URL <span className="text-white/25">(optional)</span>
            </label>
            <input className={FIELD} value={iconUrl} onChange={e => setIconUrl(e.target.value)} placeholder="https://…/icon.png" inputMode="url" />
          </div>

          <div className="flex items-center gap-2">
            <label className="text-[10px] uppercase tracking-wider text-white/40">Colour</label>
            <input
              type="color"
              value={color}
              onChange={e => setColor(e.target.value)}
              className="w-8 h-8 rounded-lg bg-transparent border border-white/[0.08] cursor-pointer"
            />
          </div>

          {error && <div className="text-[11px] text-red-400">{error}</div>}

          <div className="flex gap-2 pt-1">
            <AxeButton onClick={() => void save()} disabled={saving}>
              {saving ? <><Loader2 size={12} className="animate-spin" /> Saving…</> : 'Add app'}
            </AxeButton>
            <AxeButton variant="secondary" onClick={onClose}>Cancel</AxeButton>
          </div>
        </div>
      </div>
    </div>
  );
}
