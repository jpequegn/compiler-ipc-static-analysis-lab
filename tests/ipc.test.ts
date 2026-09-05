import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { Client } from '../packages/service/src/client.js';
import { Lines } from '../packages/service/src/framing.js';
import { fixture } from './helpers.js';

test('line framing handles fragmented/coalesced lines and recovers after overflow', () => {
  const lines: string[] = []; const errors: string[] = [];
  const decoder = new Lines(8, x => lines.push(x), x => errors.push(x));
  decoder.push('ab'); decoder.push('c\ndef\n'); decoder.push('x'.repeat(12)); decoder.push('\nokay\n');
  decoder.push('tail'); decoder.end();
  assert.deepEqual(lines, ['abc', 'def', 'okay']); assert.equal(errors.length, 2);
});
test('client opens, lists, proposes and analyzes with stable output after restart', async t => {
  const root = fixture(t, {'main.ts': 'eval("1");\n'});
  const results: unknown[] = [];
  for (let run = 0; run < 2; run++) {
    const client = new Client(root);
    try {
      const opened = await client.request('openProject', {path: '.'}) as {projectId: string};
      const listed = await client.request('listFiles', {projectId: opened.projectId}) as {files: string[]};
      assert.deepEqual(listed.files, ['main.ts']);
      const proposal = await client.request('proposeRule', {prompt: 'forbid eval calls'}) as {rule: {kind: 'forbidden-call'; callee: string}};
      results.push(await client.request('getDiagnostics', {projectId: opened.projectId, rules: [proposal.rule]}));
      await assert.rejects(client.request('listFiles', {projectId: 'missing'}), /Open the project/);
    } finally { await client.close(); }
  }
  assert.deepEqual(results[0], results[1]);
});
test('wire errors do not kill a service or contaminate stdout', async t => {
  const root = fixture(t);
  const child = spawn(process.execPath, ['dist/packages/service/src/server.js', '--root', root]);
  t.after(() => child.kill());
  let output = '';
  child.stdout.setEncoding('utf8'); child.stdout.on('data', chunk => output += chunk);
  const closed = new Promise(resolve => child.on('close', resolve));
  child.stdin.end('oops\n' + JSON.stringify({version: 9, id: 'v', method: 'openProject', params: {path: '.'}}) + '\n' + 'x'.repeat(70_000) + '\n' + JSON.stringify({version: 1, id: 'good', method: 'openProject', params: {path: '.'}}) + '\n');
  await closed;
  const responses = output.trim().split('\n').map(line => JSON.parse(line));
  assert.deepEqual(responses.slice(0, 3).map(r => r.error.code), ['INVALID_JSON', 'INVALID_REQUEST', 'FRAME_ERROR']);
  assert.equal(responses[3].ok, true);
});
test('client times out and rejects pending calls when service exits', async t => {
  const root = fixture(t);
  for (const [name, source, message] of [
    ['silent.js', 'setInterval(() => {}, 1000);', /timed out/],
    ['exit.js', 'process.exit(0);', /exited/],
    ['invalid.js', 'console.log("invalid");', /Invalid service/],
  ] as const) {
    const script = path.join(root, name); fs.writeFileSync(script, source);
    const client = new Client(root, name === 'silent.js' ? 100 : 2000, script);
    try { await assert.rejects(client.request('openProject', {path: '.'}), message); }
    finally { await client.close(); }
  }
});
