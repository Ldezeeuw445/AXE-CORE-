/**
 * Wat AXE je laat zien, in de notch zelf.
 *
 * "AXE, laat me de kaart van LA zien" moest tot nu toe eindigen in een
 * alinea tekst, of in Home — en Home is precies het venster dat je net
 * geminimaliseerd had. Dit tekent het antwoord in de strook: een kleine kaart
 * of de eerste regels van wat hij vond, met één knop om het groot te openen
 * in het venster dat daarvoor bestaat.
 *
 * De projectie komt uit `projectieUitVraag` — dezelfde router die Home
 * gebruikt. Deze component beslist alleen hoe hij eruitziet en waar "groot"
 * naartoe gaat, nooit wat de vraag betekende.
 */
import { ExternalLink, Map as MapIcon, Search, X } from 'lucide-react';
import type { ProjectionPayload } from '@/domain/sphere/projectionTypes';
import { tegelRaster } from '@/domain/maps/tegels';
import { huidigeMonitorIndex, openPageOnMonitor } from '@/infrastructure/gateways/windowManagerService';
import { eersteUrl, paginaVoorProjectie } from './notchResultaatDoel';

function MiniKaart({ lat, lng }: { lat: number; lng: number }) {
  // 3 bij 2 tegels: breed zoals de strook, en op zoom 12 zie je de stad en
  // niet één kruispunt. Namen in een eigen laag erboven, zoals basemap.ts
  // voorschrijft; die laag mag ontbreken zonder dat de kaart leeg lijkt.
  const tegels = tegelRaster(lat, lng, 12, 3, 2);
  return (
    <div className="axe-ov__kaart" aria-hidden="true">
      {tegels.map((t) => (
        <div className="axe-ov__tegel" key={`${t.z}-${t.x}-${t.y}`}>
          <img src={t.url} alt="" draggable={false} loading="lazy" />
          <img src={t.labelUrl} alt="" draggable={false} loading="lazy" className="axe-ov__tegel-namen" />
        </div>
      ))}
      <span className="axe-ov__kaart-pin" />
    </div>
  );
}

export function NotchResultaat({
  projectie,
  onSluit,
}: {
  projectie: ProjectionPayload;
  onSluit: () => void;
}) {
  const lat = Number(projectie.data?.lat);
  const lng = Number(projectie.data?.lng);
  const heeftPlek = projectie.mode === 'map' && Number.isFinite(lat) && Number.isFinite(lng);
  const url = eersteUrl(projectie.text);
  const regels = (projectie.text || '')
    .split('\n')
    .map((r) => r.trim())
    .filter((r) => r !== '' && !/^https?:\/\//.test(r))
    .slice(0, 3);

  return (
    <div className="axe-ov__resultaat">
      <div className="axe-ov__res-kop">
        {projectie.mode === 'map' ? <MapIcon size={13} /> : <Search size={13} />}
        <strong>{projectie.title}</strong>
        {projectie.subtitle && <span className="axe-ov__res-sub">{projectie.subtitle}</span>}
        <button type="button" aria-label="Sluit resultaat" onClick={onSluit}>
          <X size={12} />
        </button>
      </div>

      {heeftPlek ? (
        <MiniKaart lat={lat} lng={lng} />
      ) : (
        regels.length > 0 && (
          <div className="axe-ov__res-tekst">
            {regels.map((r, i) => (
              <p key={i}>{r}</p>
            ))}
          </div>
        )
      )}

      <div className="axe-ov__res-voet">
        {url && (
          <span className="axe-ov__res-bron" title={url}>
            {hostVan(url)}
          </span>
        )}
        <button
          type="button"
          className="axe-ov__res-groot"
          onClick={async () => {
            // Faalt dit (geen Tauri, of de pagina bestaat niet meer), dan
            // zegt openPageOnMonitor dat met een fout in plaats van een leeg
            // venster te openen. Niets opvangen: dan verdwijnt de reden.
            await openPageOnMonitor(paginaVoorProjectie(projectie.mode), await huidigeMonitorIndex());
          }}
        >
          <ExternalLink size={12} />
          Open groot
        </button>
      </div>
    </div>
  );
}

function hostVan(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url.slice(0, 40);
  }
}
