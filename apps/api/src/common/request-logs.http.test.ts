import { Writable } from 'node:stream';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { call, registerUser, startTestApp, testPassword, type TestApp } from '../test/app';

// nestjs-pino keeps one root logger per process, so this file boots the only app that logs.
const lines: string[] = [];
let t: TestApp;
beforeAll(async () => {
  const logStream = new Writable({
    write(chunk, _encoding, done) {
      lines.push(String(chunk));
      done();
    },
  });
  t = await startTestApp({ env: { LOG_LEVEL: 'info' }, logStream });
});
afterAll(() => t.close());

describe('request logs', () => {
  it('never contain passwords or tokens', async () => {
    const { email, token } = await registerUser(t.url);
    const login = await call(t.url, 'POST', '/v1/auth/login', {
      body: { email, password: testPassword },
    });
    await call(t.url, 'GET', `/v1/me?token=${login.body.refreshToken}`, { token });

    // Request lines are written when the response finishes, just after the client has it.
    await vi.waitFor(() =>
      expect(lines.filter((l) => l.includes('"path":"/v1/me"'))).toHaveLength(2),
    );
    const out = lines.join('');
    expect(out).toContain('/v1/auth/login');
    for (const secret of [testPassword, token, login.body.accessToken, login.body.refreshToken]) {
      expect(out).not.toContain(secret);
    }
  });
});
