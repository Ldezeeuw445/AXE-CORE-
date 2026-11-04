import type { StrategyModule } from './types';
import { goldOrb1amNyModule } from './goldOrb1amNy';

/** Registered pluggable strategies Scout may run (demo TEST). */
export const TRADING_TEAM_STRATEGIES: StrategyModule[] = [goldOrb1amNyModule];
