/**
 * Approve / Decline op de rijen van core_approvals. Zelfde knoppen overal:
 * desktop-Home, rail, bel, PWA en de 44px-strook op de A17.
 *
 * `chip`: één regel "needs your OK: …"; knoppen pas na een klik.
 * Telefoon en chatvensters blijven de volle wat+waarom-tekst.
 */
import { useState } from 'react';
import { okChipTekst, type GoedkeuringsRij } from '@/domain/agents/pendingApproval';
import { PHONE_TIKMAAT } from '@/domain/phone/phoneChrome';

export function GoedkeuringActie({
  rijen,
  onBeslis,
  compact = false,
  touch = false,
  chip = false,
}: {
  rijen: GoedkeuringsRij[];
  onBeslis: (rij: GoedkeuringsRij, akkoord: boolean) => void;
  compact?: boolean;
  touch?: boolean;
  chip?: boolean;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  if (rijen.length === 0) return null;
  const chipStand = chip && !touch;
  return (
    <div
      className={chipStand ? 'axe-ok-chip-lijst' : compact && !touch ? 'flex flex-col gap-1.5' : 'mt-2 flex flex-col gap-2'}
      data-axe-goedkeuring
      data-axe-ok-chip={chipStand ? 'ja' : undefined}
      data-touch={touch ? 'ja' : undefined}
    >
      {rijen.map((rij) => {
        if (chipStand) {
          const kort = okChipTekst(rij.wat);
          const open = openId === rij.id;
          return (
            <div key={rij.id} className="axe-ok-chip-rij" data-axe-ok-open={open ? 'ja' : undefined}>
              {open ? (
                <div className="axe-ok-chip-menu">
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onBeslis(rij, true); }}
                    className="axe-ok-chip-knop"
                    style={{ background: 'var(--tint)', color: 'var(--ok)' }}
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onBeslis(rij, false); }}
                    className="axe-ok-chip-knop"
                    style={{ background: 'var(--tint-line)', color: 'var(--text-secondary)' }}
                  >
                    Decline
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="axe-ok-chip"
                  onClick={(e) => { e.stopPropagation(); setOpenId(rij.id); }}
                  aria-expanded={false}
                  aria-label={`needs your OK: ${kort}`}
                >
                  needs your OK: {kort}
                </button>
              )}
            </div>
          );
        }
        return (
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
        );
      })}
    </div>
  );
}
