import { randomUUID } from 'node:crypto';
import { RequestSchema, LabError, type Request, type Response } from '../../core/src/protocol.js';
import { loadProject } from '../../core/src/project.js';
import { analyze } from '../../core/src/analyze.js';
import { proposeRule } from '../../core/src/prompts.js';
import { preview, applyPreview, type Preview } from '../../core/src/edits.js';

export class Dispatcher {
  private projects = new Map<string, string>();
  private previews = new Map<string, {projectId: string; plan: Preview}>();
  constructor(private root: string) {}
  handle(value: unknown): Response {
    const parsed = RequestSchema.safeParse(value);
    if (!parsed.success) {
      const id = value && typeof value === 'object' && 'id' in value && typeof value.id === 'string' && value.id.length > 0 && value.id.length <= 128 ? value.id : null;
      return {version: 1, id, ok: false, error: {code: 'INVALID_REQUEST', message: 'Request does not match protocol version 1'}};
    }
    const request = parsed.data;
    try {
      return {version: 1, id: request.id, ok: true, result: this.execute(request)};
    } catch (error) {
      return {version: 1, id: request.id, ok: false, error: error instanceof LabError ?
        {code: error.code, message: error.message} : {code: 'PROJECT_ERROR', message: 'Unable to read or analyze the synthetic project'}};
    }
  }
  private execute(request: Request): unknown {
    if (request.method === 'proposeRule') return proposeRule(request.params.prompt);
    if (request.method === 'openProject') {
      if (this.projects.size >= 16) throw new LabError('SESSION_LIMIT', 'Restart the service to release project sessions');
      const project = loadProject(this.root, request.params.path);
      const projectId = randomUUID();
      this.projects.set(projectId, request.params.path);
      return {projectId, files: [...project.files.keys()], fingerprint: project.fingerprint};
    }
    const relative = this.projects.get(request.params.projectId);
    if (relative === undefined) throw new LabError('UNKNOWN_PROJECT', 'Open the project in this service session first');
    const project = loadProject(this.root, relative);
    if (request.method === 'listFiles') return {files: [...project.files.keys()], fingerprint: project.fingerprint};
    if (request.method === 'getDiagnostics') return {...analyze(project, request.params.rules), fingerprint: project.fingerprint};
    if (request.params.mode === 'preview') {
      const plan = preview(project, request.params.rule);
      if (this.previews.size >= 32) this.previews.delete(this.previews.keys().next().value!);
      this.previews.set(plan.approvalId, {projectId: request.params.projectId, plan});
      return plan;
    }
    const saved = this.previews.get(request.params.approvalId);
    if (!saved || saved.projectId !== request.params.projectId || JSON.stringify(saved.plan.rule) !== JSON.stringify(request.params.rule)) {
      throw new LabError('APPROVAL_REQUIRED', 'Preview this exact rule and project before approving');
    }
    const result = applyPreview(project, saved.plan, request.params.approvalId);
    this.previews.delete(request.params.approvalId);
    return result;
  }
}
