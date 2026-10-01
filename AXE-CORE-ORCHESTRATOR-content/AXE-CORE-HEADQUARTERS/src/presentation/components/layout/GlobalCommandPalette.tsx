/**
 * GlobalCommandPalette.tsx
 * ------------------------------------------------------------------
 * The actual command palette dialog — previously the search icon in
 * TopNav flipped `commandPaletteOpen` in uiStore but nothing rendered
 * a dialog off that flag, so it silently did nothing. This wires it up:
 * jump to any tab (from navRegistry, the same source of truth BottomNav
 * and chat navigation use) or run a couple of quick voice actions.
 *
 * Sinds 1 okt 2026 staan de vijf skills hier ook (bouwlijst 6.7). Ze komen uit
 * `domain/tierRouter/axeSkills.ts` -- niet vijf keer handgeschreven JSX, want dan
 * staan ze straks op vier oppervlakken net anders. En ze starten niets eigens:
 * een skillknop stuurt zijn eigen LABEL als bericht, en de router herkent dat met
 * dezelfde regex als wanneer Luka het typt of zegt. Daarom is er geen vierde
 * pad: knop, typen en stem komen alle drie bij dezelfde tabel uit.
 */
import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import {
  CommandDialog, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem, CommandShortcut,
} from '@/presentation/components/ui/command';
import { useUIStore } from '@/presentation/store/uiStore';
import { useVoiceStore } from '@/presentation/store/voiceStore';
import { NAV_ITEMS } from '@/domain/navRegistry';
import { Mic, Settings, LogOut, Sparkles } from 'lucide-react';
import { AXE_SKILLS } from '@/domain/tierRouter/axeSkills';
import { getSupabase } from '@/infrastructure/supabase/supabaseClient';

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
        <CommandGroup heading="Run a skill">
          {AXE_SKILLS.map((skill) => (
            <CommandItem
              key={skill.id}
              value={`${skill.label} ${skill.id} ${skill.uitleg}`}
              onSelect={() => {
                setCommandPaletteOpen(false);
                void voice.sendMessage(skill.label);
              }}
            >
              <Sparkles /> {skill.label}
              <span className="ml-2 text-[10px]" style={{ color: 'var(--text-muted)' }}>{skill.uitleg}</span>
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandGroup heading="Quick actions">
          {voice.voiceStatus !== 'idle' ? (
            <CommandItem value="toggle microphone stop listening hang up" onSelect={() => { setCommandPaletteOpen(false); voice.stopListening(); }}>
              <Mic /> Stop talking to AXE
              <CommandShortcut>Space</CommandShortcut>
            </CommandItem>
          ) : (
            <CommandItem value="toggle microphone start listening" onSelect={() => { setCommandPaletteOpen(false); go('/'); voice.startListening().catch(() => {}); }}>
              <Mic /> Start talking to AXE
              <CommandShortcut>Space</CommandShortcut>
            </CommandItem>
          )}
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
