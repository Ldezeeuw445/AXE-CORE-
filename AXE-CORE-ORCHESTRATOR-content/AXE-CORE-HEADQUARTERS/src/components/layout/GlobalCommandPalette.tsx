/**
 * GlobalCommandPalette.tsx
 * ------------------------------------------------------------------
 * The actual command palette dialog — previously the search icon in
 * TopNav flipped `commandPaletteOpen` in uiStore but nothing rendered
 * a dialog off that flag, so it silently did nothing. This wires it up:
 * jump to any tab (from navRegistry, the same source of truth BottomNav
 * and chat navigation use) or run a couple of quick voice actions.
 */
import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import {
  CommandDialog, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem, CommandShortcut,
} from '@/components/ui/command';
import { useUIStore } from '@/store/uiStore';
import { useVoiceStore } from '@/store/voiceStore';
import { NAV_ITEMS } from '@/lib/navRegistry';
import { Mic, Settings, LogOut } from 'lucide-react';
import { getSupabase } from '@/core/supabase/client';

export function GlobalCommandPalette() {
  const { commandPaletteOpen, setCommandPaletteOpen } = useUIStore();
  const navigate = useNavigate();
  const voice = useVoiceStore();

  // Cmd/Ctrl+K opens the palette from anywhere (works alongside the search icon).
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCommandPaletteOpen(!commandPaletteOpen);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [commandPaletteOpen, setCommandPaletteOpen]);

  const go = (path: string) => { setCommandPaletteOpen(false); navigate(path); };

  return (
    <CommandDialog
      open={commandPaletteOpen}
      onOpenChange={setCommandPaletteOpen}
      title="Command Palette"
      description="Jump to a tab or run a quick action"
    >
      <CommandInput placeholder="Type a tab name or action…" />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Go to">
          {NAV_ITEMS.map(item => (
            <CommandItem key={item.path} value={`${item.label} ${item.keywords.join(' ')}`} onSelect={() => go(item.path)}>
              {item.label}
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandGroup heading="Quick actions">
          <CommandItem value="toggle microphone start listening" onSelect={() => { setCommandPaletteOpen(false); go('/'); voice.startListening().catch(() => {}); }}>
            <Mic /> Start talking to AXE
            <CommandShortcut>Space</CommandShortcut>
          </CommandItem>
          <CommandItem value="settings preferences" onSelect={() => go('/settings')}>
            <Settings /> Open Settings
          </CommandItem>
          <CommandItem value="sign out log out" onSelect={() => { setCommandPaletteOpen(false); void getSupabase()?.auth.signOut(); }}>
            <LogOut /> Sign out
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
