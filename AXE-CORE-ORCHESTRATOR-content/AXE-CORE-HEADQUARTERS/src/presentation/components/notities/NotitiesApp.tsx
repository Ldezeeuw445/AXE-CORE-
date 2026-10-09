/**
 * Notities, zoals Apple Notes: links de lijst (zoeken, op dag gegroepeerd), rechts de notitie.
 *
 * Alles wat je typt wordt vanzelf bewaard: eerst lokaal, dan in Supabase (zie notitiesService), met de
 * stand eerlijk onderin ("Saved", "Saving…" of "Waiting for connection"). Nieuw is Cmd+N; je kunt
 * vet, cursief, onderstreept en een kleur zetten. Dezelfde notities als de Quick Note in de app en als de
 * Knowledge Base: het is één tabel.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bold, Italic, Plus, Search, Trash2, Underline } from 'lucide-react';
import {
  aantalWachtend, bewaarNotitie, echteId, laadNotities, maakNotitie, opWijziging, synchroniseer, verwijderNotitie,
} from '@/infrastructure/persistence/notitiesService';
import { datumLabel, fragmentUit, groepeer, platUitHtml, titelUit, zoek, type Notitie } from '@/domain/notities/notities';
import { APPS } from '@/domain/apps';
import { saneerNotitieHtml } from '@/domain/notities/saneer';

type Stand = 'opgeslagen' | 'bezig' | 'wacht';
const KLEUREN = APPS.slice(0, 5).map(a => ({ naam: a.label, kleur: a.kleur }));
const BEWAAR_NA_MS = 600;

export function NotitiesApp() {
  const [notities, setNotities] = useState<Notitie[]>([]);
  const [gekozen, setGekozen] = useState<string | null>(null);
  const [vraag, setVraag] = useState('');
  const [stand, setStand] = useState<Stand>('opgeslagen');
  const [verwijderVraag, setVerwijderVraag] = useState(false);
  const editor = useRef<HTMLDivElement>(null);
  const timer = useRef<number | undefined>(undefined);
  /** Wat de editor nu bevat en bij welke notitie: om te weten of er iets te bewaren valt. */
  const open = useRef<{ id: string; html: string } | null>(null);

  const ververs = useCallback(async () => {
    const { notities: lijst } = await laadNotities();
    setNotities(lijst);
    setStand(aantalWachtend() > 0 ? 'wacht' : 'opgeslagen');
    return lijst;
  }, []);

  // Bewaar wat er in de editor staat, nu meteen (bij wisselen, sluiten en weer verlaten van het venster).
  const bewaarNu = useCallback(async () => {
    window.clearTimeout(timer.current);
    const el = editor.current;
    const huidig = open.current;
    if (!el || !huidig) return;
    const html = el.innerHTML;
    if (html === huidig.html) return;
    open.current = { id: huidig.id, html };
    setStand('bezig');
    const uitkomst = await bewaarNotitie(huidig.id, html);
    setStand(uitkomst === 'opgeslagen' ? 'opgeslagen' : 'wacht');
    // De lijst volgt wat je net typte, zonder te wachten op wat de cloud terugstuurt (een iets oudere
    // lijst zou de notitie even terugzetten). De volgende verversing (focus, 30 s) haalt de rest binnen.
    const nu = new Date().toISOString();
    setNotities(vorige => vorige.map(n => (n.id === huidig.id ? { ...n, inhoud: html, titel: titelUit(html), aangepast: nu } : n)));
  }, []);

  // Eerste keer laden, en daarna bij focus, bij een wijziging in een ander venster en elke 30 s: dan
  // probeert hij ook wat nog wacht opnieuw te sturen.
  useEffect(() => {
    void ververs().then(lijst => { if (lijst.length && !gekozen) setGekozen(lijst[0].id); });
    const bijFocus = () => { void synchroniseer().then(ververs); };
    window.addEventListener('focus', bijFocus);
    window.addEventListener('online', bijFocus);
    const t = window.setInterval(bijFocus, 30_000);
    const af = opWijziging(() => { void ververs(); });
    const voorSluiten = () => { void bewaarNu(); };
    window.addEventListener('beforeunload', voorSluiten);
    window.addEventListener('blur', voorSluiten);
    return () => {
      window.removeEventListener('focus', bijFocus); window.removeEventListener('online', bijFocus);
      window.clearInterval(t); af();
      window.removeEventListener('beforeunload', voorSluiten); window.removeEventListener('blur', voorSluiten);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Een andere notitie kiezen zet zijn tekst in de editor (en bewaart eerst de vorige).
  const kies = useCallback(async (id: string) => {
    await bewaarNu();
    setGekozen(id);
    setVerwijderVraag(false);
  }, [bewaarNu]);

  const gekozenNotitie = notities.find(n => n.id === gekozen || echteId(n.id) === echteId(gekozen ?? '')) ?? null;
  useEffect(() => {
    const el = editor.current;
    if (!el) return;
    if (!gekozenNotitie) { el.innerHTML = ''; open.current = null; return; }
    // Niet overschrijven wat je net aan het typen bent: alleen bij een andere notitie.
    if (open.current?.id !== gekozenNotitie.id) {
      // Ook wat uit de cloud komt gaat door de zeef: een notitie kan ook ergens anders geschreven zijn.
      el.innerHTML = saneerNotitieHtml(gekozenNotitie.inhoud);
      open.current = { id: gekozenNotitie.id, html: el.innerHTML };
      el.focus();
    }
  }, [gekozenNotitie]);

  const bijInvoer = () => {
    setStand('bezig');
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => { void bewaarNu(); }, BEWAAR_NA_MS);
  };

  const nieuw = useCallback(async () => {
    await bewaarNu();
    // Een lege notitie hergebruiken in plaats van er een tweede naast te zetten.
    const leeg = notities.find(n => platUitHtml(n.inhoud).trim() === '');
    if (leeg) { setGekozen(leeg.id); return; }
    const n = await maakNotitie('');
    await ververs();
    setGekozen(n.id);
    window.setTimeout(() => editor.current?.focus(), 30);
  }, [bewaarNu, notities, ververs]);

  useEffect(() => {
    const opToets = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'n') { e.preventDefault(); void nieuw(); }
    };
    window.addEventListener('keydown', opToets);
    return () => window.removeEventListener('keydown', opToets);
  }, [nieuw]);

  const verwijder = async () => {
    if (!gekozenNotitie) return;
    const volgende = notities.find(n => n.id !== gekozenNotitie.id)?.id ?? null;
    window.clearTimeout(timer.current);
    open.current = null;
    await verwijderNotitie(gekozenNotitie.id);
    setVerwijderVraag(false);
    await ververs();
    setGekozen(volgende);
  };

  const opmaak = (commando: string, waarde?: string) => {
    editor.current?.focus();
    document.execCommand(commando, false, waarde);
    bijInvoer();
  };

  const groepen = useMemo(() => groepeer(zoek(notities, vraag), new Date()), [notities, vraag]);
  const nu = new Date();
  const status = stand === 'bezig' ? 'Saving…' : stand === 'wacht' ? 'Waiting for connection — kept on this Mac' : 'Saved';

  return (
    <div className="axe-notities">
      <aside className="axe-notities__lijst">
        <div className="axe-notities__zoek">
          <Search size={14} />
          <input value={vraag} onChange={e => setVraag(e.target.value)} placeholder="Search" aria-label="Search notes" spellCheck={false} />
          <button type="button" onClick={() => void nieuw()} title="New note (⌘N)" aria-label="New note"><Plus size={16} /></button>
        </div>
        <div className="axe-notities__rijen">
          {groepen.length === 0 && (
            <p className="axe-notities__leeg">{vraag ? 'No notes match.' : 'No notes yet. ⌘N makes one.'}</p>
          )}
          {groepen.map(g => (
            <section key={g.kop}>
              <h4>{g.kop}</h4>
              {g.items.map(n => (
                <button
                  key={n.id} type="button" className="axe-notities__rij"
                  data-aan={n.id === gekozenNotitie?.id ? 'ja' : undefined}
                  onClick={() => void kies(n.id)}
                >
                  <b>{titelUit(n.inhoud)}</b>
                  <span><i>{datumLabel(n.aangepast, nu)}</i>{fragmentUit(n.inhoud, 60) || 'No additional text'}</span>
                </button>
              ))}
            </section>
          ))}
        </div>
      </aside>

      <section className="axe-notities__blad">
        <div className="axe-notities__balk" onMouseDown={e => e.preventDefault()}>
          <button type="button" onClick={() => opmaak('bold')} title="Bold" aria-label="Bold"><Bold size={14} /></button>
          <button type="button" onClick={() => opmaak('italic')} title="Italic" aria-label="Italic"><Italic size={14} /></button>
          <button type="button" onClick={() => opmaak('underline')} title="Underline" aria-label="Underline"><Underline size={14} /></button>
          <span className="axe-notities__kleuren">
            {KLEUREN.map(k => (
              <button key={k.naam} type="button" title={k.naam} aria-label={`Text colour ${k.naam}`}
                className="axe-notities__kleur" style={{ background: k.kleur }} onClick={() => opmaak('foreColor', k.kleur)} />
            ))}
          </span>
          <span className="axe-notities__ruimte" />
          {verwijderVraag ? (
            <span className="axe-notities__vraag">
              Delete this note?
              <button type="button" onClick={() => void verwijder()}>Delete</button>
              <button type="button" onClick={() => setVerwijderVraag(false)}>Keep</button>
            </span>
          ) : (
            <button type="button" onClick={() => setVerwijderVraag(true)} disabled={!gekozenNotitie} title="Delete note" aria-label="Delete note"><Trash2 size={14} /></button>
          )}
        </div>

        {gekozenNotitie ? (
          <div
            ref={editor} className="axe-notities__editor" contentEditable suppressContentEditableWarning role="textbox"
            aria-multiline="true" aria-label="Note" spellCheck data-placeholder="Start typing…" onInput={bijInvoer}
          />
        ) : (
          <div className="axe-notities__niets">
            <p>No note selected</p>
            <button type="button" onClick={() => void nieuw()}><Plus size={14} /> New note</button>
          </div>
        )}
        <footer className="axe-notities__voet" data-stand={stand}>{notities.length} {notities.length === 1 ? 'note' : 'notes'} · {status}</footer>
      </section>
    </div>
  );
}
