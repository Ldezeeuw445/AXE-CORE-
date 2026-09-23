/**
 * De adaptieve AXE-chatwolk naast de composer.
 *
 * ## Waarnaar dit verwijst
 *
 * Luka's eigen geannoteerde screenshot: een paneel RECHTS van de composer, op
 * dezelfde rij en hoogte, plus een radiaal-achtige iconenrij eronder --
 * "adaptive on each tab." Dit is exact de "onderband right slot, naast de
 * composer" die `AxePresenceDock.tsx`'s `vindOnderbandSlotRechts()` al
 * beschrijft als "de letterlijke 'deze tab heeft zij-inhoud naast de
 * composer'-situatie die Luka noemde" -- dus hier hergebruikt via dezelfde
 * `<PlaatSlot slot="rechts">` als `CalendarPage`, `Grootboek`,
 * `CodeEditorPage` en `NorthseaDesk` al doen, niet een vijfde
 * positioneringssysteem.
 *
 * ## Waarom dit NIET op elke pagina rendert
 *
 * Die vier pagina's vullen die sleuf al met hun EIGEN inhoud (een dealenlijst,
 * een grootboek, een motor-/weergavezuil). `PlaatSlot` portalt gewoon in
 * dezelfde gastheer-DIV -- twee `PlaatSlot`-gebruikers tegelijk actief op
 * dezelfde pagina zouden hun inhoud allebei in die ene div zetten, door
 * elkaar heen. Dus: dit component levert alleen content op de tabs die de
 * sleuf nog NIET zelf gebruiken (`GEDEKTE_PADEN` hieronder) -- overal elders
 * is de sleuf leeg en hoort hij wat te tonen; op die vier blijft hij weg.
 *
 * ## Waarom een tabel en geen if/else-ketting
 *
 * Zelfde motivatie als `HORIZONTALE_OBSTAKELS` in AxePresenceDock.tsx: de
 * volgende tab die iets specifieks wil, is één regel in `ROUTE_CLOUDS`, geen
 * nieuwe tak in een groeiende if/else. Onbekende routes (of routes die al
 * hun eigen sleuf-inhoud hebben) vallen terug op `null` / de generieke kaart.
 * Elke regel is aan de tab GEBONDEN werk, geen navigatie naar de tab zelf --
 * `/tasks` bood eerst een link genaamd "Taken" naar `/tasks`, de pagina waar
 * je al op staat; dat is nu een echte actie (nieuwe taak via het
 * commandopalet), geen rondje naar jezelf.
 *
 * ## Waarom dit GEEN `.axe-paneel`/`.axe-paneel-body` is
 *
 * Die klassen zijn voor de tab-content-panelen (`PlaatPanel`), en
 * axe-look.css verbergt `.axe-paneel-body` volledig zodra
 * `document.documentElement.dataset.chat === 'dicht'` (zie `PlaatChat.tsx`).
 * Dat dekt zich op elke andere pagina dan Home per direct -- gemeten: de kop
 * bleef staan, maar de knoppenrij mat 0×0. Deze wolk is geen inhoudspaneel
 * dat wil verdwijnen als het gesprek dicht is; hij is een permanent
 * zichtbare snelkoppelingsstrook naast de composer, dus eigen klassen, geen
 * geleende die voor iets anders bedoeld waren.
 *
 * ## Waarom dit BOVENAAN de sleuf hangt, niet onderaan
 *
 * `.axe-slot--rechts` lijnt zijn inhoud onderaan uit (`align-items: flex-end`
 * in axe-look.css) -- logisch voor iets dat naast de composer moet eindigen.
 * Maar de rechter `RadiaalDok` is een VASTE 268×268 hoek rechtsonder
 * (RadiaalDok.tsx, ongeacht open/dicht -- alleen de tabs erin bewegen), en
 * die hoek overlapt precies het onderste stuk van deze sleuf. Onderaan
 * uitgelijnd zou deze wolk dus middenin die hoek belanden, met de dok-knop
 * op de knoppenrij. `alignSelf: 'flex-start'` hieronder zet hem in plaats
 * daarvan boven in de sleuf, tegen de chatplaat aan -- ruim boven waar de dok
 * ooit reikt, in elke stand (zie ook RadiaalDok.tsx voor de andere kant van
 * dezelfde botsing: de dok wijkt nu zelf niet meer, sleufinhoud hoort er dus
 * uit eigen beweging niet in te hangen).
 */
import type { ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router';
import {
  Calendar, CheckSquare, Mic, Terminal, BookOpen, TrendingUp, BrainCircuit, Settings, MessageSquare, Plus, Bot,
} from 'lucide-react';
import { PlaatSlot } from '@/presentation/components/layout/PlaatSlots';
import { useVoiceStore } from '@/presentation/store/voiceStore';
import { useUIStore } from '@/presentation/store/uiStore';

/** De tabs die de `rechts`-sleuf al met hun eigen inhoud vullen -- hier NIET
 *  nog eens overheen portalen. Paden zoals in `App.tsx`'s routetabel. */
const GEDEKTE_PADEN = ['/calendar', '/ledger', '/code-editor', '/maps-3d'];

interface CloudActie {
  id: string;
  label: string;
  icoon: ReactNode;
  doe: (ctx: { nav: ReturnType<typeof useNavigate>; opCommando: () => void }) => void;
}

interface RouteCloud {
  titel: string;
  ondertitel: string;
  acties: CloudActie[];
}

/** Eén regel per tab die iets eigens wil. Onbekend pad = `DEFAULT_CLOUD`. */
const ROUTE_CLOUDS: Record<string, RouteCloud> = {
  '/trading': {
    titel: 'Trading',
    ondertitel: 'Snel bij de hand op deze tab',
    acties: [
      { id: 'algo', label: 'AXE Algo chat', icoon: <TrendingUp size={17} />, doe: ({ nav }) => nav('/trading-intel') },
      { id: 'note', label: 'Notitie', icoon: <BookOpen size={17} />, doe: () => window.dispatchEvent(new CustomEvent('axe-toggle-quick-note')) },
      { id: 'voice', label: 'Spreek met AXE', icoon: <Mic size={17} />, doe: () => { void useVoiceStore.getState().startListening(); } },
    ],
  },
  '/memory': {
    titel: 'Memory',
    ondertitel: 'Wat AXE onthoudt, bij de hand',
    acties: [
      { id: 'explore', label: 'Verken geheugen', icoon: <BrainCircuit size={17} />, doe: ({ nav }) => nav('/memory/explore') },
      { id: 'note', label: 'Notitie', icoon: <BookOpen size={17} />, doe: () => window.dispatchEvent(new CustomEvent('axe-toggle-quick-note')) },
    ],
  },
  '/settings': {
    titel: 'Settings',
    ondertitel: 'Terug naar waar je was',
    acties: [
      { id: 'agents', label: 'Agents', icoon: <Bot size={17} />, doe: ({ nav }) => nav('/agents') },
      { id: 'tasks', label: 'Taken', icoon: <CheckSquare size={17} />, doe: ({ nav }) => nav('/tasks') },
    ],
  },
  /* Was eerst de generieke kaart met "Taken" -> `/tasks`, een link naar de
   * pagina waar je al op staat. Een echte actie op deze tab is er een NIEUWE
   * taak beginnen, niet er een opzoeken die je al ziet. */
  '/tasks': {
    titel: 'Tasks',
    ondertitel: 'Nieuw werk vastleggen, niet opzoeken',
    acties: [
      { id: 'nieuw', label: 'Nieuwe taak via commando', icoon: <Plus size={17} />, doe: ({ opCommando }) => opCommando() },
      { id: 'calendar', label: 'Agenda', icoon: <Calendar size={17} />, doe: ({ nav }) => nav('/calendar') },
      { id: 'voice', label: 'Spreek met AXE', icoon: <Mic size={17} />, doe: () => { void useVoiceStore.getState().startListening(); } },
    ],
  },
};

const DEFAULT_CLOUD: RouteCloud = {
  titel: 'AXE',
  ondertitel: 'Snelle acties voor deze tab',
  acties: [
    { id: 'calendar', label: 'Agenda', icoon: <Calendar size={17} />, doe: ({ nav }) => nav('/calendar') },
    { id: 'voice', label: 'Spreek met AXE', icoon: <Mic size={17} />, doe: () => { void useVoiceStore.getState().startListening(); } },
    { id: 'terminal', label: 'Terminal', icoon: <Terminal size={17} />, doe: ({ nav }) => nav('/terminal') },
  ],
};

export function AdaptiveChatCloud() {
  const location = useLocation();
  const navigate = useNavigate();
  const setCommandPaletteOpen = useUIStore(s => s.setCommandPaletteOpen);

  if (GEDEKTE_PADEN.some(p => location.pathname.startsWith(p))) return null;
  // Home heeft de volle Core Sphere en de chat al -- geen tweede, kleinere
  // wolk ernaast op de allereerste pagina die iemand ziet.
  if (location.pathname === '/' || location.pathname === '') return null;

  const cloud = ROUTE_CLOUDS[location.pathname] ?? DEFAULT_CLOUD;
  const ctx = { nav: navigate, opCommando: () => setCommandPaletteOpen(true) };

  return (
    <PlaatSlot slot="rechts">
      <section
        className="axe-adaptieve-wolk"
        data-axe-doel="adaptive-chat-cloud"
        // Zie de uitleg bovenin dit bestand: boven in de sleuf, niet onder --
        // onder is waar de rechter RadiaalDok zijn vaste 268×268 hoek heeft.
        style={{ alignSelf: 'flex-start' }}
      >
        <h2 className="axe-adaptieve-wolk-kop">
          <MessageSquare size={13} style={{ color: 'var(--accent-cyan)', flexShrink: 0 }} />
          <span>{cloud.titel}</span>
        </h2>
        <p className="axe-adaptieve-wolk-sub">{cloud.ondertitel}</p>
        {/* Zelfde kleur-/schaduw-taal als de radiale dok-knoppen
            (.axe-dok-tab in axe-look.css), op een rij in plaats van in een
            waaier -- zie de uitleg bovenin dit bestand. */}
        <div className="axe-adaptieve-wolk-rij">
          {cloud.acties.map(actie => (
            <button
              key={actie.id}
              type="button"
              title={actie.label}
              aria-label={actie.label}
              onClick={() => actie.doe(ctx)}
              className="axe-adaptieve-wolk-knop"
            >
              {actie.icoon}
            </button>
          ))}
          <button
            type="button"
            title="Instellingen"
            aria-label="Instellingen"
            onClick={() => navigate('/settings')}
            className="axe-adaptieve-wolk-knop"
            style={{ color: 'var(--text-muted)' }}
          >
            <Settings size={16} />
          </button>
        </div>
      </section>
    </PlaatSlot>
  );
}
