/**
 * Projects-landing for AXE Developer. The workspace itself is CodeEditorPage
 * + MobileStudioChrome (files, editor, key bar, agent, preview, git, build).
 * Header is PhoneAppBar; this is only the list — no second title row.
 */
import { telefoonRepoLijst, type TelefoonHostRepo, type TelefoonRepoBron } from '@/domain/phone/phoneRepos';
import { PhoneKaart, PhoneKop, PhoneRij } from '@/presentation/pages/phone/phoneUi';

export default function PhoneDeveloper({
  host, github, fout, huidig, onKies,
}: {
  host: Record<string, TelefoonHostRepo> | null;
  github: readonly TelefoonRepoBron[];
  fout: string | null;
  huidig: string;
  onKies: (naam: string) => void;
}) {
  const lijst = telefoonRepoLijst({ host, github, huidig });
  const laden = host === null && lijst.length === 0;
  return (
    <div className="flex h-full min-h-0 w-full max-w-full flex-col overflow-x-hidden overflow-y-auto px-1" data-axe-phone-app="developer">
      <PhoneKop title="AXE Developer" />
      {fout && <p className="mb-2 text-[12px]" style={{ color: 'var(--text-muted)' }}>{fout}</p>}
      <PhoneKaart kicker="Projects">
        {laden && <div className="text-[12px]" style={{ color: 'var(--text-muted)' }}>Loading repos…</div>}
        {!laden && lijst.length === 0 && (
          <div className="text-[12px]" style={{ color: 'var(--text-muted)' }}>No repos in the GitHub registry.</div>
        )}
        {lijst.map((rij) => (
          <button key={rij.id} type="button" data-axe-repo={rij.id} onClick={() => onKies(rij.kiesId)} className="w-full min-w-0 text-left">
            <PhoneRij
              title={rij.titel}
              sub={rij.sub}
              extra={rij.open ? <span className="text-[11px]" style={{ color: '#22d3ee' }}>open</span> : null}
            />
          </button>
        ))}
      </PhoneKaart>
    </div>
  );
}
