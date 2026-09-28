import { useState, useMemo, useEffect } from 'react';
import { motion } from 'framer-motion';

import { PlaatSlot } from '@/presentation/components/layout/PlaatSlots';
import { IcoonZuil, type ZuilItem } from '@/presentation/components/layout/IcoonZuil';
import { WeekRooster } from './agenda/WeekRooster';
import { MiniMaand } from './agenda/MiniMaand';
import { MaandRooster } from './agenda/MaandRooster';
import { AgendaLijst } from './agenda/AgendaLijst';
import { TabRail } from '@/presentation/components/layout/useTabRail';
import { TabRuimte, SchuifBalk } from '@/presentation/components/layout/tabMaatstaf';
import { datumSleutel, minutenVan, type RoosterItem } from '@/domain/weekRooster';
import { CalendarRange, LayoutGrid } from 'lucide-react';
import { APPS } from '@/domain/apps';
import { werkAgenda, type AgendaTaak, type AgendaCron } from '@/domain/werkAgenda';
import { calendarJobs, listDurableTasks, northseaTab, plannerTaken, type CalendarJobItem } from '@/infrastructure/gateways/axeCoreApiService';
import { agendaVanJobs, filterAgenda, type AppFilter } from '@/domain/grootboek';
import { AppZuil, appGroep } from '@/presentation/components/layout/AppZuil';
import { northseaAgenda } from '@/domain/northsea/werk';
import type { NorthseaAgendaItem } from '@/domain/northsea/tabs/typen';

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

/** De legenda: de kleur van elke app, dezelfde als in Taken en Cron. */
const SOORTEN: ReadonlyArray<{ label: string; kleur: string }> = APPS.map(a => ({ label: a.label, kleur: a.kleur }));

/**
 * Taken, planner en cronjobs ophalen. Elk apart: valt er één weg (de VPS, of
 * de agent-host), dan staat de rest er gewoon.
 */
async function laadWerk(): Promise<{ taken: AgendaTaak[]; crons: AgendaCron[] }> {
  /* De cronjobs komen niet meer hier vandaan maar uit /calendar/jobs: dat rekent
     elke run vooruit, ook van pg_cron, in plaats van alleen de volgende. */
  const [taken, planner] = await Promise.allSettled([
    listDurableTasks({ limit: 200 }), plannerTaken(100),
  ]);
  const uit: AgendaTaak[] = [];
  if (planner.status === 'fulfilled') {
    for (const t of planner.value.taken) uit.push({ ...t, metadata: t.metadata as Record<string, unknown> | null, planner: true });
  }
  if (taken.status === 'fulfilled') {
    for (const t of taken.value.tasks) uit.push({ ...t, completed_at: null, planner: t.capability === 'planner' });
  }
  return { taken: uit, crons: [] };
}

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
  const [weergave, setWeergave] = useState<Weergave>('week');
  /* De week die je bekijkt. Apart van de maand: bladeren door weken hoort de
     maandweergave niet te verzetten en andersom. */
  const [weekAnker, setWeekAnker] = useState<Date>(() => new Date());
  /* Welke app je ziet. Eén agenda per app, en Alle voor het geheel; elke job in
     de kleur van zijn app, dezelfde als in Taken, Cron en het grootboek. */
  const [app, setApp] = useState<AppFilter>('alle');
  const [jobItems, setJobItems] = useState<CalendarJobItem[]>([]);

  /* Het werk van de agents: taken met een deadline, wat de planner deed en
     wanneer de cronjobs draaien. Elke minuut opnieuw, zodat een afgeronde
     planner-taak vanzelf verschuift. */
  const [werk, setWerk] = useState<{ taken: AgendaTaak[]; crons: AgendaCron[] }>({ taken: [], crons: [] });
  /* De geplande acties van de NorthSea-desk: volgende acties op deals en
     sourcing-campagnes. Zelfde kleur als de rest van die app; het soort staat
     in de tekst. */
  const [deskAgenda, setDeskAgenda] = useState<NorthseaAgendaItem[]>([]);
  useEffect(() => {
    let weg = false;
    const haal = () => {
      void northseaTab('werk')
        .then(w => { if (!weg) setDeskAgenda(w.agenda); })
        .catch(() => { if (!weg) setDeskAgenda([]); });
    };
    haal();
    const t = setInterval(haal, 60_000);
    return () => { weg = true; clearInterval(t); };
  }, []);
  /* De geplande runs van alle jobs (VPS, Mac, Supabase-cron) voor het venster dat
     je bekijkt: de maand, of de week, met een week marge. */
  const vensterSleutel = weergave === 'week' ? datumSleutel(weekAnker) : `${currentYear}-${currentMonth}`;
  useEffect(() => {
    let weg = false;
    const basis = weergave === 'week' ? new Date(weekAnker) : new Date(currentYear, currentMonth, 1);
    const van = new Date(basis.getTime() - 7 * 86400_000);
    const tot = new Date(basis.getTime() + (weergave === 'week' ? 14 : 38) * 86400_000);
    const haal = () => {
      void calendarJobs(van, tot)
        .then(r => { if (!weg) setJobItems(r.items); })
        .catch(() => { if (!weg) setJobItems([]); });
    };
    haal();
    const t = setInterval(haal, 5 * 60_000);
    return () => { weg = true; clearInterval(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vensterSleutel, weergave]);
  useEffect(() => {
    let weg = false;
    const haal = () => { void laadWerk().then(w => { if (!weg) setWerk(w); }); };
    haal();
    const t = setInterval(haal, 60_000);
    return () => { weg = true; clearInterval(t); };
  }, []);

  const roosterItems: RoosterItem[] = useMemo(
    () => [
      ...EVENTS
        .filter(e => minutenVan(e.time) !== null)
        .map(e => ({
          id: e.id, titel: e.title, datum: e.date, tijd: e.time,
          duurMin: duurInMinuten(e.duration), kleur: e.color, soort: e.type,
        })),
      ...filterAgenda([
        ...werkAgenda(werk.taken, werk.crons),
        ...northseaAgenda(deskAgenda),
        ...agendaVanJobs(jobItems),
      ], app),
    ],
    [werk, deskAgenda, jobItems, app],
  );









  return (
    <motion.div
      className="flex min-h-0 flex-1 overflow-hidden relative"
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
              : 'Niets gepland: geen taken met een deadline, planner-werk of cronjobs deze week.'
          }
        />
      </TabRail>

      {/* Maand of week, links in de band naast de composer -- net als de
          sub-tabs van de trading-desk, en met dezelfde component. Het is
          dezelfde handeling: kiezen wat je in het midden ziet. */}
      <TabRail kant="links">
        <SchuifBalk
          groepen={[
            {
              titel: 'View',
              items: [
                { id: 'maand', label: 'Month', actief: weergave === 'maand', onKies: () => setWeergave('maand') },
                { id: 'week', label: 'Week', actief: weergave === 'week', onKies: () => setWeergave('week') },
              ],
            },
            appGroep(app, setApp),
          ]}
        />
      </TabRail>

      <PlaatSlot slot="rechts">
        <AppZuil actief={app} kies={setApp} />
      </PlaatSlot>

      <PlaatSlot slot="links">
        <IcoonZuil
          items={WEERGAVEN}
          actief={weergave}
          kies={id => setWeergave(id as Weergave)}
          rijen={2}
        />
      </PlaatSlot>

      {/* Main Grid Area */}
      <TabRuimte vullen>
      {/* Links de mini-maand + vandaag, rechts het rooster (Luka's voorbeeld). */}
      <div className="axe-kalender">
      <MiniMaand
        anker={weekAnker}
        items={roosterItems}
        opKies={d => { setWeekAnker(d); setSelectedDate(datumSleutel(d)); setWeergave('week'); }}
      />
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
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
      </div>
      </TabRuimte>

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

