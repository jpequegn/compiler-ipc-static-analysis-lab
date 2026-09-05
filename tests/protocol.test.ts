import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RequestSchema, RuleSchema, ResponseSchema } from '../packages/core/src/protocol.js';

const request = {version: 1, id: 'one', method: 'getDiagnostics', params: {projectId: 'p'}};
test('version one messages default to compiler-only diagnostics', () => {
  assert.deepEqual(RequestSchema.parse(request).params, {projectId: 'p', rules: []});
});
test('rejects incompatible versions, unknown methods and extra fields', () => {
  for (const change of [{version: 2}, {method: 'eval'}, {code: 'run()'}, {id: ''}]) {
    assert.equal(RequestSchema.safeParse({...request, ...change}).success, false);
  }
});
test('rules are data and reject arbitrary code or invalid names', () => {
  assert.equal(RuleSchema.safeParse({kind: 'forbidden-call', callee: 'eval'}).success, true);
  for (const rule of [{kind: 'script', code: 'x'}, {kind: 'forbidden-call', callee: 'foo()'},
    {kind: 'forbidden-import', module: 'x', code: 'x'}, {kind: 'forbidden-import', module: "x'"}]) {
    assert.equal(RuleSchema.safeParse(rule).success, false);
  }
});
test('apply requires an approval hash and preview cannot carry approval', () => {
  const base = {version: 1, id: 'a', method: 'applyRule'};
  const params = {projectId: 'p', rule: {kind: 'forbidden-import', module: 'old'}, mode: 'apply'};
  assert.equal(RequestSchema.safeParse({...base, params}).success, false);
  assert.equal(RequestSchema.safeParse({...base, params: {...params, approvalId: 'a'.repeat(64)}}).success, true);
  assert.equal(RequestSchema.safeParse({...base, params: {...params, mode: 'preview', approvalId: 'a'.repeat(64)}}).success, false);
});
test('responses carry structured protocol errors', () => {
  assert.equal(ResponseSchema.safeParse({version: 1, id: null, ok: false,
    error: {code: 'INVALID_REQUEST', message: 'Unsupported request'}}).success, true);
  assert.equal(ResponseSchema.safeParse({version: 2, id: 'a', ok: true, result: {}}).success, false);
});
