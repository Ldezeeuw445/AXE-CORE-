/**
 * Geld achter een PIN (Life OS, 26 nov). Zonder PIN: de pagina zoals altijd,
 * met "Lock with PIN" erboven. Met PIN: eerst de PIN, dan 10 minuten open in
 * dit venster. Een privacyscherm tegen meekijken, geen bankslot -- de hash
 * staat alleen op dit apparaat (zie domain/geldPin.ts).
 */
import { useEffect, useState, type ReactNode } from 'react';
import { Lock, LockOpen } from 'lucide-react';
import {
  MAX_CIJFERS, MIN_CIJFERS, OPEN_MS, geldigePin, leesPinRecord, maakPinRecord, nogOpen, pinKlopt, type PinRecord,
} from '@/domain/geldPin';

const RECORD = 'axe_geld_pin_v1';
const OPEN_TOT = 'axe_geld_open_tot';
const MAX_POGINGEN = 5;
const WACHT_MS = 30_000;

function leesRecord(): PinRecord | null {
  try { return leesPinRecord(localStorage.getItem(RECORD)); } catch { return null; }
}
function leesOpenTot(): number | null {
  try { return Number(sessionStorage.getItem(OPEN_TOT)) || null; } catch { return null; }
}
function zetOpenTot(v: number | null): void {
  try { if (v) sessionStorage.setItem(OPEN_TOT, String(v)); else sessionStorage.removeItem(OPEN_TOT); } catch { /* privémodus */ }
}

const knop = 'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium border border-white/10 hover:bg-white/5';
const veld = 'w-36 rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-center tracking-[0.4em] text-base';

function PinVeld({ waarde, zet, label, autoFocus }: { waarde: string; zet: (v: string) => void; label: string; autoFocus?: boolean }) {
  return (
    <input
      aria-label={label}
      className={veld}
      type="password"
      inputMode="numeric"
      autoComplete="off"
      maxLength={MAX_CIJFERS}
      autoFocus={autoFocus}
      value={waarde}
      onChange={(e) => zet(e.target.value.replace(/\D/g, '').slice(0, MAX_CIJFERS))}
    />
  );
}

export default function GeldSlot({ children }: { children: ReactNode }) {
  const [record, setRecord] = useState<PinRecord | null>(leesRecord);
  const [openTot, setOpenTot] = useState<number | null>(leesOpenTot);
  const [nu, setNu] = useState(Date.now());
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');
  const [modus, setModus] = useState<'rust' | 'instellen' | 'weghalen' | 'vergeten'>('rust');
  const [fout, setFout] = useState<string | null>(null);
  const [pogingen, setPogingen] = useState(0);
  const [wachtTot, setWachtTot] = useState(0);
  const [bezig, setBezig] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setNu(Date.now()), 15_000);
    return () => clearInterval(t);
  }, []);

  const open = !record || nogOpen(openTot, nu);
  const reset = () => { setPin(''); setPin2(''); setFout(null); setModus('rust'); };

  const ontgrendel = async () => {
    if (!record || bezig) return;
    if (Date.now() < wachtTot) { setFout('Too many tries. Wait 30 seconds.'); return; }
    setBezig(true);
    const goed = await pinKlopt(pin, record);
    setBezig(false);
    if (!goed) {
      const n = pogingen + 1;
      setPogingen(n);
      setPin('');
      if (n >= MAX_POGINGEN) { setWachtTot(Date.now() + WACHT_MS); setPogingen(0); setFout('Too many tries. Wait 30 seconds.'); }
      else setFout('Wrong PIN.');
      return;
    }
    const tot = Date.now() + OPEN_MS;
    zetOpenTot(tot);
    setOpenTot(tot);
    setNu(Date.now());
    setPogingen(0);
    reset();
  };

  const stelIn = async () => {
    if (!geldigePin(pin)) { setFout(`Use ${MIN_CIJFERS} to ${MAX_CIJFERS} digits.`); return; }
    if (pin !== pin2) { setFout('The two PINs are not the same.'); return; }
    setBezig(true);
    const r = await maakPinRecord(pin);
    setBezig(false);
    try { localStorage.setItem(RECORD, JSON.stringify(r)); } catch { setFout('Could not save the PIN on this device.'); return; }
    const tot = Date.now() + OPEN_MS;
    zetOpenTot(tot);
    setOpenTot(tot);
    setRecord(r);
    setNu(Date.now());
    reset();
  };

  const haalWeg = async () => {
    if (!record) return;
    setBezig(true);
    const goed = modus === 'vergeten' || await pinKlopt(pin, record);
    setBezig(false);
    if (!goed) { setPin(''); setFout('Wrong PIN.'); return; }
    try { localStorage.removeItem(RECORD); } catch { /* privémodus */ }
    zetOpenTot(null);
    setOpenTot(null);
    setRecord(null);
    reset();
  };

  const vergrendel = () => { zetOpenTot(null); setOpenTot(null); reset(); };

  if (!open) {
    return (
      <div data-axe-geld-slot="dicht" className="flex min-h-[60vh] flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
        <Lock className="h-8 w-8 opacity-70" aria-hidden />
        <div>
          <div className="text-lg font-semibold">Finance is locked</div>
          <div className="mt-1 text-sm opacity-70">Enter your PIN to see amounts. It stays open for 10 minutes.</div>
        </div>
        {modus === 'vergeten' ? (
          <div className="flex max-w-sm flex-col items-center gap-3 text-sm">
            <p className="opacity-80">This lock only hides the page from people looking at your screen. Removing it shows Finance again; you can set a new PIN after.</p>
            <div className="flex gap-2">
              <button type="button" className={knop} onClick={() => void haalWeg()} data-axe-geld-wis>Remove the lock</button>
              <button type="button" className={knop} onClick={reset}>Cancel</button>
            </div>
          </div>
        ) : (
          <form className="flex flex-col items-center gap-3" onSubmit={(e) => { e.preventDefault(); void ontgrendel(); }}>
            <PinVeld waarde={pin} zet={setPin} label="PIN" autoFocus />
            <button type="submit" className={knop} disabled={bezig || pin.length < MIN_CIJFERS} data-axe-geld-open>
              <LockOpen className="h-3.5 w-3.5" aria-hidden /> Unlock
            </button>
            <button type="button" className="text-xs underline opacity-60" onClick={() => { setModus('vergeten'); setFout(null); }}>Forgot PIN?</button>
          </form>
        )}
        {fout && <div role="alert" className="text-sm text-red-400">{fout}</div>}
      </div>
    );
  }

  const minuten = record && openTot ? Math.max(1, Math.ceil((openTot - nu) / 60_000)) : 0;
  return (
    <div data-axe-geld-slot={record ? 'open' : 'geen-pin'} className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center justify-end gap-2 px-4 pt-2 text-xs opacity-80">
        {modus === 'instellen' ? (
          <form className="flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); void stelIn(); }}>
            <span>New PIN</span>
            <PinVeld waarde={pin} zet={setPin} label="New PIN" autoFocus />
            <PinVeld waarde={pin2} zet={setPin2} label="Repeat PIN" />
            <button type="submit" className={knop} disabled={bezig} data-axe-geld-zet>Save</button>
            <button type="button" className={knop} onClick={reset}>Cancel</button>
          </form>
        ) : modus === 'weghalen' ? (
          <form className="flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); void haalWeg(); }}>
            <span>Current PIN</span>
            <PinVeld waarde={pin} zet={setPin} label="Current PIN" autoFocus />
            <button type="submit" className={knop} disabled={bezig}>Remove PIN</button>
            <button type="button" className={knop} onClick={reset}>Cancel</button>
          </form>
        ) : record ? (
          <>
            <span>Locks again in {minuten} min</span>
            <button type="button" className={knop} onClick={vergrendel} data-axe-geld-dicht><Lock className="h-3.5 w-3.5" aria-hidden /> Lock now</button>
            <button type="button" className={knop} onClick={() => { setModus('weghalen'); setFout(null); }}>Remove PIN</button>
          </>
        ) : (
          <button type="button" className={knop} onClick={() => { setModus('instellen'); setFout(null); }} data-axe-geld-instellen>
            <Lock className="h-3.5 w-3.5" aria-hidden /> Lock with PIN
          </button>
        )}
        {fout && <span role="alert" className="text-red-400">{fout}</span>}
      </div>
      {children}
    </div>
  );
}
