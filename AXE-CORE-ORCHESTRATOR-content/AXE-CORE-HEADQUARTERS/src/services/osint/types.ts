/**
 * Unified types for all OSINT data sources in AXE Global Surveillance Feed
 */

export type OsintKind = 'flight' | 'vessel' | 'disaster' | 'threat' | 'news' | 'intel';
export type OsintSeverity = 'info' | 'warning' | 'critical';
export type OsintSource =
  | 'opensky'
  | 'nasa'
  | 'aviationstack'
  | 'exa'
  | 'zenserp'
  | 'greynoise'
  | 'ipstack'
  | 'axe-mock';

export interface LiveOsintPoint {
  id: string;
  kind: OsintKind;
  lat: number;
  lon: number;
  title: string;
  detail?: string;
  severity: OsintSeverity;
  source: OsintSource;
  timestamp: string;
  stale?: boolean;
  metadata?: Record<string, unknown>;
}

export interface UnifiedOsintResult {
  points: LiveOsintPoint[];
  errors: Partial<Record<string, string>>;
  lastUpdated: string;
}
