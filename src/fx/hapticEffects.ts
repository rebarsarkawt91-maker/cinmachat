import type { FxType, HapticStrength } from './fxSettings';

const PATTERNS: Record<FxType, number[]> = {
  fight: [60, 40, 60, 40, 120], horror: [80, 120, 80, 600], explosion: [220],
};
const SCALE: Record<HapticStrength, number> = { light: 0.6, medium: 1, strong: 1.4 };

export function hapticPattern(type: FxType, strength: HapticStrength): number[] {
  let remaining = 1500;
  return PATTERNS[type].map((value) => {
    const scaled = Math.max(1, Math.round(value * SCALE[strength]));
    const clamped = Math.min(remaining, scaled);
    remaining -= clamped;
    return clamped;
  }).filter((value) => value > 0);
}
export function triggerHaptic(type: FxType, strength: HapticStrength): boolean {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return false;
  return navigator.vibrate(hapticPattern(type, strength));
}

export function triggerPlayerShake(container: HTMLElement | null, reducedMotion: boolean) {
  if (!container || reducedMotion) return;
  container.classList.remove('cinemafx-shake');
  void container.offsetWidth;
  container.classList.add('cinemafx-shake');
  window.setTimeout(() => container.classList.remove('cinemafx-shake'), 400);
}
