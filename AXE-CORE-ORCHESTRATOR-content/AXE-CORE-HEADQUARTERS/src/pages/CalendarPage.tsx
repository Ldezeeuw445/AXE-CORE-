import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  MapPin,
  AlignLeft,
  CalendarDays,
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  TYPES                                                              */
/* ------------------------------------------------------------------ */

interface CalendarEvent {
  id: string;
  title: string;
  date: string;       /* YYYY-MM-DD */
  time: string;       /* HH:MM */
  duration: string;   /* e.g. "1h 30m" */
  type: 'meeting' | 'task' | 'reminder' | 'focus';
  description?: string;
  location?: string;
  color: string;
}

/* ------------------------------------------------------------------ */
/*  MOCK EVENTS                                                        */
/* ------------------------------------------------------------------ */

const EVENTS: CalendarEvent[] = [
  { id: '1', title: 'Daily Standup', date: '2025-01-06', time: '09:00', duration: '15m', type: 'meeting', description: 'Team sync on daily progress', location: 'Zoom', color: '#3B82F6' },
  { id: '2', title: 'Design Review', date: '2025-01-08', time: '14:30', duration: '1h', type: 'meeting', description: 'Review Command Center V1 designs', location: 'Conference Room A', color: '#3B82F6' },
  { id: '3', title: 'Deep Work Block', date: '2025-01-08', time: '10:00', duration: '2h', type: 'focus', description: 'Voice pipeline implementation', color: '#8B5CF6' },
  { id: '4', title: 'Submit Tax Documents', date: '2025-01-10', time: '17:00', duration: '30m', type: 'task', description: 'Q4 tax filing preparation', color: '#10B981' },
  { id: '5', title: 'Client Call — Acme Corp', date: '2025-01-13', time: '11:00', duration: '45m', type: 'meeting', description: 'Quarterly review call', location: 'Google Meet', color: '#3B82F6' },
  { id: '6', title: 'Refactor Auth Module', date: '2025-01-14', time: '09:00', duration: '3h', type: 'task', description: 'Update OAuth flow', color: '#10B981' },
  { id: '7', title: 'Take Supabase Backup', date: '2025-01-15', time: '02:00', duration: '10m', type: 'reminder', description: 'Automated daily backup', color: '#F59E0B' },
  { id: '8', title: 'Team Lunch', date: '2025-01-15', time: '12:30', duration: '1h', type: 'meeting', description: 'Monthly team lunch', location: 'Main Cafeteria', color: '#3B82F6' },
  { id: '9', title: 'Deploy to Production', date: '2025-01-16', time: '16:00', duration: '1h', type: 'task', description: 'Release v2.4.0', color: '#10B981' },
  { id: '10', title: 'Weekly Review', date: '2025-01-17', time: '15:00', duration: '30m', type: 'meeting', description: 'Sprint retrospective', color: '#3B82F6' },
  { id: '11', title: 'Renew SSL Certificates', date: '2025-01-20', time: '10:00', duration: '20m', type: 'reminder', description: 'Cloudflare edge certificates', color: '#F59E0B' },
  { id: '12', title: 'Investor Presentation', date: '2025-01-22', time: '13:00', duration: '1h 30m', type: 'meeting', description: 'Series A pitch deck review', location: 'Board Room', color: '#3B82F6' },
  { id: '13', title: 'Database Migration', date: '2025-01-23', time: '03:00', duration: '2h', type: 'task', description: 'Migrate users table to new schema', color: '#10B981' },
  { id: '14', title: '1:1 with Engineering Lead', date: '2025-01-24', time: '11:00', duration: '30m', type: 'meeting', description: 'Career growth discussion', color: '#3B82F6' },
  { id: '15', title: 'End of Month Reports', date: '2025-01-28', time: '09:00', duration: '4h', type: 'task', description: 'Generate all monthly analytics', color: '#10B981' },
];

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const TYPE_LABELS: Record<string, string> = {
  meeting: 'Meeting',
  task: 'Task',
  reminder: 'Reminder',
  focus: 'Focus',
};

/* ------------------------------------------------------------------ */
/*  UTILITIES                                                          */
/* ------------------------------------------------------------------ */

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number): number {
  /* 0 = Sun, 1 = Mon, ... adjust so Mon = 0 */
  const day = new Date(year, month, 1).getDay();
  return day === 0 ? 6 : day - 1;
}

function formatDateKey(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function isToday(year: number, month: number, day: number): boolean {
  const now = new Date();
  return now.getFullYear() === year && now.getMonth() === month && now.getDate() === day;
}

/* ------------------------------------------------------------------ */
/*  MAIN COMPONENT                                                     */
/* ------------------------------------------------------------------ */

export default function CalendarPage() {
  const now = new Date();
  const [currentYear, setCurrentYear] = useState(now.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(now.getMonth());
  const [selectedDate, setSelectedDate] = useState<string | null>(
    formatDateKey(now.getFullYear(), now.getMonth(), now.getDate())
  );

  const daysInMonth = getDaysInMonth(currentYear, currentMonth);
  const firstDayOffset = getFirstDayOfMonth(currentYear, currentMonth);
  const totalSlots = Math.ceil((daysInMonth + firstDayOffset) / 7) * 7;

  /* Events by date */
  const eventsByDate = useMemo(() => {
    const map: Record<string, CalendarEvent[]> = {};
    EVENTS.forEach((ev) => {
      if (!map[ev.date]) map[ev.date] = [];
      map[ev.date].push(ev);
    });
    return map;
  }, []);

  /* Selected date events */
  const selectedEvents = selectedDate ? (eventsByDate[selectedDate] || []) : [];

  /* Upcoming events (sorted) */
  const upcomingEvents = useMemo(() => {
    return [...EVENTS]
      .filter((e) => e.date >= formatDateKey(currentYear, currentMonth, 1))
      .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time))
      .slice(0, 6);
  }, [currentYear, currentMonth]);

  const goToPrevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear((y) => y - 1);
    } else {
      setCurrentMonth((m) => m - 1);
    }
    setSelectedDate(null);
  };

  const goToNextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear((y) => y + 1);
    } else {
      setCurrentMonth((m) => m + 1);
    }
    setSelectedDate(null);
  };

  /* Build grid cells */
  const cells: { day: number | null; dateKey: string | null; isCurrentMonth: boolean }[] = [];
  for (let i = 0; i < totalSlots; i++) {
    const dayNum = i - firstDayOffset + 1;
    if (dayNum > 0 && dayNum <= daysInMonth) {
      cells.push({ day: dayNum, dateKey: formatDateKey(currentYear, currentMonth, dayNum), isCurrentMonth: true });
    } else {
      cells.push({ day: null, dateKey: null, isCurrentMonth: false });
    }
  }

  return (
    <motion.div
      className="h-full flex overflow-hidden"
      style={{ backgroundColor: 'var(--bg-base)' }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      {/* Main Grid Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-4 flex-shrink-0"
          style={{ borderBottom: '1px solid var(--border-subtle)' }}
        >
          <div className="flex items-center gap-4">
            <button
              onClick={goToPrevMonth}
              className="p-2 rounded-lg transition-colors hover:bg-white/5"
              style={{ border: '1px solid var(--border-subtle)' }}
            >
              <ChevronLeft size={16} color="var(--text-secondary)" />
            </button>
            <h1
              className="text-page-title font-semibold min-w-[200px] text-center"
              style={{ color: 'var(--text-primary)' }}
            >
              {MONTH_NAMES[currentMonth]} {currentYear}
            </h1>
            <button
              onClick={goToNextMonth}
              className="p-2 rounded-lg transition-colors hover:bg-white/5"
              style={{ border: '1px solid var(--border-subtle)' }}
            >
              <ChevronRight size={16} color="var(--text-secondary)" />
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                const n = new Date();
                setCurrentYear(n.getFullYear());
                setCurrentMonth(n.getMonth());
                setSelectedDate(formatDateKey(n.getFullYear(), n.getMonth(), n.getDate()));
              }}
              className="text-xs-custom px-3 py-1.5 rounded-lg transition-colors hover:bg-white/5"
              style={{ color: 'var(--accent-cyan)', border: '1px solid rgba(34,211,238,0.2)' }}
            >
              Today
            </button>
          </div>
        </div>

        {/* Day Labels */}
        <div
          className="grid flex-shrink-0"
          style={{
            gridTemplateColumns: 'repeat(7, 1fr)',
            borderBottom: '1px solid var(--border-subtle)',
          }}
        >
          {DAY_LABELS.map((label, i) => (
            <div
              key={label}
              className="py-2 text-center text-[10px] uppercase tracking-wider font-medium"
              style={{
                color: i >= 5 ? 'var(--text-muted)' : 'var(--text-secondary)',
                borderRight: i < 6 ? '1px solid var(--border-subtle)' : 'none',
              }}
            >
              {label}
            </div>
          ))}
        </div>

        {/* Month Grid */}
        <div
          className="flex-1 grid overflow-hidden"
          style={{
            gridTemplateColumns: 'repeat(7, 1fr)',
            gridTemplateRows: `repeat(${cells.length / 7}, 1fr)`,
          }}
        >
          {cells.map((cell, i) => {
            const cellEvents = cell.dateKey ? (eventsByDate[cell.dateKey] || []) : [];
            const selected = cell.dateKey === selectedDate;
            const today = cell.isCurrentMonth && cell.day !== null && isToday(currentYear, currentMonth, cell.day);

            return (
              <button
                key={i}
                onClick={() => cell.dateKey && setSelectedDate(cell.dateKey)}
                className="relative text-left transition-colors flex flex-col"
                style={{
                  padding: '6px',
                  borderRight: (i % 7) < 6 ? '1px solid rgba(255,255,255,0.03)' : 'none',
                  borderBottom: '1px solid rgba(255,255,255,0.03)',
                  backgroundColor: selected
                    ? 'rgba(34,211,238,0.05)'
                    : cell.isCurrentMonth
                    ? 'transparent'
                    : 'rgba(0,0,0,0.15)',
                  cursor: cell.isCurrentMonth ? 'pointer' : 'default',
                }}
              >
                {cell.day !== null && (
                  <>
                    {/* Day number */}
                    <span
                      className="text-xs font-mono inline-flex items-center justify-center rounded-full"
                      style={{
                        width: '24px',
                        height: '24px',
                        color: today ? '#05070A' : selected ? 'var(--accent-cyan)' : 'var(--text-primary)',
                        backgroundColor: today ? 'var(--accent-cyan)' : selected ? 'rgba(34,211,238,0.1)' : 'transparent',
                        fontWeight: today || selected ? 600 : 400,
                      }}
                    >
                      {cell.day}
                    </span>

                    {/* Event dots/bars */}
                    {cellEvents.length > 0 && (
                      <div className="flex flex-col gap-0.5 mt-1.5 flex-1 min-h-0">
                        {cellEvents.slice(0, 3).map((ev) => (
                          <div
                            key={ev.id}
                            className="flex items-center gap-1.5 px-1 py-0.5 rounded text-[10px] truncate"
                            style={{
                              backgroundColor: `${ev.color}15`,
                              color: ev.color,
                              borderLeft: `2px solid ${ev.color}`,
                            }}
                          >
                            <span className="truncate">{ev.title}</span>
                          </div>
                        ))}
                        {cellEvents.length > 3 && (
                          <span className="text-[9px] px-1" style={{ color: 'var(--text-muted)' }}>
                            +{cellEvents.length - 3} more
                          </span>
                        )}
                      </div>
                    )}
                  </>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Right Sidebar */}
      <div
        className="flex-shrink-0 overflow-y-auto"
        style={{
          width: '300px',
          borderLeft: '1px solid var(--border-subtle)',
          backgroundColor: 'var(--bg-surface)',
        }}
      >
        {/* Selected Day Events */}
        <AnimatePresence mode="wait">
          {selectedDate ? (
            <motion.div
              key={selectedDate}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="p-4"
            >
              <div className="flex items-center gap-2 mb-4">
                <CalendarDays size={14} color="var(--accent-cyan)" />
                <h2 className="text-body font-semibold" style={{ color: 'var(--text-primary)' }}>
                  {selectedDate}
                </h2>
                <span className="text-xs-custom ml-auto" style={{ color: 'var(--text-muted)' }}>
                  {selectedEvents.length} events
                </span>
              </div>

              {selectedEvents.length === 0 ? (
                <div className="py-8 text-center">
                  <p className="text-xs-custom" style={{ color: 'var(--text-muted)' }}>
                    No events scheduled
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {selectedEvents.map((ev) => (
                    <EventCard key={ev.id} event={ev} />
                  ))}
                </div>
              )}

              {/* Divider then upcoming */}
              <div
                className="my-4"
                style={{ borderTop: '1px solid var(--border-subtle)' }}
              />
              <h3
                className="text-[10px] uppercase tracking-wider font-medium mb-3"
                style={{ color: 'var(--text-muted)' }}
              >
                Upcoming
              </h3>
              <div className="space-y-2">
                {upcomingEvents
                  .filter((e) => e.date !== selectedDate)
                  .slice(0, 4)
                  .map((ev) => (
                    <EventCard key={ev.id} event={ev} compact />
                  ))}
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="no-selection"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="p-4"
            >
              <h3
                className="text-[10px] uppercase tracking-wider font-medium mb-3"
                style={{ color: 'var(--text-muted)' }}
              >
                Upcoming Events
              </h3>
              <div className="space-y-2">
                {upcomingEvents.map((ev) => (
                  <EventCard key={ev.id} event={ev} compact />
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  EVENT CARD                                                         */
/* ------------------------------------------------------------------ */

function EventCard({ event, compact }: { event: CalendarEvent; compact?: boolean }) {
  if (compact) {
    return (
      <div
        className="p-2.5 rounded-lg flex items-start gap-2.5"
        style={{
          backgroundColor: 'rgba(255,255,255,0.02)',
          borderLeft: `2px solid ${event.color}`,
        }}
      >
        <div className="flex-1 min-w-0">
          <p className="text-xs truncate font-medium" style={{ color: 'var(--text-primary)' }}>
            {event.title}
          </p>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>{event.time}</span>
            <span className="text-[10px]" style={{ color: event.color }}>{TYPE_LABELS[event.type]}</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      className="p-3 rounded-xl"
      style={{
        backgroundColor: `${event.color}08`,
        border: `1px solid ${event.color}20`,
      }}
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.15 }}
    >
      <div className="flex items-center gap-2 mb-1.5">
        <span
          className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded font-medium"
          style={{ backgroundColor: `${event.color}20`, color: event.color }}
        >
          {TYPE_LABELS[event.type]}
        </span>
        <span className="text-[10px] font-mono ml-auto" style={{ color: 'var(--text-muted)' }}>
          {event.duration}
        </span>
      </div>
      <p className="text-xs font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
        {event.title}
      </p>
      <div className="flex items-center gap-1.5 mb-1">
        <Clock size={10} color="var(--text-muted)" />
        <span className="text-[10px] font-mono" style={{ color: 'var(--text-secondary)' }}>{event.time}</span>
      </div>
      {event.location && (
        <div className="flex items-center gap-1.5 mb-1">
          <MapPin size={10} color="var(--text-muted)" />
          <span className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>{event.location}</span>
        </div>
      )}
      {event.description && (
        <div className="flex items-start gap-1.5">
          <AlignLeft size={10} color="var(--text-muted)" className="mt-0.5 flex-shrink-0" />
          <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{event.description}</span>
        </div>
      )}
    </motion.div>
  );
}
