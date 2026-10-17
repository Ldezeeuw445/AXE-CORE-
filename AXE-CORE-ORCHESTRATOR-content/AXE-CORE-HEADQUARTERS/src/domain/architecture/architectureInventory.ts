/** Bekende onderdelen die in de statische graaf MOETEN staan. Ontbreekt er één, dan is de generator incompleet. */

export const KNOWN_ARCHITECTURE_APPS = [
  'axe_core',
  'axe_companion',
  'trading_os',
  'axon_memory',
  'northsea',
  'axe_code',
  'android_device_manager',
] as const;

export const KNOWN_ARCHITECTURE_SERVICES = [
  'axe-core-api',
  'axe-task-worker',
  'axe-browser-agent',
  'axe-companion',
  'axe-terminal',
  'axe-tunnel-relay',
  'camofox',
  'ollama',
  'northsea-mcp',
] as const;

export const KNOWN_ARCHITECTURE_TABLES = [
  'registered_apps',
  'core_agents',
  'core_computer_workers',
  'core_tasks',
  'core_schedules',
  'core_mcp_servers',
  'core_dax_computers',
] as const;

export const KNOWN_ARCHITECTURE_PROJECTS = [
  'pqnngpcgbdwxavbatbia',
  'kbimnuepbecbyezedvih',
  'ktaditgtbubonrahyiig',
] as const;

export const KNOWN_ARCHITECTURE_WORKERS = [
  'com.axe.computer-worker',
  'com.axe.autosync',
  'com.axe.browser-agent',
] as const;
