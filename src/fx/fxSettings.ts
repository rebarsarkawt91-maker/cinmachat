import { useSyncExternalStore } from 'react';

export const FX_SETTINGS_VERSION = 1;
export const FX_STORAGE_KEY = 'cinemafx_settings_v1';

export type FxPreset = 'cinema' | 'horror' | 'light' | 'custom';
export type FxType = 'fight' | 'horror' | 'explosion';
export type GlowMode = 'follow' | 'poster' | 'custom';
export type FxSpeed = 'slow' | 'normal' | 'fast';
export type HapticStrength = 'light' | 'medium' | 'strong';

export interface FxSettings {
  version: 1;
  enabled: boolean;
  preset: FxPreset;
  glow: {
    enabled: boolean;
    mode: GlowMode;
    intensity: number;
    colors: string[];
    saturation: number;
    speed: FxSpeed;
  };
  haptics: {
    enabled: boolean;
    strength: HapticStrength;
    types: Record<FxType, boolean>;
    shake: boolean;
  };
  sound: {
    enabled: boolean;
    volume: number;
    types: { heartbeat: boolean; drone: boolean; whoosh: boolean; impact: boolean };
  };
  autoEffects: boolean;
}
const ALL_TYPES: Record<FxType, boolean> = { fight: true, horror: true, explosion: true };

export const DEFAULT_FX_SETTINGS: FxSettings = {
  version: 1,
  enabled: false,
  preset: 'cinema',
  glow: { enabled: true, mode: 'follow', intensity: 60, colors: ['#e50914', '#f59e0b'], saturation: 100, speed: 'normal' },
  haptics: { enabled: false, strength: 'medium', types: { ...ALL_TYPES }, shake: true },
  sound: { enabled: false, volume: 30, types: { heartbeat: true, drone: true, whoosh: true, impact: true } },
  autoEffects: true,
};

const HEX = /^#[0-9a-f]{6}$/i;
const clamp = (value: unknown, min: number, max: number, fallback: number) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
};
const bool = (value: unknown, fallback: boolean) => typeof value === 'boolean' ? value : fallback;
const oneOf = <T extends string>(value: unknown, values: readonly T[], fallback: T): T =>
  typeof value === 'string' && values.includes(value as T) ? value as T : fallback;

/** Validates persisted or migrated settings without trusting localStorage. */
export function validateFxSettings(input: unknown): FxSettings {
  const value = input && typeof input === 'object' ? input as Record<string, unknown> : {};
  const glow = value.glow && typeof value.glow === 'object' ? value.glow as Record<string, unknown> : {};
  const haptics = value.haptics && typeof value.haptics === 'object' ? value.haptics as Record<string, unknown> : {};
  const hapticTypes = haptics.types && typeof haptics.types === 'object' ? haptics.types as Record<string, unknown> : {};
  const sound = value.sound && typeof value.sound === 'object' ? value.sound as Record<string, unknown> : {};
  const soundTypes = sound.types && typeof sound.types === 'object' ? sound.types as Record<string, unknown> : {};
  const colors = Array.isArray(glow.colors) ? glow.colors.filter((color): color is string => typeof color === 'string' && HEX.test(color)).slice(0, 3) : [];
  return {
    version: FX_SETTINGS_VERSION,
    enabled: bool(value.enabled, false),
    preset: oneOf(value.preset, ['cinema', 'horror', 'light', 'custom'] as const, 'cinema'),
    glow: {
      enabled: bool(glow.enabled, true),
      mode: oneOf(glow.mode, ['follow', 'poster', 'custom'] as const, 'follow'),
      intensity: clamp(glow.intensity, 0, 100, 60),
      colors: colors.length ? colors : [...DEFAULT_FX_SETTINGS.glow.colors],
      saturation: clamp(glow.saturation, 50, 150, 100),
      speed: oneOf(glow.speed, ['slow', 'normal', 'fast'] as const, 'normal'),
    },
    haptics: {
      enabled: bool(haptics.enabled, false),
      strength: oneOf(haptics.strength, ['light', 'medium', 'strong'] as const, 'medium'),
      types: {
        fight: bool(hapticTypes.fight, true), horror: bool(hapticTypes.horror, true), explosion: bool(hapticTypes.explosion, true),
      },
      shake: bool(haptics.shake, true),
    },
    sound: {
      enabled: bool(sound.enabled, false),
      volume: clamp(sound.volume, 0, 100, 30),
      types: {
        heartbeat: bool(soundTypes.heartbeat, true), drone: bool(soundTypes.drone, true),
        whoosh: bool(soundTypes.whoosh, true), impact: bool(soundTypes.impact, true),
      },
    },
    autoEffects: bool(value.autoEffects, true),
  };
}

export function presetSettings(preset: Exclude<FxPreset, 'custom'>, enabled: boolean): FxSettings {
  const base = validateFxSettings({ ...DEFAULT_FX_SETTINGS, enabled, preset });
  if (preset === 'horror') return validateFxSettings({ ...base, glow: { ...base.glow, intensity: 70, colors: ['#7f0000', '#e50914'], mode: 'follow' }, haptics: { ...base.haptics, enabled: true, strength: 'medium' }, sound: { ...base.sound, enabled: true, volume: 25, types: { heartbeat: true, drone: true, whoosh: false, impact: false } } });
  if (preset === 'light') return validateFxSettings({ ...base, glow: { ...base.glow, intensity: 35 }, haptics: { ...base.haptics, enabled: false }, sound: { ...base.sound, enabled: false } });
  return base;
}

function readStored(): FxSettings {
  if (typeof window === 'undefined') return DEFAULT_FX_SETTINGS;
  try { return validateFxSettings(JSON.parse(window.localStorage.getItem(FX_STORAGE_KEY) || 'null')); }
  catch { return DEFAULT_FX_SETTINGS; }
}

let snapshot = readStored();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());
const persist = () => { try { window.localStorage.setItem(FX_STORAGE_KEY, JSON.stringify(snapshot)); } catch { /* storage can be unavailable */ } };

export function getFxSettings(): FxSettings { return snapshot; }
export function subscribeFxSettings(listener: () => void) { listeners.add(listener); return () => listeners.delete(listener); }
export function useFxSettings() { return useSyncExternalStore(subscribeFxSettings, getFxSettings, () => DEFAULT_FX_SETTINGS); }
export function setFxSettings(next: FxSettings | ((current: FxSettings) => FxSettings)) {
  snapshot = validateFxSettings(typeof next === 'function' ? next(snapshot) : next);
  persist(); emit();
}
export function updateFxSettings(updater: (current: FxSettings) => FxSettings) { setFxSettings(updater); }
export function applyFxPreset(preset: Exclude<FxPreset, 'custom'>) { setFxSettings(presetSettings(preset, snapshot.enabled)); }
export function resetFxSettings() { setFxSettings(DEFAULT_FX_SETTINGS); }

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key !== FX_STORAGE_KEY) return;
    snapshot = readStored(); emit();
  });
}
