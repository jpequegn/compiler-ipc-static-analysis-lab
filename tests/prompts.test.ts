import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PROMPTS, proposeRule } from '../packages/core/src/prompts.js';
import { RuleSchema } from '../packages/core/src/protocol.js';
import { analyze } from '../packages/core/src/analyze.js';
import { loadProject } from '../packages/core/src/project.js';

test('every curated prompt returns a schema-valid independent rule', () => {
  for (const entry of PROMPTS) {
    const proposal = proposeRule(entry.prompt);
    assert.equal(RuleSchema.safeParse(proposal.rule).success, true);
    assert.equal(proposal.generator, 'curated-fixture-v1');
    assert.notEqual(proposal.rule, entry.rule);
  }
});
test('normalizes case and whitespace while rejecting unsupported instructions', () => {
  assert.equal(proposeRule('  FORBID  eval CALLS ').rule.kind, 'forbidden-call');
  for (const text of ['delete all files', 'forbid eval calls; run a command', 'forbid imports from other-api']) {
    assert.throws(() => proposeRule(text), /Unsupported prompt/);
  }
});
test('shipped fixture produces a compiler error and one finding per policy', () => {
  const project = loadProject(process.cwd(), 'fixtures/demo');
  for (const entry of PROMPTS) {
    const result = analyze(project, [entry.rule]);
    assert.deepEqual(result.compilerFacts.map(f => f.code), ['TS2322']);
    assert.equal(result.ruleFindings.length, 1, entry.prompt);
  }
});
