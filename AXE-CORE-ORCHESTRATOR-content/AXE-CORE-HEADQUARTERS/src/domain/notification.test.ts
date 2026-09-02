import { describe, it, expect } from 'vitest';
import { notificationText, meaningOfNotification, collapseRepeats, notificationTarget } from './notification';

describe('notificationText', () => {
  it('reads the subject out of the message, so old rows get titles too', () => {
    // The 186 rows already in the table have no title column and never will
    // have one written retroactively. Every writer uses this shape.
    expect(notificationText("OpenAI (Primair) is niet meer bereikbaar: AXE's chat-provider viel weg"))
      .toEqual({ title: 'OpenAI (Primair) is niet meer bereikbaar', detail: "AXE's chat-provider viel weg" });
  });

  it('prefers a first line over a colon', () => {
    expect(notificationText('Daily Briefing\n\n**Opens** ...'))
      .toEqual({ title: 'Daily Briefing', detail: '**Opens** ...' });
  });

  it('ignores a colon that is just punctuation mid-sentence', () => {
    // A heading nobody can read is worse than no heading.
    const long = 'Er ging iets mis tijdens het ophalen van de historische deals voor dit account en dat was: vervelend';
    expect(notificationText(long)).toEqual({ title: long, detail: '' });
  });

  it('treats a message with no subject as all title', () => {
    expect(notificationText('Alles staat stil')).toEqual({ title: 'Alles staat stil', detail: '' });
  });

  it('says something rather than rendering an empty heading', () => {
    expect(notificationText('   ').title).toBe('Zonder tekst');
    expect(notificationText('').title).toBe('Zonder tekst');
  });

  it('does not treat a leading colon as a split', () => {
    expect(notificationText(': niets').title).toBe(': niets');
  });
});

describe('meaningOfNotification', () => {
  it('maps the four types onto the app vocabulary', () => {
    expect(meaningOfNotification('success')).toBe('happened');
    expect(meaningOfNotification('warning')).toBe('budget');
    expect(meaningOfNotification('error')).toBe('broken');
  });

  it('calls info structure, not idle', () => {
    // Someone chose to report it. Idle is for "nothing to say".
    expect(meaningOfNotification('info')).toBe('structure');
    expect(meaningOfNotification('whatever-the-vps-sent')).toBe('structure');
  });
});

describe('collapseRepeats', () => {
  const row = (message: string, timestamp: number) => ({ message, timestamp });

  it('turns 173 copies of one sentence into one line and a count', () => {
    // Measured: 173 of 186 rows are the same provider-dropout message.
    // Showing them as 173 buries the twelve that say something else.
    const items = Array.from({ length: 173 }, (_, i) => row('OpenAI weg: detail', 1000 + i));
    const out = collapseRepeats(items);
    expect(out).toHaveLength(1);
    expect(out[0].repeats).toBe(173);
  });

  it('keeps the newest occurrence, because that is the time that still matters', () => {
    const out = collapseRepeats([row('A: x', 100), row('A: x', 900), row('A: x', 500)]);
    expect(out[0].timestamp).toBe(900);
    expect(out[0].repeats).toBe(3);
  });

  it('does not merge different subjects', () => {
    const out = collapseRepeats([row('A: x', 1), row('B: y', 2)]);
    expect(out).toHaveLength(2);
    expect(out.map(o => o.repeats)).toEqual([1, 1]);
  });

  it('groups on the subject, not the whole message', () => {
    // Same problem, different detail, is still one problem.
    const out = collapseRepeats([row('OpenAI weg: om 12:30', 2), row('OpenAI weg: om 11:44', 1)]);
    expect(out).toHaveLength(1);
    expect(out[0].repeats).toBe(2);
  });

  it('returns newest first', () => {
    const out = collapseRepeats([row('A: x', 1), row('B: y', 3), row('C: z', 2)]);
    expect(out.map(o => o.timestamp)).toEqual([3, 2, 1]);
  });

  it('survives an empty list', () => {
    expect(collapseRepeats([])).toEqual([]);
  });
});

describe('notificationTarget', () => {
  it('sends the provider warnings to Settings, where the key is', () => {
    // 173 of the 186 stored rows. This one pattern earns most of the feature.
    const t = notificationTarget("OpenAI (Primair) is niet meer bereikbaar: AXE's chat-provider viel weg");
    expect(t).toEqual({ route: '/settings', why: 'de key of de limiet' });
  });

  it('sends account and order news to the trading desk', () => {
    expect(notificationTarget('MT5 100K DEMO: margin below floor')?.route).toBe('/trading');
    expect(notificationTarget('Trade geopend op XAUUSD: 0.4 lot')?.route).toBe('/trading');
  });

  it('matches on the subject, not on a word buried in the detail', () => {
    // A detail paragraph mentions half the app in passing. Matching on it
    // sends people somewhere the notification was never about.
    expect(notificationTarget('Daily Briefing: vandaag geen trades, geheugen bijgewerkt, cron liep')?.route)
      .not.toBe('/memory');
  });

  it('returns null rather than guessing', () => {
    // A link that lands on a plausible-looking page is worse than none: it
    // teaches people that clicking is a waste of time, and then they stop
    // clicking the good ones.
    expect(notificationTarget('Daily Briefing: None')).toBeNull();
    expect(notificationTarget('')).toBeNull();
  });
});
