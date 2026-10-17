/**
 * Projects-landing for AXE Developer. The workspace itself is CodeEditorPage
 * + MobileStudioChrome (files, editor, key bar, agent, preview, git, build).
 */
import { PhoneKaart, PhoneKop, PhoneRij } from '@/presentation/pages/phone/phoneUi';
import type { ClaudeRepoInfo } from '@/infrastructure/gateways/axeCoreApiService';

export default function PhoneDeveloper({
  repos, fout, huidig, onKies,
}: {
  repos: Record<string, ClaudeRepoInfo> | null;
  fout: string | null;
  huidig: string;
  onKies: (naam: string) => void;
}) {
  const namen = repos ? Object.keys(repos) : [];
  return (
    <div className="flex h-full min-h-0 w-full max-w-full flex-col overflow-x-hidden overflow-y-auto px-1" data-axe-phone-app="developer">
      <PhoneKop title="AXE Developer" />
      <p className="mb-2 text-[12px]" style={{ color: 'var(--text-muted)' }}>
        Pick a project. Editor, agent, preview and git stay in this tab — no AXE composer.
      </p>
      {fout && <p className="mb-2 text-[12px]">{fout}</p>}
      <PhoneKaart kicker="Projects">
        {repos === null && <div className="text-[12px]" style={{ color: 'var(--text-muted)' }}>Loading repos…</div>}
        {repos && namen.length === 0 && <div className="text-[12px]" style={{ color: 'var(--text-muted)' }}>No whitelisted repos on this host.</div>}
        {namen.map((naam) => {
          const info = repos![naam];
          return (
            <button key={naam} type="button" data-axe-repo={naam} onClick={() => onKies(naam)} className="w-full text-left">
              <PhoneRij
                title={naam}
                sub={[info.branch, info.runnable ? 'runnable' : 'protected'].filter(Boolean).join(' · ')}
                extra={huidig === naam ? <span className="text-[11px]" style={{ color: '#22d3ee' }}>open</span> : null}
              />
            </button>
          );
        })}
      </PhoneKaart>
    </div>
  );
}
