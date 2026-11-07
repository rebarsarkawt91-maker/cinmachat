import assert from 'node:assert/strict';
import test from 'node:test';
import { validateMovieEffects } from './effectsValidation';
test('validates and sorts effects', () => assert.deepEqual(validateMovieEffects([{t:8,d:1,type:'fight'},{t:2,d:2,type:'horror'}]).map((item) => item.t), [2,8]));
test('rejects unsafe effect payloads', () => { assert.throws(() => validateMovieEffects([{t:-1,d:1,type:'fight'}])); assert.throws(() => validateMovieEffects(Array.from({length:301},()=>({t:1,d:1,type:'fight'})))); });
