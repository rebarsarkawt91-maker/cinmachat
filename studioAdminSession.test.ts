import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStudioAdminSessions } from './studioAdminSession';
test('admin login proof survives reload, rejects tampering, expires and revokes on password change/deletion', () => {
  let now = 1000;
  const sessions = createStudioAdminSessions('test-only-secret', () => now);
  const token = sessions.issue('staff', 'password-hash');
  assert.equal(sessions.verify(token, name => name === 'staff' ? 'password-hash' : null), 'staff');
  assert.equal(createStudioAdminSessions('test-only-secret', () => now).verify(token, () => 'password-hash'), 'staff');
  assert.equal(sessions.verify(token + 'x', () => 'password-hash'), null);
  assert.equal(sessions.verify(token, () => 'new-password-hash'), null);
  assert.equal(sessions.verify(token, () => null), null);
  assert.equal(sessions.verify('staff', () => 'password-hash'), null);
  now += 12 * 60 * 60_000;
  assert.equal(sessions.verify(token, () => 'password-hash'), null);
});
