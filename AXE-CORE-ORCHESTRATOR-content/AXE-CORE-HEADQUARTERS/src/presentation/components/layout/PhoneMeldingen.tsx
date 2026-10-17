/**
 * In-app lijst achter de bel op de A17. Dezelfde rijen als de desktop-bel:
 * core_notifications, plus pending approvals bovenaan.
 */
import { Bell, Check, Trash2, X } from 'lucide-react';
import { useNavigate } from 'react-router';
import { GoedkeuringActie } from '@/presentation/components/axe-core/GoedkeuringActie';
import { useServerAgents, verversServerAgents } from '@/presentation/components/axe-core/useServerAgents';
import { beslisAgentOk } from '@/application/approvals/beslisAgentOk';
import { rijenVanLijst } from '@/domain/agents/pendingApproval';
import { meaningOfNotification, notificationTarget } from '@/domain/notification';
import { meaningVar } from '@/domain/meaning';
import { useNotifications } from '@/presentation/contexts/NotificationContext';
import { PhoneBlad } from '@/presentation/components/layout/PhoneBlad';
import { PhoneKaart } from '@/presentation/pages/phone/phoneUi';

function klok(ts: number): string {
  const d = new Date(ts);
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

export function PhoneMeldingen({ onSluit }: { onSluit: () => void }) {
  const {
    notifications, unreadCount, loadError, markAsRead, markAllAsRead, removeNotification, clearAll,
  } = useNotifications();
  const navigate = useNavigate();
  const server = useServerAgents();
  const rijen = rijenVanLijst(server.approvals);

  return (
    <PhoneBlad titel="Notifications" onSluit={onSluit}>
      <div className="flex max-h-[70vh] min-h-0 flex-col" data-axe-phone-meldingen>
        <div className="mb-2 flex items-center justify-end gap-1">
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={markAllAsRead}
              className="axe-phone-tik"
              aria-label="Mark all as read"
              style={{ color: 'var(--text-muted)' }}
            >
              <Check size={14} />
            </button>
          )}
          {notifications.length > 0 && (
            <button
              type="button"
              onClick={clearAll}
              className="axe-phone-tik"
              aria-label="Clear all"
              style={{ color: 'var(--text-muted)' }}
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>

        {rijen.length > 0 && (
          <PhoneKaart kicker="Waiting on you">
            <GoedkeuringActie
              touch
              rijen={rijen}
              onBeslis={(rij, akkoord) => {
                void beslisAgentOk({
                  akkoord,
                  rij,
                  reden: akkoord ? 'Approved on phone.' : 'Declined on phone.',
                }).then(verversServerAgents);
              }}
            />
          </PhoneKaart>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto">
          {loadError ? (
            <div className="flex flex-col items-center justify-center gap-2 px-4 py-10 text-center">
              <Bell size={22} style={{ color: meaningVar('broken'), opacity: 0.5 }} />
              <span className="text-xs" style={{ color: meaningVar('broken') }}>Notifications could not be loaded</span>
              <span className="text-[10px] font-mono-data" style={{ color: 'var(--text-muted)' }}>{loadError}</span>
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-10">
              <Bell size={22} style={{ color: 'var(--text-muted)', opacity: 0.3 }} />
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>No notifications yet</span>
            </div>
          ) : (
            notifications.map((n) => (
              <div
                key={n.id}
                className="flex w-full items-start gap-2.5 border-t px-1 py-3 text-left"
                style={{
                  borderColor: 'rgba(255,255,255,.06)',
                  background: n.read ? 'transparent' : 'rgba(255,255,255,.02)',
                }}
                data-axe-melding-rij
              >
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-start gap-2.5 text-left"
                  onClick={() => {
                    markAsRead(n.id);
                    const doel = notificationTarget(n.message);
                    if (doel) {
                      onSluit();
                      navigate(doel.route);
                    }
                  }}
                >
                  <span
                    className="mt-1 size-2 shrink-0 rounded-full"
                    style={{ background: meaningVar(meaningOfNotification(n.type)) }}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-[13px] font-medium" style={{ color: 'var(--text-primary)' }}>{n.title}</span>
                      <span className="shrink-0 text-[10px]" style={{ color: 'var(--text-muted)' }}>{klok(n.timestamp)}</span>
                    </span>
                    {n.detail && (
                      <span className="mt-0.5 line-clamp-2 block text-[11px] leading-snug" style={{ color: 'var(--text-secondary)' }}>
                        {n.detail}
                      </span>
                    )}
                  </span>
                </button>
                <button
                  type="button"
                  className="p-1"
                  aria-label="Remove"
                  style={{ color: 'var(--text-muted)' }}
                  onClick={() => removeNotification(n.id)}
                >
                  <X size={12} />
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </PhoneBlad>
  );
}
