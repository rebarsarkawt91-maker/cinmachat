import assert from 'node:assert/strict';
import test from 'node:test';
import { collectEnteringEffects } from './effectTimeline';
test('enters each effect window once, including after a forward seek', () => {
  const effects = [{t:5,d:2,type:'fight' as const},{t:20,d:3,type:'horror' as const}], fired = new Set<string>();
  assert.equal(collectEnteringEffects(effects,6,fired).length,1); assert.equal(collectEnteringEffects(effects,6.5,fired).length,0); assert.equal(collectEnteringEffects(effects,21,fired).length,1); assert.equal(collectEnteringEffects(effects,5.5,fired).length,0);
});
