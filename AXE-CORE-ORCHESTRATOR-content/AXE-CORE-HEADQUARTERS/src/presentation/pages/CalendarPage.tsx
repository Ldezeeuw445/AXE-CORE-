import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';

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
          vanaf={weergave === 'week' ? datumSleutel(new Date()) : undefined}
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

      {/* Het dagpaneel is helemaal weg -- en daarmee ook het mobiele
          onderblad en de donkere laag erachter.

          Het stond rechts naast de maandkalender en toonde de gekozen dag:
          precies wat de agenda-lijst in de rechter schuifbalk nu ook doet.
          Twee plekken die hetzelfde tonen kunnen uit de pas lopen, en dit
          kostte bovendien breedte die de kalender beter kan gebruiken. */}
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  EVENT CARD                                                         */
/* ------------------------------------------------------------------ */

