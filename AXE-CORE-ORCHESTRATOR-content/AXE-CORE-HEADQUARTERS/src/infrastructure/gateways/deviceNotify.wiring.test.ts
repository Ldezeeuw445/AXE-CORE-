import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(new URL('.', import.meta.url).pathname, '../../..');
const read = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf8');

describe('Android-poller via AXE Core API', () => {
  it('raakt Supabase-REST niet meer met de anon-sleutel', () => {
    const worker = read('docs/android/notify/NotifyPollWorker.kt');
    expect(worker).toContain('/device/notifications');
    expect(worker).not.toContain('rest/v1/core_notifications');
    expect(worker).not.toContain('anonKey');
    expect(worker).not.toContain('refreshToken');
    const push = read('docs/android/notify/AxePush.kt');
    expect(push).toContain('deviceToken');
    expect(push).toContain('.remove("anonKey")');
    expect(push).not.toContain('putString("anonKey"');
  });

  it('hangt /device/notifications in de API zonder AUTH-muur', () => {
    const main = read('backend/axe_api/main.py');
    expect(main).toContain('_device_notify_router(sb)');
    expect(main).toContain('AUTH hangt hier bewust niet op');
    const ctx = read('src/presentation/contexts/NotificationContext.tsx');
    expect(ctx).toContain('registreerDeviceNotifyToken');
    expect(ctx).not.toContain('supabasePubliek');
  });
});
