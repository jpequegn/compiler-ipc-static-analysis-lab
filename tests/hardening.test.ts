import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { loadProject } from '../packages/core/src/project.js';
import { analyze } from '../packages/core/src/analyze.js';
import { preview, applyPreview } from '../packages/core/src/edits.js';
import { Client } from '../packages/service/src/client.js';
import { fixture } from './helpers.js';

test('version-one diagnostics match the golden fixture through IPC', async () => {
  const client = new Client(process.cwd());
  try {
    const {projectId} = await client.request('openProject', {path: 'fixtures/demo'}) as {projectId: string};
    const {compilerFacts, ruleFindings} = await client.request('getDiagnostics', {projectId,
      rules: [{kind: 'forbidden-import', module: 'legacy-api'}]}) as {compilerFacts: unknown; ruleFindings: unknown};
    assert.deepEqual({compilerFacts, ruleFindings}, JSON.parse(fs.readFileSync('tests/golden/demo.json', 'utf8')));
  } finally { await client.close(); }
});
test('compiler cannot read a referenced source outside the project', t => {
  const root = fixture(t, {'project/main.ts': '/// <reference path="../outside.ts" />\nexport {};',
    'project/compiler-lab.json': '{"synthetic":true}', 'outside.ts': 'const external: number = "private";'});
  const result = analyze(loadProject(root, 'project'));
  assert.ok(result.compilerFacts.some(f => f.code === 'TS6053'));
  assert.equal(result.compilerFacts.some(f => f.code === 'TS2322'), false);
});
test('invalid UTF-8 and malformed syntax cannot be rewritten', t => {
  const root = fixture(t, {'main.ts': "import 'old"});
  assert.throws(() => preview(loadProject(root, '.'), {kind: 'forbidden-import', module: 'old', replacement: 'new'}), /syntax errors/);
  fs.writeFileSync(path.join(root, 'main.ts'), Buffer.from([0xff]));
  assert.throws(() => loadProject(root, '.'), /UTF-8/);
});
test('replacement cannot expand the source beyond loader limits', t => {
  const root = fixture(t, {'main.ts': "import 'a';\n".repeat(1500)});
  assert.throws(() => preview(loadProject(root, '.'), {kind: 'forbidden-import', module: 'a', replacement: 'b'.repeat(200)}), /size limits/);
});
test('approval cannot be reused for another root or mutated plan', t => {
  const root = fixture(t, {'main.ts': "import 'a';"});
  const other = fixture(t, {'main.ts': "import 'a';"});
  const project = loadProject(root, '.');
  const plan = preview(project, {kind: 'forbidden-import', module: 'a', replacement: 'b'});
  assert.throws(() => applyPreview(loadProject(other, '.'), plan, plan.approvalId), /changed/);
  plan.changes[0]!.after = 'malicious unrelated edit';
  // Recompute from approved data rather than trusting a caller-mutated change list.
  assert.throws(() => applyPreview(project, plan, plan.approvalId));
});
test('client validates method-specific result bodies', async t => {
  const root = fixture(t);
  const script = path.join(root, 'wrong.js');
  fs.writeFileSync(script, `process.stdin.on('data', () => console.log(JSON.stringify({version:1,id:'1',ok:true,result:{projectId:3}})));`);
  const client = new Client(root, 2000, script);
  try { await assert.rejects(client.request('openProject', {path: '.'}), /Invalid service response/); }
  finally { await client.close(); }
});
test('client correlates simultaneous requests', async t => {
  const root = fixture(t); const client = new Client(root);
  try {
    const results = await Promise.all(['forbid eval calls', 'forbid console.log calls'].map(prompt => client.request('proposeRule', {prompt}))) as {rule: {callee: string}}[];
    assert.deepEqual(results.map(r => r.rule.callee), ['eval', 'console.log']);
  } finally { await client.close(); }
});
