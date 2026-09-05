export const MAX_REQUEST_BYTES = 64 * 1024;
export const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;

export class Lines {
  private pending = '';
  private discarding = false;
  constructor(private limit: number, private line: (value: string) => void, private error: (message: string) => void) {}
  push(chunk: string) {
    let start = 0;
    while (start < chunk.length) {
      const end = chunk.indexOf('\n', start);
      const piece = chunk.slice(start, end === -1 ? undefined : end);
      if (!this.discarding) {
        if (Buffer.byteLength(this.pending) + Buffer.byteLength(piece) > this.limit) {
          this.pending = ''; this.discarding = true; this.error('Frame exceeds byte limit');
        } else this.pending += piece;
      }
      if (end === -1) break;
      if (!this.discarding && this.pending.trim()) this.line(this.pending);
      this.pending = ''; this.discarding = false; start = end + 1;
    }
  }
  end() {
    if (this.pending || this.discarding) this.error('Truncated frame at end of stream');
    this.pending = ''; this.discarding = false;
  }
}
