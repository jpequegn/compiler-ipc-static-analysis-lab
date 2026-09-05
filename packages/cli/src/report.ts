import type { Analysis } from '../../core/src/protocol.js';
import type { Proposal } from '../../core/src/prompts.js';
import type { Preview } from '../../core/src/edits.js';
import type { BenchmarkReport } from './benchmark.js';

export type ScanReport = Analysis & {fingerprint: string; intent: Proposal; approval: {status: 'not-requested'}};
export function scanText(report: ScanReport): string {
  const lines = ['# Analysis report', '', `Intent: ${report.intent.prompt}`, `Generator: ${report.intent.generator}`,
    report.intent.explanation, `Project fingerprint: ${report.fingerprint}`, '', '## Compiler facts', ''];
  for (const [title, findings] of [['compiler', report.compilerFacts], ['rule', report.ruleFindings]] as const) {
    if (title === 'rule') lines.push('', '## Rule findings', '');
    if (!findings.length) lines.push('None.');
    for (const f of findings) lines.push(`- ${f.file}:${f.line}:${f.column} ${f.code}: ${f.message}`);
  }
  lines.push('', 'Approval: not requested. No files changed.');
  return lines.join('\n');
}
export function previewText(plan: Preview): string {
  return ['# Import replacement preview', '', ...plan.changes.map(c => c.diff),
    `Approval ID: ${plan.approvalId}`, 'Status: awaiting explicit approval. No files changed.'].join('\n');
}
export function benchmarkText(report: BenchmarkReport): string {
  return ['# IPC benchmark', '', `Node ${report.environment.node}; TypeScript ${report.environment.typescript}`,
    `${report.environment.platform}/${report.environment.arch}; ${report.environment.cpu}`,
    `Trials: ${report.workload.iterations}; warmups per mode: ${report.workload.warmupPerMode}`,
    `Startup and open: ${report.startupAndOpenMs.toFixed(2)} ms`, '',
    '| Mode | Median ms | p95 ms |', '| --- | ---: | ---: |',
    `| In process | ${report.inProcess.medianMs.toFixed(2)} | ${report.inProcess.p95Ms.toFixed(2)} |`,
    `| NDJSON service | ${report.ipc.medianMs.toFixed(2)} | ${report.ipc.p95Ms.toFixed(2)} |`, '',
    `Observed median delta: ${report.observedMedianDeltaMs.toFixed(2)} ms`,
    'Diagnostic equivalence: verified for every trial.', '', report.caveat].join('\n');
}
