/**
 * Approve / Decline op de rijen van core_approvals. Zelfde knoppen overal.
 */
import type { GoedkeuringsRij } from '@/domain/agents/pendingApproval';

export function GoedkeuringActie({
  rijen,
  onBeslis,
  compact = false,
}: {
  rijen: GoedkeuringsRij[];
  onBeslis: (rij: GoedkeuringsRij, akkoord: boolean) => void;
  compact?: boolean;
}) {
  if (rijen.length === 0) return null;
  return (
    <div className={compact ? 'flex flex-col gap-1.5' : 'mt-2 flex flex-col gap-2'} data-axe-goedkeuring>
      {rijen.map((rij) => (
        <div key={rij.id}>
          {(rij.wat || rij.waarom) && (
            <p
              className="mb-1 whitespace-pre-wrap leading-snug"
              style={{ color: 'var(--text-primary)', fontSize: compact ? 10 : 11 }}
            >
              {rij.wat}
              {rij.waarom ? `\n${rij.waarom}` : ''}
            </p>
          )}
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onBeslis(rij, true); }}
              className="rounded-lg px-2 py-1 text-[10px]"
              style={{ background: 'var(--tint)', color: 'var(--ok)' }}
            >
              Approve
            </button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onBeslis(rij, false); }}
              className="rounded-lg px-2 py-1 text-[10px]"
              style={{ background: 'var(--tint-line)', color: 'var(--text-secondary)' }}
            >
              Decline
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
