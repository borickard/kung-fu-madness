import type { LogEvent } from 'engine';
import { ZONE_LABEL } from './format.ts';

export interface Names {
  a: string;
  b: string;
}

/**
 * Events are stored as data and rendered here, in the original's flat voice:
 * `Richard was High Punched for 57 points of damage`.
 */
export function renderEvent(event: LogEvent, names: Names): string {
  if (event.kind === 'end') {
    switch (event.outcome) {
      case 'knockout':
        return `${names[event.winner ?? 'a']} wins by knockout.`;
      case 'decision':
        return `The round cap is reached. ${names[event.winner ?? 'a']} takes the decision.`;
      case 'draw':
        return 'The battle is a draw. Nobody is paid.';
      default:
        return 'The battle ends.';
    }
  }

  const attacker = names[event.attacker];
  const defender = names[event.attacker === 'a' ? 'b' : 'a'];
  const zone = ZONE_LABEL[event.zone].toLowerCase();

  switch (event.kind) {
    case 'hit': {
      const crit = event.crit ? ', a clean one' : '';
      const blocked =
        event.guards === 0 ? '' : event.guards === 1 ? ', partly blocked' : ', well blocked';
      return `${defender} was ${movePast(event.move)} to the ${zone} for ${event.amount} points of damage${crit}${blocked}.`;
    }
    case 'miss':
      return `${attacker} threw a ${event.move} at the ${zone} and hit the air.`;
    case 'fizzle':
      return `${attacker} had nothing left for the ${event.move}.`;
    default:
      return '';
  }
}

export const PAST_TENSE: Record<string, string> = {
  Jab: 'Jabbed',
  'High Punch': 'High Punched',
  'Low Punch': 'Low Punched',
  'Front Kick': 'Front Kicked',
  Sweep: 'Swept',
  Elbow: 'Elbowed',
  Roundhouse: 'Roundhoused',
  'Flying Kick': 'Flying Kicked',
};

/** The past tense of a move name. The catalog is small; the rules are not. */
export function movePast(move: string): string {
  return PAST_TENSE[move] ?? (/e$/i.test(move) ? `${move}d` : `${move}ed`);
}
