import { z } from 'zod';
import { PROTOCOL_VERSION } from './version.js';

const label = z.string().min(1).max(128);
const moduleName = z.string().min(1).max(200).regex(/^[a-zA-Z0-9@_./-]+$/);
const callName = z.string().min(1).max(128).regex(/^[a-zA-Z_$][\w$]*(\.[a-zA-Z_$][\w$]*)*$/);
export const RuleSchema = z.discriminatedUnion('kind', [
  z.object({kind: z.literal('forbidden-import'), module: moduleName,
    replacement: moduleName.optional()}).strict(),
  z.object({kind: z.literal('forbidden-call'), callee: callName}).strict(),
  z.object({kind: z.literal('require-try-catch'), callee: callName}).strict(),
]);
export type Rule = z.infer<typeof RuleSchema>;
const envelope = {version: z.literal(PROTOCOL_VERSION), id: label};
const session = {projectId: label};
const ApplyParams = z.discriminatedUnion('mode', [
  z.object({...session, rule: RuleSchema, mode: z.literal('preview')}).strict(),
  z.object({...session, rule: RuleSchema, mode: z.literal('apply'),
    approvalId: z.string().regex(/^[a-f0-9]{64}$/)}).strict(),
]);
export const RequestSchema = z.discriminatedUnion('method', [
  z.object({...envelope, method: z.literal('openProject'),
    params: z.object({path: z.string().min(1).max(1024)}).strict()}).strict(),
  z.object({...envelope, method: z.literal('listFiles'), params: z.object(session).strict()}).strict(),
  z.object({...envelope, method: z.literal('getDiagnostics'),
    params: z.object({...session, rules: z.array(RuleSchema).max(20).default([])}).strict()}).strict(),
  z.object({...envelope, method: z.literal('proposeRule'),
    params: z.object({prompt: z.string().min(1).max(1000)}).strict()}).strict(),
  z.object({...envelope, method: z.literal('applyRule'), params: ApplyParams}).strict(),
]);
export type Request = z.infer<typeof RequestSchema>;
export const ResponseSchema = z.discriminatedUnion('ok', [
  z.object({version: z.literal(PROTOCOL_VERSION), id: label, ok: z.literal(true),
    result: z.unknown()}).strict(),
  z.object({version: z.literal(PROTOCOL_VERSION), id: label.nullable(), ok: z.literal(false),
    error: z.object({code: label, message: z.string()}).strict()}).strict(),
]);
export type Response = z.infer<typeof ResponseSchema>;
export class LabError extends Error {
  constructor(public readonly code: string, message: string) { super(message); }
}

export type Finding = {
  source: 'compiler' | 'rule'; code: string; message: string;
  file: string; start: number; length: number; line: number; column: number;
};
export type Analysis = {compilerFacts: Finding[]; ruleFindings: Finding[]};
