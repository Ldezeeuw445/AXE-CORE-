/**
 * useKeyboardShortcuts.ts
 * ------------------------------------------------------------------
 * Global keyboard shortcuts for AXE CORE:
 * - Spacebar on Home = toggle microphone
 * - Cmd/Ctrl + letter = navigate to tabs
 */

import { useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router';

/** Tab shortcuts — Cmd/Ctrl + key → route */
const TAB_SHORTCUTS: Record<string, string> = {
  h: '/',
  a: '/ai-core',
  m: '/memory',
  k: '/knowledge',
  p: '/mcp',
  i: '/infrastructure',
  c: '/control-plane',
  t: '/command',
  d: '/developer',
  s: '/settings',
  g: '/crewai',
  f: '/finance',
  r: '/trading',
  e: '/code-editor',
  v: '/eve',
};

export function useKeyboardShortcuts({
  onSpacebar,
}: {
  onSpacebar?: () => void;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const isHome = location.pathname === '/' || location.pathname === '';

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Don't trigger when typing in inputs/textareas
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || (e.target as HTMLElement)?.isContentEditable) {
        return;
      }

      // Spacebar on Home = microphone toggle
      if (e.code === 'Space' && isHome && onSpacebar) {
        e.preventDefault();
        onSpacebar();
        return;
      }

      // Cmd/Ctrl + letter = tab navigation
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey) {
        const key = e.key.toLowerCase();
        const path = TAB_SHORTCUTS[key];
        if (path) {
          e.preventDefault();
          navigate(path);
        }
      }
    },
    [navigate, isHome, onSpacebar]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}
