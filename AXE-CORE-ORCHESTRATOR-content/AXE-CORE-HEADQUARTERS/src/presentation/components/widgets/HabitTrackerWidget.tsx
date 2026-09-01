/**
 * HabitTrackerWidget — round progress-ring cards for daily habits/goals
 * (Daily Journal, Focus, Ice Bath, Trade, Developing, Steps, Water,
 * Workout, Daylight, Sleep, or anything Luka adds). Manual + chat-logged.
 */
import { useCallback, useEffect, useState } from 'react';
import { LIST_GRID } from '@/presentation/components/surface/Page';
import {
  Plus, Minus, RefreshCw, Trash2, Circle,
  BookText, BrainCircuit, Snowflake, BarChart3, Code2,
  Footprints, Droplets, Dumbbell, Sun, BedDouble,
  type LucideIcon,
} from 'lucide-react';
import {
  getHabitSnapshot,
  setHabitProgress,
  addHabitProgress,
  upsertHabitDef,
  removeHabit,
  type HabitItem,
  type HabitSnapshot,
  type HabitUnit,
} from '@/infrastructure/persistence/habitTrackerService';

function unitLabel(unit: HabitUnit): string {
  switch (unit) {
    case 'hr': return 'hr';
    case 'min': return 'min';
    case 'liters': return 'L';
    case 'steps': return 'steps';
    default: return '';
  }
}

function formatValue(n: number): string {
  return n >= 1000 ? n.toLocaleString('nl-NL') : n % 1 === 0 ? `${n}` : n.toFixed(1);
}

function CircularProgress({ value, goal, color, size = 52 }: { value: number; goal: number; color: string; size?: number }) {
  const stroke = 4;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, goal > 0 ? value / goal : 0));
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - pct)}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: 'stroke-dashoffset 0.3s ease' }}
      />
    </svg>
  );
}

const ICON_MAP: Record<string, LucideIcon> = {
  BookText, BrainCircuit, Snowflake, BarChart3, Code2,
  Footprints, Droplets, Dumbbell, Sun, BedDouble, Circle,
};

function HabitIcon({ name, size = 14, color }: { name: string; size?: number; color: string }) {
  const Icon = ICON_MAP[name] || Circle;
  return <Icon size={size} style={{ color }} />;
}

export function HabitTrackerWidget() {
  const [snap, setSnap] = useState<HabitSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [managing, setManaging] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newGoal, setNewGoal] = useState('1');
  const [newUnit, setNewUnit] = useState<HabitUnit>('count');

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setSnap(await getHabitSnapshot());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
    const t = window.setInterval(() => void reload(), 30_000);
    const onUpdate = () => void reload();
    window.addEventListener('axe-habits-updated', onUpdate);
    return () => {
      window.clearInterval(t);
      window.removeEventListener('axe-habits-updated', onUpdate);
    };
  }, [reload]);

  const bump = async (item: HabitItem, delta: number) => {
    const step = item.unit === 'steps' ? 500 : item.unit === 'liters' ? 0.25 : item.unit === 'hr' ? 0.25 : delta;
    const next = await addHabitProgress(item.id, item.unit === 'count' ? delta : step * Math.sign(delta));
    setSnap(next);
    window.dispatchEvent(new Event('axe-habits-updated'));
  };

  const complete = async (item: HabitItem) => {
    const next = await setHabitProgress(item.id, item.goal);
    setSnap(next);
    window.dispatchEvent(new Event('axe-habits-updated'));
  };

  const addCustom = async () => {
    if (!newLabel.trim()) return;
    const id = newLabel.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 40);
    const next = await upsertHabitDef({
      id,
      label: newLabel.trim(),
      icon: 'Circle',
      color: 'var(--accent-cyan)',
      goal: parseFloat(newGoal) || 1,
      unit: newUnit,
    });
    setSnap(next);
    setNewLabel('');
    setNewGoal('1');
    window.dispatchEvent(new Event('axe-habits-updated'));
  };

  const remove = async (id: string) => {
    const next = await removeHabit(id);
    setSnap(next);
    window.dispatchEvent(new Event('axe-habits-updated'));
  };

  const items = snap?.items ?? [];

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[9px]" style={{ color: 'var(--text-muted)' }}>
          {items.filter(i => i.current >= i.goal).length}/{items.length} vandaag gehaald
        </span>
        <div className="flex items-center gap-1">
          <button onClick={() => void reload()} className="p-0.5" title="Refresh" style={{ color: 'var(--text-muted)' }}>
            <RefreshCw size={11} className={loading ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={() => setManaging(m => !m)}
            className="text-[9px] px-1.5 py-0.5 rounded font-medium"
            style={{ background: 'var(--tint-line)', color: 'var(--accent-cyan)', border: '1px solid var(--tint-line)' }}
          >
            {managing ? '×' : 'Beheer'}
          </button>
        </div>
      </div>

      <div className={LIST_GRID}>
        {items.map(item => (
          <div
            key={item.id}
            className="flex flex-col items-center gap-1 px-2 py-2.5 rounded-lg text-center"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
          >
            <button
              onClick={() => void bump(item, 1)}
              title="Tik om +1 te loggen"
              className="relative shrink-0"
              style={{ width: 56, height: 56 }}
            >
              <CircularProgress value={item.current} goal={item.goal} color={item.color} size={56} />
              <div className="absolute inset-0 flex items-center justify-center">
                <HabitIcon name={item.icon} size={20} color={item.color} />
              </div>
            </button>
            <div className="text-[10px] leading-tight truncate w-full" style={{ color: 'var(--text-secondary)' }}>{item.label}</div>
            <div className="text-[11px] font-mono font-semibold" style={{ color: 'var(--text-primary)' }}>
              {formatValue(item.current)}<span style={{ color: 'var(--text-muted)' }}>/{formatValue(item.goal)} {unitLabel(item.unit)}</span>
            </div>
            {managing && (
              <div className="flex items-center gap-1 mt-0.5">
                <button onClick={() => void bump(item, -1)} className="p-0.5 rounded" style={{ background: 'rgba(255,255,255,0.06)' }}>
                  <Minus size={9} style={{ color: 'var(--text-muted)' }} />
                </button>
                <button onClick={() => void bump(item, 1)} className="p-0.5 rounded" style={{ background: 'rgba(255,255,255,0.06)' }}>
                  <Plus size={9} style={{ color: 'var(--text-muted)' }} />
                </button>
                <button onClick={() => void complete(item)} className="text-[8px] px-1 rounded" style={{ background: 'rgba(34,197,94,0.15)', color: '#22C55E' }}>
                  ✓
                </button>
                <button onClick={() => void remove(item.id)} className="p-0.5 rounded" style={{ color: 'var(--text-muted)' }}>
                  <Trash2 size={9} />
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {managing && (
        <div className="space-y-1.5 p-2 rounded-lg" style={{ background: 'var(--bg-base)', border: '1px solid var(--border-subtle)' }}>
          <p className="text-[8px]" style={{ color: 'var(--text-muted)' }}>Nieuwe habit toevoegen, of chat: "log journal 1" / "log 8500 stappen".</p>
          <div className="grid gap-1 [grid-template-columns:repeat(auto-fill,minmax(280px,1fr))]">
            <input
              value={newLabel}
              onChange={e => setNewLabel(e.target.value)}
              placeholder="Naam"
              className="col-span-2 px-1.5 py-1 rounded text-[10px] font-mono outline-none"
              style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }}
            />
            <input
              value={newGoal}
              onChange={e => setNewGoal(e.target.value)}
              placeholder="Doel"
              className="px-1.5 py-1 rounded text-[10px] font-mono outline-none"
              style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }}
            />
          </div>
          <div className="flex items-center gap-1">
            <select
              value={newUnit}
              onChange={e => setNewUnit(e.target.value as HabitUnit)}
              className="flex-1 px-1.5 py-1 rounded text-[9px] outline-none"
              style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }}
            >
              <option value="count">count</option>
              <option value="min">min</option>
              <option value="hr">hr</option>
              <option value="liters">liters</option>
              <option value="steps">steps</option>
            </select>
            <button
              onClick={() => void addCustom()}
              className="text-[9px] px-2 py-1 rounded font-medium"
              style={{ background: 'var(--tint-hi)', color: 'var(--accent-cyan)' }}
            >
              + Toevoegen
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
