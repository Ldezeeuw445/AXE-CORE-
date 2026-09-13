import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Clock,
  MapPin,
  AlignLeft,
  CalendarDays,
  X,
} from 'lucide-react';
import { useIsMobile } from '@/presentation/hooks/use-mobile';
import { PlaatSlot } from '@/presentation/components/layout/PlaatSlots';
import { IcoonZuil, type ZuilItem } from '@/presentation/components/layout/IcoonZuil';
import { WeekRooster } from './agenda/WeekRooster';
import { MaandRooster } from './agenda/MaandRooster';
import { AgendaLijst } from './agenda/AgendaLijst';
import { TabRail } from '@/presentation/components/layout/useTabRail';
import { datumSleutel, minutenVan, type RoosterItem } from '@/domain/weekRooster';
import { CalendarRange, LayoutGrid } from 'lucide-react';

/**
 * Maand of week. Als twee iconen in de band naast de composer, net als de
 * sub-tabs van de trading-desk -- dezelfde component (IcoonZuil), want het is
 * dezelfde handeling: kiezen wat je in het midden ziet.
 */
type Weergave = 'maand' | 'week';
const WEERGAVEN: ZuilItem[] = [
  { id: 'maand', label: 'Maand', kleur: '#22D3EE', icoon: <LayoutGrid size={17} /> },
  { id: 'week', label: 'Week', kleur: '#8B7CF6', icoon: <CalendarRange size={17} /> },
];

/** De legenda onder het weekrooster: welk soort welke kleur heeft. */
const SOORTEN: ReadonlyArray<{ label: string; kleur: string }> = [
  { label: 'Afspraak', kleur: '#3B82F6' },
  { label: 'Focus', kleur: '#8B5CF6' },
  { label: 'Taak', kleur: '#34D399' },
  { label: 'Herinnering', kleur: '#F5A524' },
];

/**
 * Een agenda-item omzetten naar iets waar het weekrooster mee kan rekenen.
 *
 * De duur staat als tekst in het event ("1h 30m", "45m") en daar kun je niet
 * mee rekenen. Kan hij niet gelezen worden, dan een uur: een blokje van nul
 * hoog is onzichtbaar, en dan lijkt de afspraak er niet te zijn.
 */
function duurInMinuten(tekst: string): number {
  const u = /(\d+)\s*h/i.exec(tekst);
  const m = /(\d+)\s*m/i.exec(tekst);
  const totaal = (u ? Number(u[1]) * 60 : 0) + (m ? Number(m[1]) : 0);
  return totaal > 0 ? totaal : 60;
}

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
/*  DE AGENDA-ITEMS                                                    */
/* ------------------------------------------------------------------ */

/**
 * LEEG, en met opzet.
 *
 * Hier stond een lijst verzonnen afspraken uit januari 2025 -- Daily Standup,
 * Design Review, Submit Tax Documents. Die zag er echt uit, en dat is het
 * probleem: een scherm dat data toont die nergens vandaan komt liegt over wat
 * de app weet. Je gaat erop plannen.
 *
 * Er is geen agendakoppeling in deze app. Zolang die er niet is hoort dit leeg
 * te zijn en horen de weergaven te zeggen dat er niets is. Komt er een bron
 * (Google Calendar, Supabase, wat dan ook), dan vult die deze lijst en werkt
 * alles eromheen al.
 */
const EVENTS: CalendarEvent[] = [];



const TYPE_LABELS: Record<string, string> = {
  meeting: 'Meeting',
  task: 'Task',
  reminder: 'Reminder',
  focus: 'Focus',
};

/* ------------------------------------------------------------------ */
/*  UTILITIES                                                          */
/* ------------------------------------------------------------------ */



function formatDateKey(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
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
  const isMobile = useIsMobile();
  // On mobile the day-detail panel is a bottom sheet that opens when a day is
  // tapped (the desktop right sidebar is hidden there). Without this there was
  // no way to see or add a day's events on a phone.
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false);
  const [weergave, setWeergave] = useState<Weergave>('maand');
  /* De week die je bekijkt. Apart van de maand: bladeren door weken hoort de
     maandweergave niet te verzetten en andersom. */
  const [weekAnker, setWeekAnker] = useState<Date>(() => new Date());

  const roosterItems: RoosterItem[] = useMemo(
    () => EVENTS
      .filter(e => minutenVan(e.time) !== null)
      .map(e => ({
        id: e.id, titel: e.title, datum: e.date, tijd: e.time,
        duurMin: duurInMinuten(e.duration), kleur: e.color, soort: e.type,
      })),
    [],
  );


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

  /* Welke dag het paneel toont, in woorden. */
  const vandaagSleutel = datumSleutel(new Date());
  const isVandaag = selectedDate === vandaagSleutel;
  const dagKop = selectedDate
    ? new Date(`${selectedDate}T12:00:00`).toLocaleDateString('nl-NL', {
        weekday: 'long', day: 'numeric', month: 'long',
      })
    : 'Geen dag gekozen';

  /* Upcoming events (sorted) */
  const upcomingEvents = useMemo(() => {
    return [...EVENTS]
      .filter((e) => e.date >= formatDateKey(currentYear, currentMonth, 1))
      .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time))
      .slice(0, 6);
  }, [currentYear, currentMonth]);




  return (
    <motion.div
      className="axe-tabruimte flex min-h-0 flex-1 overflow-hidden relative"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      {/* De rechter schuifbalk: wat komt eraan.
          In de week alles vanaf vandaag, in de maand alleen de dag die je hebt
          aangeklikt -- daar gaat het om die ene dag, want de kalender ernaast
          laat de rest al zien. */}
      <TabRail kant="rechts">
        <AgendaLijst
          items={roosterItems}
          titel="Agenda"
          vanaf={weergave === 'week' ? vandaagSleutel : undefined}
          tot={weergave === 'maand' ? (selectedDate ?? undefined) : undefined}
          opKies={item => { setSelectedDate(item.datum); }}
          leegTekst={
            weergave === 'maand'
              ? 'Niets op deze dag.'
              : 'Niets gepland. Er is nog geen agendakoppeling — zie de opmerking bij EVENTS.'
          }
        />
      </TabRail>

      {/* Maand of week, links in de band naast de composer -- net als de
          sub-tabs van de trading-desk, en met dezelfde component. Het is
          dezelfde handeling: kiezen wat je in het midden ziet. */}
      <PlaatSlot slot="links">
        <IcoonZuil
          items={WEERGAVEN}
          actief={weergave}
          kies={id => setWeergave(id as Weergave)}
          rijen={2}
        />
      </PlaatSlot>

      {/* Main Grid Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {weergave === 'week' ? (
          <WeekRooster
            anker={weekAnker}
            items={roosterItems}
            opAnker={setWeekAnker}
            soorten={SOORTEN}
            opKies={item => {
              /* Klik je een blok aan, dan spring je terug naar de maand met die
                 dag geselecteerd -- daar staat de volle omschrijving. */
              setSelectedDate(item.datum);
              setWeergave('maand');
            }}
          />
        ) : (
          <MaandRooster
            jaar={currentYear}
            maand={currentMonth}
            items={roosterItems}
            gekozen={selectedDate}
            opKies={setSelectedDate}
            opMaand={(j, m) => { setCurrentYear(j); setCurrentMonth(m); }}
          />
        )}
      </div>

      {/* Mobile: dim backdrop behind the bottom sheet so a tap outside closes it */}
      {isMobile && mobileSheetOpen && (
        <div
          className="absolute inset-0 z-20"
          style={{ background: 'rgba(0,0,0,0.4)' }}
          onClick={() => setMobileSheetOpen(false)}
        />
      )}

      {/* Alleen in de maandweergave. In de week is elke dag al een kolom, dus
          een paneel dat één dag herhaalt kost alleen breedte -- en breedte is
          precies wat zeven kolommen nodig hebben. Wat je in de week wilt (de
          agenda-lijst) staat in de rechter schuifbalk. */}
      {weergave === 'maand' && (
      <div
        className={
          isMobile
            ? `absolute left-0 right-0 bottom-0 z-30 flex flex-col overflow-y-auto rounded-t-2xl transition-transform duration-200 ${mobileSheetOpen ? 'translate-y-0' : 'translate-y-full'}`
            : 'hidden md:flex flex-shrink-0 overflow-y-auto'
        }
        style={
          isMobile
            ? { maxHeight: '55%', borderTop: '1px solid var(--border-subtle)', backgroundColor: 'var(--bg-surface)', boxShadow: '0 -10px 30px rgba(0,0,0,0.55)' }
            : { width: '300px', borderLeft: '1px solid var(--border-subtle)', backgroundColor: 'var(--bg-surface)' }
        }
      >
        {isMobile && (
          <div className="sticky top-0 flex items-center justify-between px-4 pt-2 pb-1 z-10" style={{ background: 'var(--bg-surface)' }}>
            <div className="mx-auto w-9 h-1 rounded-full" style={{ background: 'rgba(255,255,255,0.2)' }} />
            <button onClick={() => setMobileSheetOpen(false)} className="absolute right-3 top-2 p-1 rounded-lg" style={{ color: 'var(--text-muted)' }} aria-label="Close">
              <X size={16} />
            </button>
          </div>
        )}
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
              {/* "Vandaag" en niet een datumcode.
                *
                * Hier stond de sleutel zoals hij in de data staat: 2026-03-17.
                * Dat is een sorteervorm, geen kop -- je leest hem als een
                * getal en niet als "de dag waar ik naar kijk". En verreweg de
                * meeste keren dat je hier kijkt is het vandaag, en dan hoort
                * dat er te staan.
                *
                * De datum blijft eronder, want bij een andere dag moet je wel
                * WELKE zien. */}
              <div className="flex items-center gap-2 mb-4">
                <CalendarDays size={14} color="var(--accent-cyan)" />
                <div className="min-w-0">
                  <h2 className="text-body font-semibold" style={{ color: 'var(--text-primary)' }}>
                    {isVandaag ? 'Vandaag' : dagKop}
                  </h2>
                  <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{dagKop}</div>
                </div>
                <span className="text-xs-custom ml-auto shrink-0" style={{ color: 'var(--text-muted)' }}>
                  {selectedEvents.length === 0
                    ? 'niets'
                    : `${selectedEvents.length} ${selectedEvents.length === 1 ? 'afspraak' : 'afspraken'}`}
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
                Hierna
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
      )}
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
        backgroundColor: 'var(--surface-bg)',
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
