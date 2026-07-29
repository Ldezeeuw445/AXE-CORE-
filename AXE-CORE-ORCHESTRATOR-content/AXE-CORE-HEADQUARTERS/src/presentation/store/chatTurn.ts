/**
 * Monotonic chat-turn id. Each sendMessage() call begins a new turn;
 * late replies from an older turn are dropped so the composer can stay
 * live (user can interrupt mid-think / mid-speak without double answers).
 */
let activeTurn = 0;

export function beginChatTurn(): number {
  activeTurn += 1;
  return activeTurn;
}

export function isCurrentChatTurn(turnId: number): boolean {
  return turnId === activeTurn;
}
