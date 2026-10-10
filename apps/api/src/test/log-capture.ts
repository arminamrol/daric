import { Writable } from 'node:stream';

/** A stream that keeps every log line written to it. */
export function logCapture() {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk, _encoding, done) {
      lines.push(String(chunk));
      done();
    },
  });
  return { lines, stream };
}
