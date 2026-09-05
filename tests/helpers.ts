import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { TestContext } from 'node:test';

export function fixture(t: TestContext, files: Record<string, string> = {'main.ts': 'export const n = 1;\n'}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'compiler-lab-'));
  t.after(() => fs.rmSync(root, {recursive: true, force: true}));
  fs.writeFileSync(path.join(root, 'compiler-lab.json'), '{"synthetic":true}');
  for (const [name, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, name)), {recursive: true});
    fs.writeFileSync(path.join(root, name), content);
  }
  return root;
}
