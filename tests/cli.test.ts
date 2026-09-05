import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fixture } from './helpers.js';
import { summarize } from '../packages/cli/src/benchmark.js';

function cli(...args: string[]) {
  return spawnSync(process.execPath, ['dist/packages/cli/src/main.js', ...args], {encoding: 'utf8', timeout: 30_000});
}
test('CLI lists prompts, explains findings and returns a scan failure code', () => {
  assert.equal(JSON.parse(cli('prompts', '--json').stdout).length, 5);
  const result = cli('scan', '--project', 'fixtures/demo', '--prompt', 'forbid eval calls', '--json');
  assert.equal(result.status, 1, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.compilerFacts[0].code, 'TS2322');
  assert.equal(report.ruleFindings[0].code, 'forbidden-call');
  assert.equal(report.approval.status, 'not-requested');
});
test('CLI requires a reviewed hash, then applies across invocations', t => {
  const source = "import {x} from 'legacy-api';\n";
  const root = fixture(t, {'main.ts': source});
  const args = ['--root', root, '--project', '.', '--prompt', 'replace imports from legacy-api with modern-api'];
  assert.equal(cli('apply', ...args).status, 2);
  const review = cli('preview', ...args, '--json'); assert.equal(review.status, 0, review.stderr);
  const plan = JSON.parse(review.stdout);
  assert.equal(fs.readFileSync(path.join(root, 'main.ts'), 'utf8'), source);
  assert.equal(cli('apply', ...args, '--approve', '0'.repeat(64)).status, 2);
  const result = cli('apply', ...args, '--approve', plan.approvalId);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).approval.status, 'applied');
  assert.match(fs.readFileSync(path.join(root, 'main.ts'), 'utf8'), /modern-api/);
});
test('CLI rejects unsupported inputs and reports clean scans as success', t => {
  const root = fixture(t);
  assert.equal(cli('scan', '--root', root, '--project', '.').status, 0);
  assert.equal(cli('scan', '--prompt', 'run shell commands').status, 2);
  assert.equal(cli('unknown').status, 2);
  assert.equal(cli('benchmark', '--iterations', 'NaN').status, 2);
});
test('benchmark checks equivalence and emits timing metadata', () => {
  const result = cli('benchmark', '--iterations', '3', '--json');
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.equivalenceVerified, true);
  assert.equal(report.inProcess.count, 3);
  assert.equal(report.ipc.samplesMs.length, 3);
  assert.ok(report.environment.typescript);
});
test('timing summaries reject invalid evidence and compute even medians', () => {
  assert.equal(summarize([1, 4, 2, 3]).medianMs, 2.5);
  assert.throws(() => summarize([NaN]), /Invalid/);
  assert.throws(() => summarize([]), /Invalid/);
});
