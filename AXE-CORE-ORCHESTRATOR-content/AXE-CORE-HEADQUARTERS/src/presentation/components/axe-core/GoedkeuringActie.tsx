/**
 * Approve / Decline op de rijen van core_approvals. Zelfde knoppen overal:
 * desktop-Home, rail, bel, PWA en de 44px-strook op de A17.
 */
import type { GoedkeuringsRij } from '@/domain/agents/pendingApproval';
import { PHONE_TIKMAAT } from '@/domain/phone/phoneChrome';

export function GoedkeuringActie({
  rijen,
  onBeslis,
  compact = false,
  touch = false,
}: {
  rijen: GoedkeuringsRij[];
  onBeslis: (rij: GoedkeuringsRij, akkoord: boolean) => void;
  compact?: boolean;
  touch?: boolean;
}) {
  if (rijen.length === 0) return null;
  return (
    <div
      className={compact && !touch ? 'flex flex-col gap-1.5' : 'mt-2 flex flex-col gap-2'}
      data-axe-goedkeuring
      data-touch={touch ? 'ja' : undefined}
    >
      {rijen.map((rij) => (
        <div key={rij.id}>
          {(rij.wat || rij.waarom) && (
            <p
              className="mb-1 whitespace-pre-wrap leading-snug"
              style={{ color: 'var(--text-primary)', fontSize: touch ? 12 : compact ? 10 : 11 }}
            >
              {rij.wat}
              {rij.waarom ? `\n${rij.waarom}` : ''}
            </p>
          )}
          <div className={touch ? 'flex gap-2' : 'flex gap-1.5'}>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onBeslis(rij, true); }}
              className={touch ? 'axe-ok-knop flex-1 rounded-lg px-3 text-[13px] font-medium' : 'rounded-lg px-2 py-1 text-[10px]'}
              style={{
                background: 'var(--tint)',
                color: 'var(--ok)',
                minHeight: touch ? PHONE_TIKMAAT : undefined,
              }}
            >
              Approve
            </button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onBeslis(rij, false); }}
              className={touch ? 'axe-ok-knop flex-1 rounded-lg px-3 text-[13px] font-medium' : 'rounded-lg px-2 py-1 text-[10px]'}
              style={{
                background: 'var(--tint-line)',
                color: 'var(--text-secondary)',
                minHeight: touch ? PHONE_TIKMAAT : undefined,
              }}
            >
              Decline
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
