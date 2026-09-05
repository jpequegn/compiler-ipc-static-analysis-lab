import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PROTOCOL_VERSION } from '../packages/core/src/version.js';

test('protocol starts at version one', () => {
  assert.equal(PROTOCOL_VERSION, 1);
});
