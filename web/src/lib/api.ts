import type { AttributeKey, Attack, Zone } from 'engine';
import type { BattleRow, FighterRow } from './database.types.ts';
import { callFunction } from './supabase.ts';
import type { LogEvent } from 'engine';

export const api = {
  createFighter: (name: string) =>
    callFunction<{ fighter: FighterRow }>('create-fighter', { name }),

  challenge: (opponent_id: string) =>
    callFunction<{ battle: BattleRow }>('challenge', { action: 'challenge', opponent_id }),

  accept: (battle_id: string) =>
    callFunction<{ battle: BattleRow }>('challenge', { action: 'accept', battle_id }),

  decline: (battle_id: string) =>
    callFunction<{ battle: null }>('challenge', { action: 'decline', battle_id }),

  submitRound: (battle_id: string, attacks: Attack[], blocks: Zone[]) =>
    callFunction<{ resolved: boolean; battle: BattleRow; events: LogEvent[] | null }>(
      'submit-round',
      { battle_id, attacks, blocks },
    ),

  buyAttribute: (attribute: AttributeKey) =>
    callFunction<{ fighter: FighterRow; spent: number; balance: number }>('power-up', {
      action: 'attribute',
      attribute,
    }),

  buyMove: (move_id: number) =>
    callFunction<{ fighter: FighterRow; spent: number; balance: number }>('power-up', {
      action: 'move',
      move_id,
    }),
};
