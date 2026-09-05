import { parseArgs } from 'node:util';
import { Dispatcher } from './dispatcher.js';
import { Lines, MAX_REQUEST_BYTES, MAX_RESPONSE_BYTES } from './framing.js';
import type { Response } from '../../core/src/protocol.js';

const {values} = parseArgs({options: {root: {type: 'string'}}, strict: true});
if (!values.root) throw new Error('--root is required');
const dispatcher = new Dispatcher(values.root);
function send(response: Response) {
  let data = JSON.stringify(response);
  if (Buffer.byteLength(data) > MAX_RESPONSE_BYTES) data = JSON.stringify({version: 1, id: response.id, ok: false,
    error: {code: 'RESPONSE_LIMIT', message: 'Narrow the project or rule set'}});
  process.stdout.write(data + '\n');
}
const lines = new Lines(MAX_REQUEST_BYTES, value => {
  let parsed: unknown;
  try { parsed = JSON.parse(value); } catch {
    send({version: 1, id: null, ok: false, error: {code: 'INVALID_JSON', message: 'Expected a JSON object'}}); return;
  }
  send(dispatcher.handle(parsed));
}, message => send({version: 1, id: null, ok: false, error: {code: 'FRAME_ERROR', message}}));
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => lines.push(chunk.toString()));
process.stdin.on('end', () => lines.end());
process.stdout.on('error', () => process.exit(1));
