import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ResponseSchema, RequestSchema, validateResult, LabError, type Request } from '../../core/src/protocol.js';
import { Lines, MAX_REQUEST_BYTES, MAX_RESPONSE_BYTES } from './framing.js';

export class Client {
  private child: ChildProcessWithoutNullStreams;
  private pending = new Map<string, {request: Request; resolve: (result: unknown) => void; reject: (error: Error) => void; timer: NodeJS.Timeout}>();
  private sequence = 0;
  private stopped = false;
  private ended: Promise<void>;
  constructor(root: string, private timeoutMs = 10_000, servicePath = fileURLToPath(new URL('./server.js', import.meta.url))) {
    if (!Number.isFinite(timeoutMs) || timeoutMs < 1) throw new Error('Timeout must be positive');
    this.child = spawn(process.execPath, [servicePath, '--root', root], {stdio: 'pipe'});
    this.ended = new Promise(resolve => this.child.once('close', () => resolve()));
    const lines = new Lines(MAX_RESPONSE_BYTES, value => {
      try {
        const response = ResponseSchema.parse(JSON.parse(value));
        const entry = response.id ? this.pending.get(response.id) : undefined;
        if (!entry) throw new Error('Uncorrelated service response');
        const result = response.ok ? validateResult(entry.request, response.result) : undefined;
        this.pending.delete(response.id!); clearTimeout(entry.timer);
        if (response.ok) entry.resolve(result);
        else entry.reject(new LabError(response.error.code, response.error.message));
      } catch { this.fail(new LabError('PROTOCOL_ERROR', 'Invalid service response')); }
    }, message => this.fail(new LabError('PROTOCOL_ERROR', message)));
    this.child.stdout.setEncoding('utf8');
    this.child.stdout.on('data', chunk => lines.push(chunk));
    this.child.stdout.on('end', () => lines.end());
    this.child.stderr.resume();
    this.child.on('error', error => this.fail(error));
    this.child.on('close', () => this.fail(new LabError('SERVICE_CLOSED', 'Service process exited')));
    this.child.stdin.on('error', error => this.fail(error));
  }
  request<M extends Request['method']>(method: M, params: Extract<Request, {method: M}>['params']): Promise<unknown> {
    if (this.stopped) return Promise.reject(new LabError('SERVICE_CLOSED', 'Service is closed'));
    if (this.pending.size >= 32) return Promise.reject(new LabError('CLIENT_LIMIT', 'Too many pending requests'));
    const id = String(++this.sequence);
    const request = RequestSchema.parse({version: 1, id, method, params});
    const data = JSON.stringify(request) + '\n';
    if (Buffer.byteLength(data) > MAX_REQUEST_BYTES) return Promise.reject(new LabError('FRAME_ERROR', 'Request exceeds byte limit'));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => this.fail(new LabError('TIMEOUT', 'Service request timed out; start a new client')), this.timeoutMs);
      this.pending.set(id, {request, resolve, reject, timer});
      this.child.stdin.write(data);
    });
  }
  private fail(error: Error) {
    this.stopped = true;
    for (const entry of this.pending.values()) {clearTimeout(entry.timer); entry.reject(error);}
    this.pending.clear();
    if (this.child.exitCode === null) this.child.kill('SIGKILL');
  }
  async close() {
    this.fail(new LabError('SERVICE_CLOSED', 'Client closed'));
    await this.ended;
  }
}
