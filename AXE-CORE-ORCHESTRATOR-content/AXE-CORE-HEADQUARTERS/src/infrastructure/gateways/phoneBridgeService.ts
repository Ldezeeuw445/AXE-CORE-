/**
 * phoneBridgeService — the Samsung, as something AXE can look at and touch.
 *
 * Same shape as localBridgeService, one device over: this side speaks, the
 * bridge holds the rails. The action allowlist, the argument validation and
 * the device-shell quoting all live in `infra/axe-local-bridge/adb.mjs`,
 * because a limit enforced in the browser is a limit anyone can edit.
 *
 * ## Look before you touch
 *
 * `phoneLook()` is free of consequence and returns what is on screen; every
 * function that moves the phone is gated on approval in the tool registry.
 * That split is the whole design: a model that must first show you the screen
 * it is about to tap cannot quietly act on a screen you never saw.
 *
 * ## Why elements, not pixels
 *
 * `ui_dump` comes back as a list of labelled points, not a screenshot to
 * squint at. Measured on a Google results page the raw XML was over 200 KB;
 * parsed to what a finger can reach it is 3 KB. Tapping by label is also the
 * difference between "press Inloggen" and "press 939,342" — the second is a
 * guess that survives exactly until the layout shifts.
 */

const BRIDGE_URL =
  (import.meta.env.VITE_AXE_BRIDGE_URL as string | undefined) ?? 'http://127.0.0.1:4599';
const BRIDGE_TOKEN = (import.meta.env.VITE_AXE_BRIDGE_TOKEN as string | undefined) ?? '';

export const isPhoneBridgeConfigured = Boolean(BRIDGE_TOKEN);

/** One thing on screen that a finger could reach. */
export interface PhoneElement {
  label: string;
  x: number;
  y: number;
  /** Android reports this node as clickable. */
  tap?: boolean;
  /** A text field — `phoneType` needs this focused first. */
  editable?: boolean;
  id?: string;
}

export interface PhoneDevice {
  serial: string;
  state: string;
  model: string | null;
}

/** Actions that change nothing. Mirrors ADB_READONLY in the bridge. */
export type PhoneLookAction = 'screenshot' | 'ui_dump' | 'current_app' | 'screen_size';

/** Actions that move the phone. Every one is approval-gated. */
export type PhoneDoAction = 'tap' | 'swipe' | 'text' | 'key' | 'open_url' | 'launch';

export interface PhoneResult {
  ok: boolean;
  action: string;
  device: string;
  /** screenshot only — base64 PNG, no data: prefix. */
  png?: string;
  /** ui_dump only. */
  elements?: PhoneElement[];
  count?: number;
  stdout?: string;
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BRIDGE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${BRIDGE_TOKEN}`,
      ...(init?.headers ?? {}),
    },
    // uiautomator on a busy page is the slow one; nothing here should ever
    // outlast a chat turn's patience.
    signal: AbortSignal.timeout(90_000),
  });
  const body = await res.json().catch(() => ({ error: res.statusText }));
  if (!res.ok) throw new Error(body?.error ?? `bridge ${res.status}`);
  return body as T;
}

/**
 * Which phones adb can see right now.
 *
 * Returns state as adb reports it, unflattened: `unauthorized` (the USB
 * prompt was never accepted) and `offline` are different problems with
 * different fixes, and collapsing them into "no phone" throws away the
 * diagnosis.
 */
export async function phoneDevices(): Promise<{ adb: string | null; devices: PhoneDevice[] }> {
  return call('/adb/devices');
}

export async function phoneIsReady(): Promise<boolean> {
  if (!BRIDGE_TOKEN) return false;
  try {
    const { devices } = await phoneDevices();
    return devices.some(d => d.state === 'device');
  } catch {
    return false;
  }
}

export async function phoneLook(
  action: PhoneLookAction,
  serial?: string,
): Promise<PhoneResult> {
  return call('/adb', {
    method: 'POST',
    body: JSON.stringify({ action, serial: serial ?? null }),
  });
}

export async function phoneDo(
  action: PhoneDoAction,
  params: Record<string, unknown>,
  serial?: string,
): Promise<PhoneResult> {
  return call('/adb', {
    method: 'POST',
    body: JSON.stringify({ action, params, serial: serial ?? null }),
  });
}

/**
 * Find an element by its visible label.
 *
 * Case-insensitive, exact match first, then a contains-match — deliberately
 * in that order. "Inloggen" appearing inside "Inloggen om aan te passen" is
 * a different button, and preferring the substring hit would press the wrong
 * one on any screen that offers both.
 */
export function findElement(els: PhoneElement[], label: string): PhoneElement | null {
  const want = label.trim().toLowerCase();
  if (!want) return null;
  return (
    els.find(e => e.label.toLowerCase() === want)
    ?? els.find(e => e.tap && e.label.toLowerCase().includes(want))
    ?? els.find(e => e.label.toLowerCase().includes(want))
    ?? null
  );
}

/** Compact rendering for a chat turn — label, where, and whether it takes a tap. */
export function formatElements(els: PhoneElement[], limit = 40): string {
  if (els.length === 0) return '(nothing readable on screen)';
  const shown = els.slice(0, limit);
  const lines = shown.map(e => {
    const kind = e.editable ? 'FIELD' : e.tap ? 'TAP  ' : '     ';
    return `${kind} ${e.label || '(no label)'} @ ${e.x},${e.y}`;
  });
  if (els.length > shown.length) lines.push(`… ${els.length - shown.length} more`);
  return lines.join('\n');
}
