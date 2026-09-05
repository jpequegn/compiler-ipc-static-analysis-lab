import assert from 'node:assert/strict';
import os from 'node:os';
import ts from 'typescript';
import { performance } from 'node:perf_hooks';
import { analyze } from '../../core/src/analyze.js';
import { loadProject } from '../../core/src/project.js';
import { type Rule } from '../../core/src/protocol.js';
import { Client } from '../../service/src/client.js';

export function summarize(samples: number[]) {
  if (!samples.length || samples.some(n => !Number.isFinite(n) || n < 0)) throw new Error('Invalid timing samples');
  const sorted = [...samples].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const medianMs = sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
  return {samplesMs: samples, count: samples.length, minMs: sorted[0]!, medianMs,
    p95Ms: sorted[Math.ceil(sorted.length * .95) - 1]!, meanMs: samples.reduce((a, b) => a + b, 0) / samples.length};
}

export async function benchmark(root: string, relative: string, rule: Rule, iterations = 7) {
  if (!Number.isInteger(iterations) || iterations < 3 || iterations > 30) throw new Error('Iterations must be an integer from 3 to 30');
  const initial = loadProject(root, relative);
  const expected = {...analyze(initial, [rule]), fingerprint: initial.fingerprint};
  const started = performance.now();
  const client = new Client(root, 30_000);
  try {
    const {projectId} = await client.request('openProject', {path: relative}) as {projectId: string};
    const startupAndOpenMs = performance.now() - started;
    const direct: number[] = []; const ipc: number[] = [];
    for (let trial = -2; trial < iterations; trial++) {
      const modes = trial % 2 === 0 ? ['direct', 'ipc'] : ['ipc', 'direct'];
      for (const mode of modes) {
        const start = performance.now();
        let result: unknown;
        if (mode === 'direct') {
          const project = loadProject(root, relative);
          result = {...analyze(project, [rule]), fingerprint: project.fingerprint};
        } else result = await client.request('getDiagnostics', {projectId, rules: [rule]});
        const elapsed = performance.now() - start;
        assert.deepEqual(result, expected, 'Benchmark invalid: diagnostics or project contents differ');
        if (trial >= 0) (mode === 'direct' ? direct : ipc).push(elapsed);
      }
    }
    const inProcess = summarize(direct); const service = summarize(ipc);
    return {schemaVersion: 1, generatedAt: new Date().toISOString(),
      environment: {node: process.version, typescript: ts.version, platform: process.platform, arch: process.arch,
        cpu: os.cpus()[0]?.model ?? 'unknown', logicalCpus: os.cpus().length},
      workload: {files: initial.files.size, fingerprint: initial.fingerprint, rule, warmupPerMode: 2, iterations},
      equivalenceVerified: true, startupAndOpenMs, inProcess, ipc: service,
      observedMedianDeltaMs: service.medianMs - inProcess.medianMs,
      caveat: 'Both modes reload files and construct a compiler program. The observed delta includes serialization, scheduling, separate heaps and noise; it is not a pure transport overhead estimate. Startup is reported separately.'};
  } finally { await client.close(); }
}
export type BenchmarkReport = Awaited<ReturnType<typeof benchmark>>;
