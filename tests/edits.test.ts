import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { loadProject } from '../packages/core/src/project.js';
import { preview, applyPreview } from '../packages/core/src/edits.js';
import { Dispatcher } from '../packages/service/src/dispatcher.js';
import { fixture } from './helpers.js';

const rule = {kind: 'forbidden-import' as const, module: 'old', replacement: 'new'};
const source = `import x from 'old';\n// import 'old'\nconst s = "old";\n`;
test('preview binds exact project and edits only import literals after approval', t => {
  const root = fixture(t, {'main.ts': source});
  const project = loadProject(root, '.'); const plan = preview(project, rule);
  assert.match(plan.changes[0]!.diff, /\+import x from 'new'/);
  assert.equal(fs.readFileSync(path.join(root, 'main.ts'), 'utf8'), source);
  assert.throws(() => applyPreview(project, plan, '0'.repeat(64)), /Approval/);
  const result = applyPreview(project, plan, plan.approvalId);
  assert.equal(result.status, 'applied');
  assert.equal(fs.readFileSync(path.join(root, 'main.ts'), 'utf8'), source.replace("from 'old'", "from 'new'"));
  assert.throws(() => applyPreview(project, plan, plan.approvalId), /changed/);
});
test('approval becomes stale when any source changes, including unrelated files', t => {
  const root = fixture(t, {'main.ts': source, 'other.ts': 'export {};'});
  const project = loadProject(root, '.'); const plan = preview(project, rule);
  fs.appendFileSync(path.join(root, 'other.ts'), '\n');
  assert.throws(() => applyPreview(project, plan, plan.approvalId), /changed/);
  assert.equal(fs.readFileSync(path.join(root, 'main.ts'), 'utf8'), source);
});
test('rejects symlinks introduced after preview and diagnostic-only rules', t => {
  const root = fixture(t, {'main.ts': source});
  const project = loadProject(root, '.'); const plan = preview(project, rule);
  assert.throws(() => preview(project, {kind: 'forbidden-call', callee: 'eval'}), /explicit import/);
  fs.renameSync(path.join(root, 'main.ts'), path.join(root, 'target.ts'));
  fs.symlinkSync('target.ts', path.join(root, 'main.ts'));
  assert.throws(() => applyPreview(project, plan, plan.approvalId), /Symlinks/);
});
test('dispatcher requires a preview in the session and consumes approval', t => {
  const root = fixture(t, {'main.ts': source}); const server = new Dispatcher(root);
  const opened = server.handle({version: 1, id: '1', method: 'openProject', params: {path: '.'}});
  assert.equal(opened.ok, true); if (!opened.ok) return;
  const projectId = (opened.result as {projectId: string}).projectId;
  const request = {version: 1, id: '2', method: 'applyRule', params: {projectId, rule, mode: 'apply', approvalId: 'a'.repeat(64)}};
  assert.equal(server.handle(request).ok, false);
  const proposed = server.handle({...request, params: {projectId, rule, mode: 'preview'}});
  assert.equal(proposed.ok, true); if (!proposed.ok) return;
  request.params.approvalId = (proposed.result as {approvalId: string}).approvalId;
  assert.equal(server.handle(request).ok, true);
  assert.equal(server.handle(request).ok, false);
});
test('rolls back earlier files when a later rename fails', t => {
  const root = fixture(t, {'a.ts': source, 'b.ts': source});
  const project = loadProject(root, '.'); const plan = preview(project, rule);
  const original = fs.renameSync;
  t.mock.method(fs, 'renameSync', (from: fs.PathLike, to: fs.PathLike) => {
    if (String(from).endsWith('.next') && String(to).endsWith('b.ts')) throw new Error('simulated disk failure');
    return original(from, to);
  });
  assert.throws(() => applyPreview(project, plan, plan.approvalId), /simulated/);
  assert.equal(fs.readFileSync(path.join(root, 'a.ts'), 'utf8'), source);
  assert.equal(fs.readFileSync(path.join(root, 'b.ts'), 'utf8'), source);
  assert.equal(fs.readdirSync(root).some(name => name.startsWith('.compiler-lab')), false);
});
