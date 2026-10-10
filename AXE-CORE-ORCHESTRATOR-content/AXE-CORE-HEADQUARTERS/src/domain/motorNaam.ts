/**
 * Hoe een abonnements-motor heet op het scherm: met het account waarop hij is ingelogd.
 *
 * "Claude 2", "Claude 3" en "Claude 4" zeggen niet welk abonnement erachter zit; je moest weten in welke
 * map welke login stond (Luka, 10 okt). De backend leest per motor het account uit (agent_runner.engine_status);
 * dit zet er een naam van. Zonder account blijft de vaste naam, en bij een bekende lege login staat dat erbij.
 */
export interface MotorStatus {
  account?: string | null;
  ingelogd?: boolean | null;
}

export function motorNaam(vasteNaam: string, status?: MotorStatus | null): string {
  if (status?.account) return `${vasteNaam.split(' ')[0]} · ${status.account}`;
  if (status?.ingelogd === false) return `${vasteNaam} (not logged in)`;
  return vasteNaam;
}
