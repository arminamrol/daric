import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { call, registerUser, startTestApp, testPassword, type TestApp } from '../test/app';
import { logCapture } from '../test/log-capture';

// nestjs-pino keeps one root logger per process, so this file boots the only app that logs.
const { lines, stream } = logCapture();
let t: TestApp;
beforeAll(async () => {
  t = await startTestApp({ env: { LOG_LEVEL: 'info' }, logStream: stream });
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

  it('never contain Transaction notes or Amounts', async () => {
    const { token, workspaceId } = await registerUser(t.url);
    const base = `/v1/workspaces/${workspaceId}`;
    const account = await call(t.url, 'POST', `${base}/accounts`, {
      token,
      body: { name: 'Melli', type: 'BANK', class: 'ASSET', currency: 'IRR', openingBalance: '0' },
    });
    const category = await call(t.url, 'POST', `${base}/categories`, {
      token,
      body: { kind: 'EXPENSE', name: 'Health', icon: 'pill', color: 'red' },
    });
    const note = 'psychiatrist-visit-7d1f';
    const transaction = {
      type: 'EXPENSE',
      accountId: account.body.id,
      categoryId: category.body.id,
      amount: '987654321',
      occurredOn: '2026-10-10',
      note,
    };
    expect(
      (await call(t.url, 'POST', `${base}/transactions`, { token, body: transaction })).status,
    ).toBe(201);
    // Refused requests too: an invalid day, and a Category that does not exist.
    await call(t.url, 'POST', `${base}/transactions`, {
      token,
      body: { ...transaction, occurredOn: 'yesterday' },
    });
    await call(t.url, 'POST', `${base}/transactions`, {
      token,
      body: { ...transaction, categoryId: account.body.id },
    });

    await vi.waitFor(() =>
      expect(lines.filter((l) => l.includes(`"path":"${base}/transactions"`))).toHaveLength(3),
    );
    const out = lines.join('');
    expect(out).not.toContain(note);
    expect(out).not.toContain('987654321');
  });
});
