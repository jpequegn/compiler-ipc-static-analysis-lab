import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { loadProject, LIMITS } from '../packages/core/src/project.js';
import { analyze } from '../packages/core/src/analyze.js';
import { fixture } from './helpers.js';

test('compiler facts include real type errors and stable spans', t => {
  const root = fixture(t, {'main.ts': 'const n: number = "bad";\n'});
  const project = loadProject(root, '.');
  const result = analyze(project);
  assert.equal(result.compilerFacts[0]?.code, 'TS2322');
  assert.equal(result.compilerFacts[0]?.line, 1);
  assert.deepEqual(result, analyze(project));
});
test('AST import policy covers module syntax and ignores strings/comments', t => {
  const root = fixture(t, {'main.ts': `import x from 'old';\nexport {x} from 'old';\nconst p = import('old');\nconst q = require('old');\nimport y = require('old');\n// import 'old'\nconst text = "import 'old'";\n`});
  const result = analyze(loadProject(root, '.'), [{kind: 'forbidden-import', module: 'old'}]);
  assert.deepEqual(result.ruleFindings.map(f => f.line), [1, 2, 3, 4, 5]);
  assert.equal(result.ruleFindings[0]?.column, 15);
});
test('await policy recognizes catch scope and rejects nested-function false protection', t => {
  const root = fixture(t, {'main.ts': `async function run() {
  await fetch('/a');
  try { await fetch('/b'); } catch {}
  try { const f = async () => { await fetch('/c'); }; } catch {}
  try {} catch { await fetch('/d'); }
  try {} finally { await fetch('/e'); }
}`});
  const result = analyze(loadProject(root, '.'), [{kind: 'require-try-catch', callee: 'fetch'}]);
  assert.deepEqual(result.ruleFindings.map(f => f.line), [2, 4, 5, 6]);
});
test('forbidden calls include property and literal element access', t => {
  const root = fixture(t, {'main.ts': `console.log('a'); console['log']('b'); // console.log('c')`});
  assert.equal(analyze(loadProject(root, '.'), [{kind: 'forbidden-call', callee: 'console.log'}]).ruleFindings.length, 2);
});
test('project boundary rejects traversal, symlinks and missing marker', t => {
  const root = fixture(t);
  assert.throws(() => loadProject(root, '..'), /leaves/);
  fs.symlinkSync('main.ts', path.join(root, 'linked.ts'));
  assert.throws(() => loadProject(root, '.'), /Symlinks/);
  fs.unlinkSync(path.join(root, 'linked.ts'));
  fs.unlinkSync(path.join(root, 'compiler-lab.json'));
  assert.throws(() => loadProject(root, '.'));
});
test('project boundary rejects oversized files', t => {
  const root = fixture(t, {'main.ts': ' '.repeat(LIMITS.fileBytes + 1)});
  assert.throws(() => loadProject(root, '.'), /size limits/);
});
