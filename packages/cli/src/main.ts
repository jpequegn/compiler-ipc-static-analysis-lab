import { parseArgs } from 'node:util';
import { Client } from '../../service/src/client.js';
import { PROMPTS, proposeRule, type Proposal } from '../../core/src/prompts.js';
import { type Analysis, LabError } from '../../core/src/protocol.js';
import type { Preview } from '../../core/src/edits.js';
import { benchmark } from './benchmark.js';
import { scanText, previewText, benchmarkText } from './report.js';

const help = `Compiler IPC static analysis lab

npm run lab -- prompts
npm run lab -- scan --project fixtures/demo --prompt "forbid eval calls"
npm run lab -- preview --project fixtures/demo --prompt "replace imports from legacy-api with modern-api"
npm run lab -- apply --project PATH --prompt "replace imports from legacy-api with modern-api" --approve HASH
npm run lab -- benchmark --project fixtures/demo --iterations 7

Options: --root DIR (default current directory), --project PATH (relative to root),
--prompt TEXT, --json, --iterations 3..30, --approve HASH, --help.
Exit codes: 0 success, 1 scan findings, 2 invalid input or operation failure.`;

async function main() {
  const {values, positionals} = parseArgs({allowPositionals: true, strict: true, options: {
    root: {type: 'string'}, project: {type: 'string'}, prompt: {type: 'string'},
    json: {type: 'boolean'}, help: {type: 'boolean'}, approve: {type: 'string'}, iterations: {type: 'string'},
  }});
  const command = positionals[0];
  if (values.help || !command) {console.log(help); return;}
  if (positionals.length !== 1 || !['prompts', 'scan', 'preview', 'apply', 'benchmark'].includes(command)) throw new Error('Unknown command. Use --help.');
  if (values.approve && command !== 'apply') throw new Error('--approve is only accepted by apply');
  if (values.iterations && command !== 'benchmark') throw new Error('--iterations is only accepted by benchmark');
  if (command === 'prompts') {console.log(values.json ? JSON.stringify(PROMPTS, null, 2) : PROMPTS.map(p => p.prompt).join('\n')); return;}
  const root = values.root ?? process.cwd(); const project = values.project ?? 'fixtures/demo';
  const prompt = values.prompt ?? 'forbid imports from legacy-api';
  if (command === 'benchmark') {
    const report = await benchmark(root, project, proposeRule(prompt).rule, values.iterations === undefined ? 7 : Number(values.iterations));
    console.log(values.json ? JSON.stringify(report, null, 2) : benchmarkText(report)); return;
  }
  if (command === 'apply' && !values.approve) throw new Error('Apply requires --approve with the hash from a reviewed preview');
  const client = new Client(root);
  try {
    const intent = await client.request('proposeRule', {prompt}) as Proposal;
    const {projectId} = await client.request('openProject', {path: project}) as {projectId: string};
    if (command === 'scan') {
      const analysis = await client.request('getDiagnostics', {projectId, rules: [intent.rule]}) as Analysis & {fingerprint: string};
      const report = {...analysis, intent, approval: {status: 'not-requested' as const}};
      console.log(values.json ? JSON.stringify(report, null, 2) : scanText(report));
      if (analysis.compilerFacts.length || analysis.ruleFindings.length) process.exitCode = 1;
    } else {
      const plan = await client.request('applyRule', {projectId, rule: intent.rule, mode: 'preview'}) as Preview;
      if (command === 'preview') console.log(values.json ? JSON.stringify({...plan, intent}, null, 2) : previewText(plan));
      else {
        if (values.approve !== plan.approvalId) throw new LabError('STALE_PREVIEW', 'Approval differs from current preview. Review a new preview before applying.');
        const result = await client.request('applyRule', {projectId, rule: intent.rule, mode: 'apply', approvalId: values.approve});
        console.log(JSON.stringify({intent, approval: result}, null, 2));
      }
    }
  } finally { await client.close(); }
}
main().catch(error => {
  console.error(`${error instanceof LabError ? error.code : 'ERROR'}: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 2;
});
