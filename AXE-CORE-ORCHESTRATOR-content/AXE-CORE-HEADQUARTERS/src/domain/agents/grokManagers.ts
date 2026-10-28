/**
 * De zes Grok Bot-managers die Luka 27 okt 2026 in AXE Core wil: dezelfde
 * bots, naast de bestaande roster, niet in plaats van.
 *
 * De War Room-kolommen blijven tier 1–3. Deze groep heeft een eigen
 * MANAGERS-blok, een eigen 24/7-pulse, eigen geheugen (alleen echte lessen,
 * cap uit 3743aef) en harde grenzen in code — niet alleen in de prompt.
 */
import { agentsByTier, type AxeAgent } from './roster';

export const GROK_MANAGER_IDS = [
  'axemanager',
  'projectsmgr',
  'companionmgr',
  'axon',
  'tradingos',
  'northseamgr',
] as const;

export type GrokManagerId = (typeof GROK_MANAGER_IDS)[number];

export function isGrokManager(id: string | null | undefined): id is GrokManagerId {
  return !!id && (GROK_MANAGER_IDS as readonly string[]).includes(id);
}

export function grokManagers(): AxeAgent[] {
  return agentsByTier('managers');
}

/** AXE CORE Manager mag iedereen aanschrijven; de rest rapporteert alleen terug. */
export function magPeerBericht(from: string, to: string): boolean {
  if (!isGrokManager(from) || !isGrokManager(to) || from === to) return false;
  if (from === 'axemanager') return true;
  return to === 'axemanager';
}

export const AUTO_SEND_VLAGGEN = [
  'auto_send_qualification',
  'auto_reply_nonbinding',
  'auto_send_followups',
] as const;

export const GROK_REPO_SCOPE: Record<GrokManagerId, {
  repos: readonly string[];
  supabase?: string;
  tools: readonly string[];
}> = {
  axemanager: {
    repos: ['AXE-CORE-'],
    tools: ['run_shell', 'read_file', 'write_file', 'list_devices', 'run_on_device', 'run_crew', 'finish'],
  },
  projectsmgr: {
    repos: ['AXE-CORE-'],
    tools: ['run_shell', 'read_file', 'write_file', 'list_devices', 'run_on_device', 'finish'],
  },
  companionmgr: {
    repos: ['AXE-COMPANION-OS-'],
    tools: ['run_shell', 'read_file', 'write_file', 'list_devices', 'run_on_device', 'finish'],
  },
  axon: {
    repos: ['axon-memory'],
    supabase: 'ktaditgtbubonrahyiig',
    tools: ['run_shell', 'read_file', 'write_file', 'list_devices', 'run_on_device', 'finish'],
  },
  tradingos: {
    repos: ['trading-os-app', 'axe-trading-core', 'TRADING-OS'],
    tools: ['run_shell', 'read_file', 'list_devices', 'run_on_device', 'finish'],
  },
  northseamgr: {
    repos: ['AXE-CORE-'],
    tools: ['run_shell', 'read_file', 'list_devices', 'run_on_device', 'finish'],
  },
};

/** Cron van de 24/7-pulse, gelijk aan staande_diensten.py. */
export const GROK_PULSE: Record<GrokManagerId, string> = {
  axemanager: '*/10 * * * *',
  projectsmgr: '*/15 * * * *',
  companionmgr: '*/20 * * * *',
  axon: '*/20 * * * *',
  tradingos: '*/15 * * * *',
  northseamgr: '*/15 * * * *',
};

export interface ManagerActie {
  soort: string;
  tekst?: string;
  principal?: string;
  clientId?: string;
  bestaandeThread?: boolean;
  lukaJa?: boolean;
  inPlan?: boolean;
}

export type ManagerToets =
  | { ok: true }
  | { ok: false; code: 'auto_send' | 'send' | 'live_trade' | 'money' | 'deal' | 'not_human'; reason: string };

const SEND_RE = /\b(send[-_ ]?email|send[-_ ]?message|verstuur|outbound|smtp|mailgun|sendgrid|imessage|whatsapp)\b/i;
const TRADE_RE = /\b(place[-_ ]?order|live[-_ ]?order|broker|metaapi|mt5|open (a )?(long|short)|market order)\b/i;
const MONEY_RE = /\b(wire[-_ ]?transfer|send[-_ ]?money|buy credits|top up|iban|bank details)\b/i;
const DEAL_RE = /\b(deal go|go\/no-go|stage move|close (the )?deal|disclose (identity|counterparty)|auto_disclose)\b/i;
const FLAG_RE = new RegExp(`\\b(${AUTO_SEND_VLAGGEN.join('|')})\\b`, 'i');
const NON_HUMAN = /manager|service:|bot\b|axe-core|northsea-desk|agent/i;

/**
 * Luka's harde grenzen, in code. Een manager is nooit is_human.
 * Chase in een bestaande thread mag pas ná Luka's eigen ja.
 */
export function isHumanPrincipal(principal?: string, clientId?: string): boolean {
  const p = (principal || '').trim().toLowerCase();
  const c = (clientId || '').trim().toLowerCase();
  if (!p) return false;
  if (NON_HUMAN.test(p) || NON_HUMAN.test(c)) return false;
  if (isGrokManager(p)) return false;
  return p === 'luka' || p === 'claude-ai';
}

export function toetsManagerActie(actie: ManagerActie): ManagerToets {
  const blob = `${actie.soort} ${actie.tekst || ''}`.toLowerCase();
  if (FLAG_RE.test(blob) || AUTO_SEND_VLAGGEN.some((v) => blob.includes(v))) {
    return { ok: false, code: 'auto_send', reason: 'Never flip auto_send_* flags.' };
  }
  if (TRADE_RE.test(blob) || actie.soort === 'live_order') {
    return { ok: false, code: 'live_trade', reason: 'No live trading orders.' };
  }
  if (MONEY_RE.test(blob) || actie.soort === 'money') {
    return { ok: false, code: 'money', reason: 'No money movement.' };
  }
  if (DEAL_RE.test(blob) || actie.soort === 'deal_move') {
    return { ok: false, code: 'deal', reason: 'No deal go/no-go, stage move or identity disclosure.' };
  }
  if (SEND_RE.test(blob) || actie.soort === 'send') {
    const chaseOk = !!actie.bestaandeThread && !!actie.lukaJa && isHumanPrincipal(actie.principal, actie.clientId);
    if (!chaseOk) {
      if (!isHumanPrincipal(actie.principal, actie.clientId)) {
        return { ok: false, code: 'not_human', reason: 'Sends need Luka (is_human). Managers cannot approve themselves.' };
      }
      return { ok: false, code: 'send', reason: 'No out-of-plan send. Existing-thread chase only after Luka’s own yes.' };
    }
  }
  return { ok: true };
}
