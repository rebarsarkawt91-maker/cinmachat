import assert from 'node:assert/strict';
import test from 'node:test';
import { averageRgba, smoothRgb } from './colorMath';
test('averages opaque pixels', () => assert.deepEqual(averageRgba(new Uint8ClampedArray([255,0,0,255,0,0,255,255])), { r: 128, g: 0, b: 128 }));
test('smooths without jumping to the next sample', () => assert.deepEqual(smoothRgb({r:0,g:0,b:0},{r:100,g:50,b:0},0.2), {r:20,g:10,b:0}));
