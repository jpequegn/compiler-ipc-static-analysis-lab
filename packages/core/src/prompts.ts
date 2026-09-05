import { LabError, RuleSchema, type Rule } from './protocol.js';

export const PROMPTS: ReadonlyArray<{prompt: string; rule: Rule; explanation: string}> = [
  {prompt: 'forbid imports from legacy-api', rule: {kind: 'forbidden-import', module: 'legacy-api'},
    explanation: 'Find literal imports, exports, require calls and dynamic imports of legacy-api.'},
  {prompt: 'replace imports from legacy-api with modern-api',
    rule: {kind: 'forbidden-import', module: 'legacy-api', replacement: 'modern-api'},
    explanation: 'Propose changing only module string literals. API compatibility requires human review.'},
  {prompt: 'forbid eval calls', rule: {kind: 'forbidden-call', callee: 'eval'},
    explanation: 'Find syntactically named eval calls; aliases and indirect calls are outside this rule.'},
  {prompt: 'forbid console.log calls', rule: {kind: 'forbidden-call', callee: 'console.log'},
    explanation: 'Find console.log and console["log"] calls, including locally shadowed names.'},
  {prompt: 'require try catch around awaited fetch calls', rule: {kind: 'require-try-catch', callee: 'fetch'},
    explanation: 'Find directly awaited fetch calls without a try block and catch in the same function.'},
];

export function proposeRule(prompt: string) {
  const normalized = prompt.trim().toLowerCase().replace(/\s+/g, ' ');
  const entry = PROMPTS.find(item => item.prompt === normalized);
  if (!entry) throw new LabError('UNSUPPORTED_PROMPT', 'Unsupported prompt. Use the prompts command to list the catalogue.');
  return {generator: 'curated-fixture-v1' as const, prompt: entry.prompt,
    rule: RuleSchema.parse(entry.rule), explanation: entry.explanation};
}
export type Proposal = ReturnType<typeof proposeRule>;
