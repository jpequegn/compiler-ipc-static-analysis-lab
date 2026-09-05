import { randomUUID } from 'node:crypto';
import { RequestSchema, LabError, type Request, type Response } from '../../core/src/protocol.js';
import { loadProject } from '../../core/src/project.js';
import { analyze } from '../../core/src/analyze.js';
import { proposeRule } from '../../core/src/prompts.js';

export class Dispatcher {
  private projects = new Map<string, string>();
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
    throw new LabError('NOT_IMPLEMENTED', 'Approved edit support is not installed yet');
  }
}
