import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyGeminiFailure } from './geminiFailure';
test('invalid keys and permissions are not quota or retryable', () => {
  for (const status of [400, 401, 403]) {
    const result = classifyGeminiFailure(new Error(`Gemini API error ${status}: secret-body`));
    assert.equal(result.code, 'GEMINI_KEY_REJECTED');
    assert.equal(result.retryable, false);
    assert.equal(JSON.stringify(result).includes('secret-body'), false);
  }
});
test('provider retry delay is respected', () => {
  const result = classifyGeminiFailure(new Error('Gemini API error 429: {"retryDelay":"42s"}'));
  assert.equal(result.code, 'GEMINI_RATE_LIMIT');
  assert.equal(result.retryAfter, 42);
});
test('configuration, model and transient failures are distinct', () => {
  assert.equal(classifyGeminiFailure(new Error('Gemini key vault is not configured')).code, 'GEMINI_CONFIGURATION');
  assert.equal(classifyGeminiFailure(new Error('Gemini API error 404')).code, 'GEMINI_MODEL_UNAVAILABLE');
  assert.equal(classifyGeminiFailure(new Error('Gemini API error 503')).retryable, true);
});
