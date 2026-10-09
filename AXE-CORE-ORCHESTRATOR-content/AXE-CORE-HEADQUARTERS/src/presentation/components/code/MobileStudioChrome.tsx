/**
 * De rand om de code-studio op een telefoon: een werkbalk bovenin, een onderbalk om van paneel te
 * wisselen, een toetsenbalk voor de tekens die een telefoontoetsenbord verstopt, een invoerveld voor
 * de agent en een blad om hele apps en features te beginnen. De panelen zelf zijn die van de
 * desktop-studio (CodeEditorPage); dit bepaalt alleen welke er zichtbaar is en hoe je er bij komt.
 *
 * Replit / Emergent-stijl: je kunt overal bij met één duim, en "bouw me een app" is één tik.
 */
import { useEffect, useRef, useState } from 'react';
import {
  Bot, Code2, Eye, FilePlus, FolderOpen, GitBranch, Layers, Loader2, Play, Save, Send, Sparkles, TerminalSquare, X,
} from 'lucide-react';
import {
  MOBIEL_PANELEN, TOETSEN, APP_SJABLONEN, FEATURE_IDEEEN, paarInvoeging,
  type Bouwsteen, type MobielPaneel, type Toets,
} from '@/domain/codeStudio/mobileStudio';

const ICOON: Record<MobielPaneel, typeof Bot> = {
  agent: Bot, files: FolderOpen, code: Code2, term: TerminalSquare, preview: Eye,
};

/** Wat de toetsenbalk van de Monaco-editor nodig heeft. Eigen minimale vorm, zodat dit bestand Monaco niet kent. */
export interface EditorHandvat {
  focus: () => void;
  trigger: (bron: string, actie: string, payload: unknown) => void;
  getSelection: () => unknown;
  getPosition: () => { lineNumber: number; column: number } | null;
  setPosition: (p: { lineNumber: number; column: number }) => void;
  executeEdits: (bron: string, edits: unknown[]) => unknown;
  getModel: () => { getValueInRange: (r: unknown) => string } | null;
}

const COMMANDO: Record<string, string> = {
  links: 'cursorLeft', rechts: 'cursorRight', omhoog: 'cursorUp', omlaag: 'cursorDown',
  ongedaan: 'undo', opnieuw: 'redo', inspringen: 'tab', uitspringen: 'outdent', commentaar: 'editor.action.commentLine',
};

export function voerToetsUit(ed: EditorHandvat, t: Toets): void {
  if (t.commando) {
    ed.trigger('toets', COMMANDO[t.commando], null);
  } else {
    const sel = ed.getSelection();
    const gesel = sel ? ed.getModel()?.getValueInRange(sel) ?? '' : '';
    const { tekst, terug } = t.paar ? paarInvoeging(t.paar, gesel) : { tekst: t.tekst ?? '', terug: 0 };
    ed.executeEdits('toets', [{ range: sel, text: tekst, forceMoveMarkers: true }]);
    const pos = terug ? ed.getPosition() : null;
    if (pos) ed.setPosition({ lineNumber: pos.lineNumber, column: pos.column - terug });
  }
  ed.focus();
}

// ── werkbalk ────────────────────────────────────────────────────────────

export function MobileStudioBar({
  repo, branch, ongeslagen, opslaan, bezigMetOpslaan, draait, opRun, opNieuw,
}: {
  repo: string; branch?: string; ongeslagen: boolean; opslaan: () => void; bezigMetOpslaan: boolean;
  draait: boolean; opRun: () => void; opNieuw: () => void;
}) {
  return (
    <div className="axe-mstudio-top">
      <div className="axe-mstudio-bar" role="toolbar" aria-label="Studio">
        <button type="button" onClick={opslaan} aria-label="Save" data-aan={ongeslagen ? 'ja' : undefined} className="axe-mstudio-knop">
          {bezigMetOpslaan ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          <span>Save</span>
        </button>
        <button type="button" onClick={opRun} aria-label="Run preview" data-aan={draait ? 'ja' : undefined} className="axe-mstudio-knop axe-mstudio-run">
          <Play size={16} /> <span>Run</span>
        </button>
        <button type="button" onClick={opNieuw} aria-label="New" className="axe-mstudio-knop">
          <Layers size={16} /> <span>Build</span>
        </button>
      </div>
      <span className="axe-mstudio-repo" title={repo}>
        <GitBranch size={13} />
        <b>{repo || 'workspace'}</b>
        {branch && <i>{branch}</i>}
      </span>
    </div>
  );
}

/** Wat je ziet zolang er geen bestand open is: waar je heen kunt, in plaats van "sleep een bestand". */
export function MobileLegeEditor({ opFiles, opAgent, opNieuw }: { opFiles: () => void; opAgent: () => void; opNieuw: () => void }) {
  return (
    <div className="axe-mstudio-leeg">
      <Code2 size={30} />
      <b>No file open</b>
      <p>Pick a file, or tell the agent what to build.</p>
      <div>
        <button type="button" onClick={opFiles}><FolderOpen size={16} /> Browse files</button>
        <button type="button" onClick={opAgent}><Bot size={16} /> Ask the agent</button>
        <button type="button" onClick={opNieuw}><FilePlus size={16} /> New file</button>
      </div>
    </div>
  );
}

// ── onderbalk ───────────────────────────────────────────────────────────

export function MobileStudioNav({
  paneel, opKies, agentBezig, ongeslagen,
}: { paneel: MobielPaneel; opKies: (p: MobielPaneel) => void; agentBezig: boolean; ongeslagen: number }) {
  return (
    <nav className="axe-mstudio-nav" aria-label="Studio panels">
      {MOBIEL_PANELEN.map(p => {
        const Icon = ICOON[p.id];
        return (
          <button key={p.id} type="button" onClick={() => opKies(p.id)} data-aan={paneel === p.id ? 'ja' : undefined}>
            <span className="axe-mstudio-icoon">
              <Icon size={19} />
              {p.id === 'agent' && agentBezig && <i className="axe-mstudio-stip" aria-hidden="true" />}
              {p.id === 'code' && ongeslagen > 0 && <i className="axe-mstudio-stip" aria-hidden="true" />}
            </span>
            <span>{p.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

// ── toetsenbalk ─────────────────────────────────────────────────────────

export function MobileKeyBar({ editor }: { editor: EditorHandvat | null }) {
  return (
    <div className="axe-mstudio-toetsen" role="toolbar" aria-label="Code keys">
      {TOETSEN.map(t => (
        <button
          key={t.label}
          type="button"
          disabled={!editor}
          // De editor houdt de focus (en dus het toetsenbord) als je een toets raakt.
          onPointerDown={e => e.preventDefault()}
          onClick={() => editor && voerToetsUit(editor, t)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

// ── agent ───────────────────────────────────────────────────────────────

const SNELLE_VRAGEN = ['Explain this file', 'Find the bug', 'Add tests', 'Make it responsive'];

export function MobileAgentInput({
  waarde, opWaarde, opVerstuur, bezig,
}: { waarde: string; opWaarde: (v: string) => void; opVerstuur: () => void; bezig: boolean }) {
  const veld = useRef<HTMLTextAreaElement>(null);
  // Een sjabloon vult het veld in: zet de cursor erin zodat Luka de <name> meteen kan invullen.
  useEffect(() => { if (waarde) veld.current?.focus({ preventScroll: true }); }, [waarde === '' ? 0 : 1]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="axe-mstudio-agent">
      <div className="axe-mstudio-snel">
        {SNELLE_VRAGEN.map(v => (
          <button key={v} type="button" onClick={() => opWaarde(v)}>{v}</button>
        ))}
      </div>
      <div className="axe-mstudio-invoer">
        <textarea
          ref={veld}
          value={waarde}
          onChange={e => opWaarde(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); opVerstuur(); } }}
          placeholder="Tell the agent what to build or fix…"
          rows={2}
          aria-label="Ask the code agent"
        />
        <button type="button" onClick={opVerstuur} disabled={!waarde.trim() || bezig} aria-label="Send to the agent">
          {bezig ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
        </button>
      </div>
    </div>
  );
}

// ── nieuw: bestand, app of feature ──────────────────────────────────────

export function MobileNewSheet({
  open, opSluit, opBestand, opKies,
}: { open: boolean; opSluit: () => void; opBestand: () => void; opKies: (b: Bouwsteen) => void }) {
  const [tab, setTab] = useState<'app' | 'feature'>('app');
  if (!open) return null;
  const lijst = tab === 'app' ? APP_SJABLONEN : FEATURE_IDEEEN;
  return (
    <div className="axe-mstudio-blad-wrap" onClick={opSluit}>
      <div className="axe-mstudio-blad" role="dialog" aria-label="Build" onClick={e => e.stopPropagation()}>
        <div className="axe-mstudio-blad-kop">
          <b>Build</b>
          <button type="button" onClick={opSluit} aria-label="Close"><X size={18} /></button>
        </div>
        <button type="button" className="axe-mstudio-rij" onClick={() => { opBestand(); opSluit(); }}>
          <FilePlus size={18} />
          <span><b>New file</b><i>An empty file in the open repo</i></span>
        </button>
        <div className="axe-mstudio-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={tab === 'app'} data-aan={tab === 'app' ? 'ja' : undefined} onClick={() => setTab('app')}>Start an app</button>
          <button type="button" role="tab" aria-selected={tab === 'feature'} data-aan={tab === 'feature' ? 'ja' : undefined} onClick={() => setTab('feature')}>Add a feature</button>
        </div>
        <div className="axe-mstudio-raster">
          {lijst.map(b => (
            <button key={b.id} type="button" className="axe-mstudio-kaart" onClick={() => { opKies(b); opSluit(); }}>
              <Sparkles size={15} />
              <b>{b.titel}</b>
              <i>{b.uitleg}</i>
            </button>
          ))}
        </div>
        <p className="axe-mstudio-noot">The agent gets the request filled in, so you can change it before you send it.</p>
      </div>
    </div>
  );
}
