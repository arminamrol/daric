import { desc, eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { auditLogs, emailTokens, users } from '../../db/schema';
import {
  browser,
  call,
  registerUser,
  startTestApp,
  testPassword,
  type TestApp,
} from '../../test/app';
import { testDatabase, uniqueEmail } from '../../test/db';

let t: TestApp;
const { db, pool } = testDatabase();
beforeAll(async () => {
  t = await startTestApp({ env: { APP_URL: 'https://daric.example/' } });
});
beforeEach(() => {
  t.mail.fail = false;
});
afterAll(async () => {
  await t.close();
  await pool.end();
});

const newPassword = 'a brand new passphrase';

async function emailVerified(token: string): Promise<boolean> {
  const me = await call(t.url, 'GET', '/v1/me', { token });
  return me.body.user.emailVerified;
}

function auditActions(userId: string) {
  return db
    .select({ action: auditLogs.action })
    .from(auditLogs)
    .where(eq(auditLogs.actorUserId, userId))
    .orderBy(desc(auditLogs.createdAt))
    .then((rows) => rows.map((r) => r.action));
}

/** Moves every email token of the User `ms` milliseconds into the past. */
async function ageTokens(userId: string, ms: number) {
  await db
    .update(emailTokens)
    .set({ expiresAt: sql`${emailTokens.expiresAt} - make_interval(secs => ${ms / 1000})` })
    .where(eq(emailTokens.userId, userId));
}

describe('email verification', () => {
  it('mails a Persian verification link to the web app on registration', async () => {
    const { email, token } = await registerUser(t.url);
    const mail = t.mail.last(email);
    expect(mail.subject).toBe('ایمیل خود را در دریک تأیید کنید');
    expect(mail.text).toMatch(/https:\/\/daric\.example\/verify-email\?token=[\w-]{43}/);
    expect(await emailVerified(token)).toBe(false);
  });

  it('verifies the email with the mailed token, once', async () => {
    const { email, token, userId } = await registerUser(t.url);
    const body = { token: t.mail.lastToken(email) };

    const res = await call(t.url, 'POST', '/v1/auth/email/verify', { body });
    expect(res.status).toBe(204);
    expect(await emailVerified(token)).toBe(true);
    expect(await auditActions(userId)).toContain('auth.email_verified');

    const again = await call(t.url, 'POST', '/v1/auth/email/verify', { body });
    expect(again.status).toBe(400);
  });

  it('works for the web app without a session, with the CSRF token', async () => {
    const { email, token } = await registerUser(t.url);
    const web = browser(t.url);
    await web.call('GET', '/v1/auth/csrf');
    const res = await web.call('POST', '/v1/auth/email/verify', {
      body: { token: t.mail.lastToken(email) },
    });
    expect(res.status).toBe(204);
    expect(await emailVerified(token)).toBe(true);
  });

  it('rejects an unknown, expired or reset-purpose token', async () => {
    const unknown = await call(t.url, 'POST', '/v1/auth/email/verify', {
      body: { token: 'not-a-real-token' },
    });
    expect(unknown.status).toBe(400);

    const expiring = await registerUser(t.url);
    await ageTokens(expiring.userId, 25 * 60 * 60 * 1000);
    const expired = await call(t.url, 'POST', '/v1/auth/email/verify', {
      body: { token: t.mail.lastToken(expiring.email) },
    });
    expect(expired.status).toBe(400);
    expect(await emailVerified(expiring.token)).toBe(false);

    const other = await registerUser(t.url);
    await call(t.url, 'POST', '/v1/auth/password/forgot', { body: { email: other.email } });
    const wrongPurpose = await call(t.url, 'POST', '/v1/auth/email/verify', {
      body: { token: t.mail.lastToken(other.email) },
    });
    expect(wrongPurpose.status).toBe(400);
  });

  it('resends the link to a signed-in User and voids the earlier one', async () => {
    const { email, token } = await registerUser(t.url);
    const first = t.mail.lastToken(email);

    const res = await call(t.url, 'POST', '/v1/auth/email/verification', { token });
    expect(res.status).toBe(204);
    const second = t.mail.lastToken(email);
    expect(second).not.toBe(first);

    const old = await call(t.url, 'POST', '/v1/auth/email/verify', { body: { token: first } });
    expect(old.status).toBe(400);
    const current = await call(t.url, 'POST', '/v1/auth/email/verify', {
      body: { token: second },
    });
    expect(current.status).toBe(204);
  });

  it('refuses to resend to a verified or signed-out User', async () => {
    const { email, token } = await registerUser(t.url);
    await call(t.url, 'POST', '/v1/auth/email/verify', {
      body: { token: t.mail.lastToken(email) },
    });
    const verified = await call(t.url, 'POST', '/v1/auth/email/verification', { token });
    expect(verified.status).toBe(409);

    const anonymous = await call(t.url, 'POST', '/v1/auth/email/verification');
    expect(anonymous.status).toBe(401);
  });

  it('voids the token once the User has a different email', async () => {
    const { email, token, userId } = await registerUser(t.url);
    await db.update(users).set({ email: uniqueEmail() }).where(eq(users.id, userId));
    const res = await call(t.url, 'POST', '/v1/auth/email/verify', {
      body: { token: t.mail.lastToken(email) },
    });
    expect(res.status).toBe(400);
    expect(await emailVerified(token)).toBe(false);
  });

  it('still registers the User when the mail server fails', async () => {
    t.mail.fail = true;
    const { token } = await registerUser(t.url);
    expect(await emailVerified(token)).toBe(false);
  });
});

describe('password reset', () => {
  async function forgot(email: string) {
    return call(t.url, 'POST', '/v1/auth/password/forgot', { body: { email } });
  }

  async function login(email: string, password: string) {
    return call(t.url, 'POST', '/v1/auth/login', { body: { email, password } });
  }

  it('mails a reset link and sets the new password with it, once', async () => {
    const { email, userId } = await registerUser(t.url);
    const res = await forgot(` ${email.toUpperCase()} `);
    expect(res.status).toBe(202);
    const mail = t.mail.last(email);
    expect(mail.subject).toBe('بازنشانی رمز عبور دریک');
    expect(mail.text).toMatch(/https:\/\/daric\.example\/reset-password\?token=/);

    const body = { token: t.mail.lastToken(email), password: newPassword };
    const reset = await call(t.url, 'POST', '/v1/auth/password/reset', { body });
    expect(reset.status).toBe(204);
    expect((await login(email, testPassword)).status).toBe(401);
    expect((await login(email, newPassword)).status).toBe(200);
    expect(await auditActions(userId)).toContain('auth.password_reset');

    const again = await call(t.url, 'POST', '/v1/auth/password/reset', {
      body: { ...body, password: 'yet another passphrase' },
    });
    expect(again.status).toBe(400);
  });

  it('lets only one of two concurrent resets with one token through', async () => {
    const { email } = await registerUser(t.url);
    await forgot(email);
    const token = t.mail.lastToken(email);
    const statuses = await Promise.all(
      ['first passphrase', 'second passphrase'].map((password) =>
        call(t.url, 'POST', '/v1/auth/password/reset', { body: { token, password } }).then(
          (r) => r.status,
        ),
      ),
    );
    expect(statuses.sort()).toEqual([204, 400]);
  });

  it('holds the hourly cap under concurrent requests', async () => {
    const { email } = await registerUser(t.url);
    await Promise.all(Array.from({ length: 6 }, () => forgot(email)));
    const resets = t.mail.to(email).filter((m) => m.subject === 'بازنشانی رمز عبور دریک');
    expect(resets).toHaveLength(3);
  });

  it('answers the same for an unknown email and sends nothing', async () => {
    const email = uniqueEmail();
    const res = await forgot(email);
    expect(res.status).toBe(202);
    expect(t.mail.to(email)).toEqual([]);
  });

  it('signs the User out everywhere and tells them the password changed', async () => {
    const reg = await call(t.url, 'POST', '/v1/auth/register', {
      body: { email: uniqueEmail(), password: testPassword },
    });
    const { email } = reg.body.user;
    await forgot(email);
    await call(t.url, 'POST', '/v1/auth/password/reset', {
      body: { token: t.mail.lastToken(email), password: newPassword },
    });

    const refresh = await call(t.url, 'POST', '/v1/auth/refresh', {
      body: { refreshToken: reg.body.refreshToken },
    });
    expect(refresh.status).toBe(401);
    const notice = t.mail.last(email);
    expect(notice.subject).toBe('رمز عبور دریک شما تغییر کرد');
    expect(notice.text).toContain('https://daric.example/forgot-password');
  });

  it('counts as verifying the email, since the User read the mail', async () => {
    const { email, token } = await registerUser(t.url);
    await forgot(email);
    await call(t.url, 'POST', '/v1/auth/password/reset', {
      body: { token: t.mail.lastToken(email), password: newPassword },
    });
    expect(await emailVerified(token)).toBe(true);
  });

  it('rejects an expired token, a verification token and a short password', async () => {
    const { email, userId } = await registerUser(t.url);
    const verification = t.mail.lastToken(email);
    const wrongPurpose = await call(t.url, 'POST', '/v1/auth/password/reset', {
      body: { token: verification, password: newPassword },
    });
    expect(wrongPurpose.status).toBe(400);

    await forgot(email);
    const token = t.mail.lastToken(email);
    const short = await call(t.url, 'POST', '/v1/auth/password/reset', {
      body: { token, password: 'short' },
    });
    expect(short.status).toBe(400);

    await ageTokens(userId, 61 * 60 * 1000);
    const expired = await call(t.url, 'POST', '/v1/auth/password/reset', {
      body: { token, password: newPassword },
    });
    expect(expired.status).toBe(400);
    expect((await login(email, testPassword)).status).toBe(200);
  });

  it('voids earlier reset links when a new one is sent', async () => {
    const { email } = await registerUser(t.url);
    await forgot(email);
    const first = t.mail.lastToken(email);
    await forgot(email);
    const res = await call(t.url, 'POST', '/v1/auth/password/reset', {
      body: { token: first, password: newPassword },
    });
    expect(res.status).toBe(400);
  });

  it('sends at most three reset mails an hour to one User, still answering 202', async () => {
    const { email } = await registerUser(t.url);
    for (let i = 0; i < 5; i++) expect((await forgot(email)).status).toBe(202);
    const resets = t.mail.to(email).filter((m) => m.subject === 'بازنشانی رمز عبور دریک');
    expect(resets).toHaveLength(3);
  });
});

describe('rate limits', () => {
  let limited: TestApp;
  beforeAll(async () => {
    limited = await startTestApp({ env: { MAIL_RATE_LIMIT_PER_HOUR: '2' } });
  });
  afterAll(() => limited.close());

  it('limits mail-sending requests per client per hour', async () => {
    const statuses = [];
    for (let i = 0; i < 3; i++) {
      const res = await call(limited.url, 'POST', '/v1/auth/password/forgot', {
        body: { email: uniqueEmail() },
      });
      statuses.push(res.status);
    }
    expect(statuses).toEqual([202, 202, 429]);
  });

  it('caps verification resends per User, separately from the client limit', async () => {
    const { token } = await registerUser(t.url);
    const statuses = [];
    for (let i = 0; i < 3; i++) {
      const res = await call(t.url, 'POST', '/v1/auth/email/verification', { token });
      statuses.push(res.status);
    }
    // Registration sent the first of the three allowed this hour.
    expect(statuses).toEqual([204, 204, 429]);
  });

  it('puts verify and reset under the login limit', async () => {
    const strict = await startTestApp({ env: { AUTH_RATE_LIMIT_PER_MINUTE: '2' } });
    try {
      const statuses = [];
      for (let i = 0; i < 3; i++) {
        const res = await call(strict.url, 'POST', '/v1/auth/email/verify', {
          body: { token: 'guess' },
        });
        statuses.push(res.status);
      }
      expect(statuses).toEqual([400, 400, 429]);
    } finally {
      await strict.close();
    }
  });
});
