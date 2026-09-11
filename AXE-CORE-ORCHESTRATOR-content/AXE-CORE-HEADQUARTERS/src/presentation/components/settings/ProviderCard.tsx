import type { LucideIcon } from 'lucide-react';
import { Check, ChevronRight, Eye, EyeOff, Loader2, Trash2 } from 'lucide-react';
import { standTekst, standKleur, type KaartStand } from '@/domain/providerCardStand';

/**
 * One provider, one card — the same card for every one of them.
 *
 * Every card is built from the same four bands: who it is, how it is doing,
 * what it runs on, and what you can do with it. A provider without a model
 * list keeps all four; that band is simply empty. Dat is met opzet: als de
 * ene kaart een band mist en de andere niet, staan ze in het raster niet meer
 * op dezelfde lijnen, en dan lijkt er iets stuk terwijl er alleen iets
 * ontbreekt.
 *
 * De hoogte komt van het raster, niet van de inhoud: de kaart is een kolom en
 * de knoppenband staat op `mt-auto`. Daardoor staan de knoppen van elke kaart
 * in een rij op dezelfde hoogte, hoeveel modellen er ook boven staan.
 *
 * Falen verandert alleen wat er STAAT, nooit hoe groot het is. De stip wordt
 * rood en de reden neemt de plek van de status in. Een kaart die bij een fout
 * uitklapt duwt de hele rij naar beneden, en dan lees je de storing af aan de
 * sprong in plaats van aan de tekst.
 */

/** Wat een kaart moet weten om zichzelf te tekenen. */
export interface ProviderKaart {
  id: string;
  name: string;
  icon: LucideIcon;
  accent: string;
  placeholder: string;
  defaultModel: string;
  docsUrl: string;
  needsKey: boolean;
}

export function ProviderCard({
  kaart, stand, sleutel, model, fout, laatsteTest, sleutelZichtbaar, opServer,
  modellen, isPrimair, aangepast,
  onSleutel, onModel, onTest, onToonSleutel, onPrimair, onVerwijder,
}: {
  kaart: ProviderKaart;
  stand: KaartStand;
  sleutel: string;
  model: string;
  fout?: string;
  laatsteTest?: string | number;
  sleutelZichtbaar: boolean;
  opServer: boolean;
  modellen: string[];
  isPrimair: boolean;
  aangepast: boolean;
  onSleutel: (waarde: string) => void;
  onModel: (model: string) => void;
  onTest: () => void;
  onToonSleutel: () => void;
  onPrimair: () => void;
  onVerwijder?: () => void;
}) {
  const Icoon = kaart.icon;
  const ingesteld = !kaart.needsKey || !!sleutel || opServer;
  const kleur = standKleur(stand, ingesteld);

  return (
    <div
      className="h-full flex flex-col rounded-2xl overflow-hidden"
      style={{
        background: 'var(--surface-bg)',
        boxShadow: 'var(--surface-edge)',
        // De rand draagt de stand. Op achttien kaarten is een stip van zeven
        // pixels te klein om te scannen; een rand zie je zonder te lezen.
        // Elke kaart dezelfde rand. Hij was gekleurd naar de stand (groen bij
        // werkt, rood bij mislukt), en met achttien kaarten onder elkaar werd
        // het scherm hard en rommelig -- terwijl Law 10 van de ontwerplaag
        // precies dit zegt: kleur hoort in de letters, niet in een vlak of een
        // rand. De stip en de tekst rechtsboven dragen de stand al.
        border: '1px solid var(--border-default)',
      }}
    >
      {/* Wie het is, en hoe het ervoor staat. */}
      <div className="flex items-center gap-3 px-4 py-3">
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: 'rgba(255,255,255,0.05)' }}
        >
          <Icoon size={17} style={{ color: kaart.accent }} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-surface-body font-medium truncate" style={{ color: 'var(--text-primary)' }}>
            {kaart.name}
          </div>
          <div className="text-axe-meta truncate" style={{ color: 'var(--text-muted)' }}>
            {model || kaart.defaultModel}{isPrimair ? ' · primary slot' : ''}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-axe-meta" style={{ color: kleur }}>{standTekst(stand, ingesteld)}</span>
          {stand === 'testing'
            ? <Loader2 size={9} className="animate-spin" style={{ color: kleur }} />
            : <span className="w-[7px] h-[7px] rounded-full block" style={{ background: kleur }} />}
        </div>
      </div>

      <div style={{ height: 1, background: 'var(--border-default)' }} />

      {/* Hoe het ervoor staat, in woorden. Bij een fout staat hier de reden --
          zelfde plek, zelfde hoogte, andere tekst. */}
      <div className="px-4 py-3 flex flex-col gap-2">
        <div className="flex items-start justify-between gap-3" style={{ minHeight: 30 }}>
          <span className="text-axe-meta shrink-0 pt-px" style={{ color: 'var(--text-muted)' }}>
            {stand === 'fail' ? 'Reason' : 'Last test'}
          </span>
          {/* Twee regels en niet afkappen. Een reden die eindigt op "..." is
              geen reden -- dan weet je nog steeds niet wat er mis is. De vaste
              minimumhoogte houdt de kaarten even groot, of er nu één woord
              staat of twee regels. */}
          <span
            className="text-axe-meta text-right"
            style={{
              color: stand === 'fail' ? 'var(--m-broken)' : 'var(--text-secondary)',
              display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
              overflow: 'hidden', lineHeight: 1.35,
            }}
            title={stand === 'fail' ? fout : undefined}
          >
            {stand === 'fail'
              ? (fout || 'no reason given')
              : laatsteTest ? new Date(laatsteTest).toLocaleTimeString() : 'never'}
          </span>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-axe-meta shrink-0" style={{ color: 'var(--text-muted)' }}>Key</span>
          <div className="flex items-center gap-1.5 min-w-0">
            {kaart.needsKey ? (
              <>
                <input
                  value={sleutel}
                  /* trim() bij het plakken: een sleutel uit een console of
                     een mail sleept vaak een spatie of een regeleinde mee, en
                     dan wordt een goede sleutel geweigerd om iets wat je niet
                     kunt zien. */
                  onChange={(e) => onSleutel(e.target.value.trim())}
                  type={sleutelZichtbaar ? 'text' : 'password'}
                  placeholder={kaart.placeholder}
                  spellCheck={false}
                  className="axe-field text-right min-w-0 flex-1 font-mono-data"
                  style={{ fontSize: 12 }}
                />
                <button onClick={onToonSleutel} aria-label={sleutelZichtbaar ? 'Hide key' : 'Show key'} style={{ color: 'var(--text-muted)' }}>
                  {sleutelZichtbaar ? <EyeOff size={12} /> : <Eye size={12} />}
                </button>
              </>
            ) : (
              <span className="text-axe-meta" style={{ color: 'var(--text-muted)' }}>
                {opServer ? 'on the server' : 'not needed'}
              </span>
            )}
          </div>
        </div>
      </div>

      <div style={{ height: 1, background: 'var(--border-default)' }} />

      {/* Modellen. Leeg als deze provider er geen lijst voor heeft -- de band
          blijft staan zodat de kaarten dezelfde vorm houden. */}
      <div className="px-4 py-3 flex flex-wrap gap-1.5 items-start" style={{ minHeight: 46 }}>
        {modellen.length > 0 ? modellen.map(m => {
          const aan = (model || kaart.defaultModel) === m;
          return (
            <button
              key={m}
              onClick={() => onModel(m)}
              className="axe-chip !text-[10px] !py-1 !px-2 !bg-transparent !border-transparent"
              style={aan ? { color: kaart.accent } : undefined}
              aria-pressed={aan}
            >
              {aan && <Check size={9} className="inline mr-1 -mt-px" />}{m}
            </button>
          );
        }) : (
          <span className="text-axe-meta" style={{ color: 'var(--text-muted)' }}>
            {kaart.defaultModel || 'no model list'}
          </span>
        )}
      </div>

      <div style={{ height: 1, background: 'var(--border-default)' }} />

      {/* Wat je ermee kunt. Op mt-auto, zodat deze band in elke kaart van een
          rij op dezelfde hoogte staat. */}
      <div className="mt-auto px-4 py-2.5 flex items-center gap-2">
        <button onClick={onTest} className="axe-chip !text-[11px]" disabled={stand === 'testing'}>
          {stand === 'testing' ? 'Testing…' : 'Test'}
        </button>
        {!isPrimair && ingesteld && (
          <button onClick={onPrimair} className="axe-chip !text-[11px]">Make primary</button>
        )}
        <div className="flex-1" />
        {aangepast && onVerwijder && (
          <button onClick={onVerwijder} aria-label="Remove provider" style={{ color: 'var(--text-muted)' }}>
            <Trash2 size={11} />
          </button>
        )}
        {kaart.docsUrl && (
          <a href={kaart.docsUrl} target="_blank" rel="noreferrer"
             className="text-axe-meta flex items-center gap-0.5" style={{ color: 'var(--text-muted)' }}>
            Docs <ChevronRight size={9} />
          </a>
        )}
      </div>
    </div>
  );
}
