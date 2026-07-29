/**
 * Original power-mindset one-liners in a confident trader/founder register.
 * These are NOT quotes from the Billions TV series (copyrighted dialogue).
 * Rotated by the Mindset button in the right panel + spoken via TTS.
 */
export const MINDSET_LINES: string[] = [
  "Winners don't wait for permission. They take the shot.",
  "Pressure is a privilege. Most people never get close enough to feel it.",
  "I don't hope. I position. Then I execute.",
  "Fear is just information. Use it. Don't wear it.",
  "If you're not early, you're not in the room that matters.",
  "Discipline beats motivation every single morning.",
  "The market doesn't care about your feelings. Neither do I.",
  "Stay calm. Stay sharp. Move first.",
  "Reputation is capital. Spend it carefully. Grow it aggressively.",
  "You don't rise by being liked. You rise by being right — and ready.",
  "When everyone freezes, that's your window.",
  "Build the edge. Protect the edge. Never explain the edge.",
  "Soft talk is for soft rooms. This isn't one.",
  "I play the long game with short, decisive moves.",
  "Doubt is expensive. Clarity is free if you earn it.",
  "Don't announce the plan. Ship the result.",
  "Control the controllable. Ignore the noise.",
  "Every setback is data. Extract it. Don't dramatize it.",
  "Loyalty is earned in the hard hours, not the easy wins.",
  "Be the person the room recalibrates around.",
  "Speed without judgment is chaos. Judgment without speed is loss.",
  "I don't need fair. I need prepared.",
  "Keep your circle small and your standards high.",
  "Today is another board. Play it like you already know the outcome.",
  "Complacency is the real competitor.",
  "Say less. Deliver more. Let the scoreboard talk.",
  "The best revenge is compound advantage.",
  "If it costs your focus, it's too expensive.",
  "Lead from the front. Bleed last. Win first.",
  "No excuses. No theater. Just the next correct move.",
  "Ambition without structure is a speech. Structure wins.",
  "I train for the moment before the moment arrives.",
  "Respect the risk. Dominate the setup.",
  "You are either building leverage or giving it away.",
  "Stay hungry. Stay dangerous. Stay kind to your own people.",
  "The loudest person in the room is rarely the one writing the check.",
  "Finish what you start. Start only what you'll finish.",
  "Power is quiet until it isn't.",
  "Make the hard choice early. Soft choices compound into failure.",
  "I don't chase validation. I chase asymmetric upside.",
];

const INDEX_KEY = 'axe_mindset_index';

/** Next line in rotation (persists across sessions). */
export function nextMindsetLine(): string {
  let i = 0;
  try {
    i = Number(localStorage.getItem(INDEX_KEY) ?? '0') || 0;
  } catch { /* ignore */ }
  const line = MINDSET_LINES[i % MINDSET_LINES.length]!;
  try {
    localStorage.setItem(INDEX_KEY, String((i + 1) % MINDSET_LINES.length));
  } catch { /* ignore */ }
  return line;
}
