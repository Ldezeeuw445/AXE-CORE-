/** Pil bovenin zolang de focus loopt: hoe lang nog, en eerder stoppen. */
import { Moon } from 'lucide-react';
import { stopFocusVanPil, useFocusRest } from '@/presentation/store/focusStore';

export function FocusPil() {
  const rest = useFocusRest();
  if (!rest) return null;
  return (
    <div
      data-axe-focus-pil
      className="fixed left-1/2 top-2 z-[60] flex -translate-x-1/2 items-center gap-2 rounded-full border border-white/10 bg-black/70 px-3 py-1 text-xs text-white/85 backdrop-blur"
    >
      <Moon className="h-3.5 w-3.5" aria-hidden />
      <span>Focus · {rest} left</span>
      <button type="button" className="underline opacity-70 hover:opacity-100" onClick={stopFocusVanPil}>End</button>
    </div>
  );
}
