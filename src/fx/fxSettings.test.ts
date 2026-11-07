import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_FX_SETTINGS, presetSettings, validateFxSettings } from './fxSettings';

test('invalid settings fall back to safe defaults and remain off', () => {
  const settings = validateFxSettings({ enabled: 'yes', glow: { intensity: 999, colors: ['bad'] } });
  assert.equal(settings.enabled, false); assert.equal(settings.glow.intensity, 100); assert.deepEqual(settings.glow.colors, DEFAULT_FX_SETTINGS.glow.colors);
});
test('legacy or partial data migrates to version one', () => {
  const settings = validateFxSettings({ enabled: true, glow: { intensity: 22 } });
  assert.equal(settings.version, 1); assert.equal(settings.enabled, true); assert.equal(settings.glow.intensity, 22); assert.equal(settings.autoEffects, true);
});
test('horror preset uses safe low sound volume', () => {
  const settings = presetSettings('horror', true); assert.equal(settings.sound.enabled, true); assert.equal(settings.sound.volume, 25); assert.equal(settings.glow.intensity, 70);
});
