import type { FxType } from './fxSettings';

export interface MovieEffect { t: number; d: number; type: FxType }

export function effectKey(effect: MovieEffect, index: number) { return `${index}:${effect.t}:${effect.d}:${effect.type}`; }

/** Finds newly entered windows; a Set guarantees seeks never replay an already-fired window. */
export function collectEnteringEffects(effects: MovieEffect[], currentTime: number, fired: Set<string>): Array<{ effect: MovieEffect; key: string }> {
  const result: Array<{ effect: MovieEffect; key: string }> = [];
  effects.forEach((effect, index) => {
    const key = effectKey(effect, index);
    if (!fired.has(key) && currentTime >= effect.t && currentTime <= effect.t + effect.d) {
      fired.add(key); result.push({ effect, key });
    }
  });
  return result;
}
