import { BELTS, beltName, type Zone } from 'engine';

export const ZONE_LABEL: Record<Zone, string> = {
  HIGH: 'High',
  MID: 'Mid',
  LOW: 'Low',
};

/** Tolerates a zone from an older round log without taking the page down. */
export function zoneLabel(zone: string): string {
  return ZONE_LABEL[zone as Zone] ?? zone.toLowerCase().replace('_', ' ');
}

export const BELT_NAMES: string[] = BELTS.map((belt) => belt.name);

export function belt(index: number): string {
  return beltName(index);
}

export function record(fighter: { wins: number; losses: number; draws: number }): string {
  return `${fighter.wins}-${fighter.losses}-${fighter.draws}`;
}

export function percent(value: number, of: number): number {
  if (of <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((value / of) * 100)));
}

/** "4h 12m", "8m", "overdue". Deadlines are the only clock the game keeps. */
export function timeLeft(deadline: string | null, now: number = Date.now()): string {
  if (!deadline) return '—';
  const ms = new Date(deadline).getTime() - now;
  if (ms <= 0) return 'overdue';
  const minutes = Math.floor(ms / 60_000);
  const hours = Math.floor(minutes / 60);
  if (hours >= 24) return `${Math.floor(hours / 24)}d ${hours % 24}h`;
  if (hours >= 1) return `${hours}h ${minutes % 60}m`;
  return `${minutes}m`;
}

export function outcomeLine(
  outcome: string | null,
  winnerName: string | null,
): string {
  switch (outcome) {
    case 'knockout':
      return winnerName ? `${winnerName} wins by knockout` : 'Knockout';
    case 'decision':
      return winnerName ? `${winnerName} wins on the judges' cards` : 'Decision';
    case 'walkover':
      return winnerName ? `${winnerName} wins by walkover` : 'Both fighters failed to show';
    case 'draw':
      return 'A draw, which pays nothing';
    default:
      return 'In progress';
  }
}
