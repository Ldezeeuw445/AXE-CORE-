/**
 * Bronnen voor de KPI's op de Settings-kaarten.
 *
 * Alleen wat de secties zelf al lezen, en alleen LEZEN: geen sleuteltest, geen
 * service-probe (checkAllServices), geen ?fresh=1. Een kaart openen doet de
 * zware metingen nog steeds zelf. Elke bron faalt los: één VPS-route die niet
 * antwoordt zet alleen zijn eigen tegels op "Not connected".
 */
import { useEffect, useMemo, useState } from 'react';
import { useServerAgents } from '@/presentation/components/axe-core/useServerAgents';
import { useVoiceStore } from '@/presentation/store/voiceStore';
import { useAxeJobStore, lopendeJobs } from '@/presentation/store/axeJobStore';
import { abonnementVerbruik, codingSeatsHeartbeat, keysOverview, usageCreditsSnapshot, type KeysPerApp, type CodingSeatStatus } from '@/infrastructure/gateways/axeCoreApiService';
import type { AbonnementVerbruik } from '@/domain/abonnementVerbruik';
import type { UsageCreditsSnapshot } from '@/domain/usageCredits';
import { sleutelKpis } from '@/domain/sleutelOverzicht';
import { readAllProviderUsage } from '@/infrastructure/persistence/providerUsageService';
import { leesProviderOpslag } from '@/domain/providers';
import { PROVIDER_KEY_CATALOGUE } from '@/domain/providerCatalogue';
import { haalServerProviders } from '@/infrastructure/config/serverProviders';
import { getStoredLlmModelRegistry } from '@/infrastructure/persistence/llmModelRegistryService';
import { loadTrustLevels, type TrustLevel } from '@/infrastructure/persistence/trustLevelsService';
import { TOOL_CATALOG } from '@/domain/tools/toolCatalog';
import { routeOverzicht } from '@/domain/tierRouter/routeOverzicht';
import { getSupabase } from '@/infrastructure/supabase/supabaseClient';
import { getSystemState, type ServiceState } from '@/application/system/systemService';
import { loadRepoConfigs } from '@/infrastructure/persistence/repoConfigService';
import { AXE_AGENTS } from '@/domain/agents/roster';
import { settingsKaartKpis, type BronStand, type SettingsKpiBronnen } from '@/domain/settings/settingsKaartKpis';

type Bron<T> = { stand: BronStand; data: T | null };
const LADEN = { stand: 'laden', data: null } as const;
const VERVERS_MS = 60_000;

function useBron<T>(haal: () => Promise<T>, ms = VERVERS_MS): Bron<T> {
  const [b, setB] = useState<Bron<T>>(LADEN);
  useEffect(() => {
    let levend = true;
    const laad = () => {
      haal()
        .then((data) => { if (levend) setB({ stand: 'ok', data }); })
        .catch(() => { if (levend) setB((v) => (v.data ? v : { stand: 'fout', data: null })); });
    };
    laad();
    const t = window.setInterval(laad, ms);
    return () => { levend = false; window.clearInterval(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return b;
}

function leesJson<T>(sleutel: string, terug: T): T {
  try { return (JSON.parse(localStorage.getItem(sleutel) ?? 'null') as T) ?? terug; } catch { return terug; }
}

async function capabilityTelling(): Promise<number> {
  const sb = getSupabase();
  if (!sb) throw new Error('no supabase');
  const { data, error } = await sb.from('core_capabilities').select('*');
  if (error) throw error;
  return (data ?? []).length;
}

async function trustLevels(): Promise<TrustLevel[]> {
  if (!getSupabase()) throw new Error('no supabase');
  return loadTrustLevels();
}

async function systeemStand(): Promise<ServiceState[]> {
  if (!getSupabase()) throw new Error('no supabase');
  return getSystemState();
}

/** Aantal vertrouwenscategorieën in Trust & autonomy (TRUST_CATEGORIES). */
export const TRUST_CATEGORIE_AANTAL = 9;

export function useSettingsKpis(voice: { mic: string; wake: boolean; clap: boolean; herkenning: boolean }) {
  const server = useServerAgents();
  const seats = useBron<{ seats: CodingSeatStatus[] }>(codingSeatsHeartbeat);
  const abo = useBron<{ accounts: AbonnementVerbruik[] }>(() => abonnementVerbruik(false));
  const keys = useBron<{ apps: KeysPerApp[] }>(keysOverview);
  const usage = useBron<UsageCreditsSnapshot>(usageCreditsSnapshot);
  const trust = useBron<TrustLevel[]>(trustLevels);
  const caps = useBron<number>(capabilityTelling);
  const systeem = useBron<ServiceState[]>(systeemStand, 30_000);
  const serverProv = useBron<string[] | null>(haalServerProviders, 5 * 60_000);
  const routingLog = useVoiceStore((s) => s.routingLog);
  const primair = useVoiceStore((s) => s.primarySlot);
  const jobs = useAxeJobStore((s) => s.jobs);
  const [nu, setNu] = useState(() => Date.now());
  // De agentpoll kent geen "mislukt voor de eerste keer"; na 12 s zonder
  // antwoord zeggen we eerlijk dat hij niet verbonden is.
  const [geduldOp, setGeduldOp] = useState(false);
  useEffect(() => { const t = window.setTimeout(() => setGeduldOp(true), 12_000); return () => window.clearTimeout(t); }, []);
  useEffect(() => {
    const t = window.setInterval(() => setNu(Date.now()), 30_000);
    const opnieuw = () => setNu(Date.now());
    window.addEventListener('axe:provider-usage', opnieuw);
    return () => { window.clearInterval(t); window.removeEventListener('axe:provider-usage', opnieuw); };
  }, []);

  return useMemo(() => {
    const verbindingen = leesProviderOpslag() as Record<string, { key?: string; lastTest?: string } | undefined>;
    const catalogusIds = new Set(PROVIDER_KEY_CATALOGUE.map((p) => p.id));
    const lokaal = PROVIDER_KEY_CATALOGUE.filter((p) => !!verbindingen[p.id]?.key).length;
    const getest = Object.entries(verbindingen).filter(([id]) => catalogusIds.has(id)).map(([, v]) => v?.lastTest);
    const ollamaHealth = leesJson<Record<string, { status?: string }>>('axe_ollama_model_health', {});
    const ollama = Object.values(ollamaHealth);
    const verbruik = readAllProviderUsage();
    const or = verbruik.openrouter?.balance?.usage_monthly;
    const repos = loadRepoConfigs();
    const wegen = routeOverzicht(routingLog as never);
    const keysData = keys.data?.apps ?? [];
    const sk = keys.stand === 'ok' ? sleutelKpis(keysData) : null;

    const bronnen: SettingsKpiBronnen = {
      nu,
      agents: {
        // at > 0: er was ooit een echte stand (die blijft staan bij een fout).
        stand: server.ok || server.at ? 'ok' : geduldOp ? 'fout' : 'laden',
        lijst: Object.values(server.agents).map((a) => ({ status: a.status, last_event_at: a.last_event_at })),
        approvals: server.approvals.length,
        rosterTotaal: AXE_AGENTS.length,
      },
      seats: { stand: seats.stand, lijst: seats.data?.seats ?? [] },
      abonnementen: { stand: abo.stand, lijst: abo.data?.accounts ?? [] },
      keys: { stand: keys.stand, apps: keysData, werkt: sk?.werkt ?? 0, stuk: sk?.stuk ?? 0, totaal: sk?.totaal ?? 0 },
      usage: {
        stand: usage.stand,
        seats: (usage.data?.seats ?? []).map((s) => ({ label: s.label, sessions_today: s.sessions_today })),
        appsMet: usage.data?.apps_met ?? 0,
        appsTotaal: usage.data?.apps_total ?? 0,
        maandCredits: typeof or === 'number' ? or : null,
      },
      providers: {
        catalogus: PROVIDER_KEY_CATALOGUE.length,
        lokaal,
        server: serverProv.stand === 'ok' && serverProv.data ? serverProv.data.filter((id) => catalogusIds.has(id)).length : null,
        getestOk: getest.filter((t) => t === 'ok').length,
        getestFout: getest.filter((t) => t === 'fail').length,
        ollamaModellen: getStoredLlmModelRegistry().length,
        ollamaOk: ollama.filter((h) => h.status === 'ok').length,
        ollamaFout: ollama.filter((h) => h.status === 'fail').length,
      },
      voice,
      trust: {
        stand: trust.stand,
        rijen: (trust.data ?? []).length,
        autoAan: (trust.data ?? []).filter((l) => l.auto_approve).length,
        categorieen: TRUST_CATEGORIE_AANTAL,
        autoRuns: (trust.data ?? []).reduce((n, l) => n + (l.auto_run_count ?? 0), 0),
        nativeTools: (() => { try { return localStorage.getItem('axe_native_tools') === '1'; } catch { return false; } })(),
        tools: TOOL_CATALOG.length,
      },
      routing: {
        beurten: wegen.reduce((n, w) => n + w.aantal, 0),
        perTier: [wegen[0]?.aantal ?? 0, wegen[1]?.aantal ?? 0, wegen[2]?.aantal ?? 0],
        standaardModel: primair ? (primair.model || primair.provider) : null,
        capabilities: caps.stand === 'ok' ? caps.data : null,
        lopend: lopendeJobs(jobs).length,
      },
      system: {
        stand: systeem.stand,
        services: (systeem.data ?? []).map((s) => ({ service: s.service, status: s.status })),
        repos: repos.length,
        reposMetToken: repos.filter((r) => !!r.token).length,
      },
    };
    return { kpis: settingsKaartKpis(bronnen), services: systeem.data ?? [], systeemStand: systeem.stand };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [server, seats, abo, keys, usage, trust, caps, systeem, serverProv, routingLog, primair, jobs, voice.mic, voice.wake, voice.clap, voice.herkenning, nu, geduldOp]);
}
