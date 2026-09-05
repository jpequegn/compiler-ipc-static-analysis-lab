import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { LabError } from './protocol.js';

export type Project = {root: string; files: Map<string, string>; fingerprint: string};
export const LIMITS = {files: 100, fileBytes: 256 * 1024, totalBytes: 2 * 1024 * 1024, entries: 1000};

export function inside(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

export function checkedPath(root: string, relative: string): string {
  if (path.isAbsolute(relative)) throw new LabError('PATH_DENIED', 'Use a path relative to the configured root');
  const target = path.resolve(root, relative);
  if (!inside(root, target)) throw new LabError('PATH_DENIED', 'Path leaves the configured root');
  let cursor = root;
  for (const part of path.relative(root, target).split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, part);
    if (fs.lstatSync(cursor).isSymbolicLink()) throw new LabError('PATH_DENIED', 'Symlinks are not allowed');
  }
  if (!inside(root, fs.realpathSync(target))) throw new LabError('PATH_DENIED', 'Resolved path leaves the root');
  return target;
}

export function loadProject(allowedRoot: string, relative: string): Project {
  const base = fs.realpathSync(allowedRoot);
  const root = checkedPath(base, relative);
  if (!fs.statSync(root).isDirectory()) throw new LabError('INVALID_PROJECT', 'Project must be a directory');
  const marker = checkedPath(root, 'compiler-lab.json');
  if (fs.statSync(marker).size > 4096 || JSON.parse(fs.readFileSync(marker, 'utf8')).synthetic !== true) {
    throw new LabError('INVALID_PROJECT', 'Project requires compiler-lab.json with synthetic: true');
  }
  const files = new Map<string, string>();
  let total = 0;
  let entries = 0;
  function walk(dir: string) {
    for (const entry of fs.readdirSync(dir, {withFileTypes: true}).sort((a, b) => a.name.localeCompare(b.name))) {
      if (++entries > LIMITS.entries) throw new LabError('PROJECT_LIMIT', 'Too many directory entries');
      if (['node_modules', '.git', 'dist'].includes(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) throw new LabError('PATH_DENIED', 'Symlinks are not allowed');
      if (entry.isDirectory()) walk(full);
      else if (/\.tsx?$/.test(entry.name)) {
        if (!entry.isFile()) throw new LabError('PATH_DENIED', 'Sources must be regular files');
        const size = fs.statSync(full).size;
        total += size;
        if (size > LIMITS.fileBytes || total > LIMITS.totalBytes || files.size >= LIMITS.files) {
          throw new LabError('PROJECT_LIMIT', 'Synthetic project exceeds size limits');
        }
        files.set(path.relative(root, full).split(path.sep).join('/'), fs.readFileSync(full, 'utf8'));
      }
    }
  }
  walk(root);
  if (!files.size) throw new LabError('INVALID_PROJECT', 'Project contains no TypeScript files');
  const fingerprint = createHash('sha256').update(JSON.stringify([...files])).digest('hex');
  return {root, files, fingerprint};
}
