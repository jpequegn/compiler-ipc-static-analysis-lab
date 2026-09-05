import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import ts from 'typescript';
import { createPatch } from 'diff';
import { moduleLiteral, createProjectProgram } from './analyze.js';
import { checkedPath, loadProject, LIMITS, type Project } from './project.js';
import { LabError, RuleSchema, type Rule } from './protocol.js';

type Change = {file: string; before: string; after: string; diff: string};
export type Preview = {approvalId: string; fingerprint: string; rule: Rule; changes: Change[]; status: 'awaiting-approval'};

export function preview(project: Project, inputRule: Rule): Preview {
  const rule = RuleSchema.parse(inputRule);
  if (rule.kind !== 'forbidden-import' || !rule.replacement || rule.module === rule.replacement) {
    throw new LabError('NO_FIX', 'Only an explicit import-module replacement can edit files');
  }
  const changes: Change[] = [];
  if (createProjectProgram(project).getSyntacticDiagnostics().length) throw new LabError('INVALID_SYNTAX', 'Fix syntax errors before preparing edits');
  let projectedBytes = 0;
  const {module: moduleName, replacement} = rule;
  for (const [file, before] of project.files) {
    const source = ts.createSourceFile(file, before, ts.ScriptTarget.Latest, true);
    const ranges: {start: number; end: number}[] = [];
    function visit(node: ts.Node) {
      const literal = moduleLiteral(node);
      if (literal && literal.text === moduleName) ranges.push({start: literal.getStart(source) + 1, end: literal.end - 1});
      ts.forEachChild(node, visit);
    }
    visit(source);
    let after = before;
    for (const range of ranges.sort((a, b) => b.start - a.start)) {
      after = after.slice(0, range.start) + replacement + after.slice(range.end);
    }
    projectedBytes += Buffer.byteLength(after);
    if (Buffer.byteLength(after) > LIMITS.fileBytes || projectedBytes > LIMITS.totalBytes) {
      throw new LabError('PROJECT_LIMIT', 'Replacement would exceed project size limits');
    }
    if (after !== before) changes.push({file, before, after, diff: createPatch(file, before, after, 'before', 'after')});
  }
  if (!changes.length) throw new LabError('NO_CHANGES', 'No matching import literals to replace');
  const approvalId = createHash('sha256').update(JSON.stringify({version: 1, root: project.root,
    fingerprint: project.fingerprint, rule, changes})).digest('hex');
  return {approvalId, fingerprint: project.fingerprint, rule, changes, status: 'awaiting-approval'};
}

export function applyPreview(project: Project, plan: Preview, approvalId: string) {
  if (approvalId !== plan.approvalId) throw new LabError('APPROVAL_REQUIRED', 'Approval does not match the reviewed preview');
  const current = loadProject(project.allowedRoot, project.relative);
  if (current.fingerprint !== plan.fingerprint) {
    throw new LabError('STALE_PREVIEW', 'Project or rule changed; review a new preview');
  }
  const verified = preview(current, plan.rule);
  if (verified.approvalId !== approvalId || !isDeepStrictEqual(verified, plan)) {
    throw new LabError('STALE_PREVIEW', 'Project or rule changed; review a new preview');
  }
  plan = verified;
  const staged: {target: string; next: string; backup: string; change: Change}[] = [];
  const applied: typeof staged = [];
  let recoveryFailed = false;
  try {
    // Stage both versions before touching a source. Renames are atomic per file.
    for (const change of plan.changes) {
      const target = checkedPath(current.root, change.file);
      const tag = `.compiler-lab-${randomUUID()}`;
      const next = path.join(path.dirname(target), tag + '.next');
      const backup = path.join(path.dirname(target), tag + '.backup');
      staged.push({target, next, backup, change});
      const mode = fs.statSync(target).mode;
      fs.writeFileSync(next, change.after, {flag: 'wx', mode});
      fs.writeFileSync(backup, change.before, {flag: 'wx', mode});
    }
    if (loadProject(project.allowedRoot, project.relative).fingerprint !== plan.fingerprint) {
      throw new LabError('STALE_PREVIEW', 'Project changed during staging');
    }
    for (const item of staged) {
      checkedPath(project.allowedRoot, project.relative);
      checkedPath(current.root, item.change.file);
      if (fs.readFileSync(item.target, 'utf8') !== item.change.before) throw new LabError('STALE_PREVIEW', 'Source changed during apply');
      fs.renameSync(item.next, item.target);
      applied.push(item);
    }
  } catch (error) {
    for (const item of applied.reverse()) {
      try {
        checkedPath(project.allowedRoot, project.relative);
        checkedPath(current.root, item.change.file);
        if (fs.readFileSync(item.target, 'utf8') !== item.change.after) throw new Error('Source changed during recovery');
        fs.renameSync(item.backup, item.target);
      } catch { recoveryFailed = true; }
    }
    if (recoveryFailed) throw new LabError('RECOVERY_REQUIRED', 'Apply recovery failed. Inspect .compiler-lab-*.backup files before further edits');
    throw error;
  } finally {
    if (!recoveryFailed) for (const item of staged) {
      for (const name of [item.next, item.backup]) if (fs.existsSync(name)) fs.unlinkSync(name);
    }
  }
  return {status: 'applied' as const, approvalId, files: plan.changes.map(c => c.file),
    beforeFingerprint: plan.fingerprint, afterFingerprint: loadProject(project.allowedRoot, project.relative).fingerprint};
}
