import { pino } from 'pino';
import { describe, expect, it } from 'vitest';
import { logCapture } from '../test/log-capture';
import { loggerOptions } from './logger';

function capture() {
  const { lines, stream } = logCapture();
  return { lines, logger: pino(loggerOptions('info'), stream) };
}

describe('logger', () => {
  it('censors amounts, notes, passwords and tokens at any depth', () => {
    const { lines, logger } = capture();
    logger.info(
      {
        transaction: { amount: '987654321', toAmount: '123456789', note: 'rent for flat 4' },
        body: { email: 'a@example.com', password: 'hunter2hunter2' },
        auth: { accessToken: 'eyJaccess', refreshToken: 'rt-secret', nested: [{ token: 'tok-1' }] },
        headers: { authorization: 'Bearer eyJh', cookie: 'sid=abc' },
      },
      'something happened',
    );

    const out = lines.join('');
    for (const secret of [
      '987654321',
      '123456789',
      'rent for flat 4',
      'hunter2hunter2',
      'eyJaccess',
      'rt-secret',
      'tok-1',
      'eyJh',
      'sid=abc',
    ]) {
      expect(out).not.toContain(secret);
    }
    expect(out).toContain('something happened');
    expect(out).toContain('a@example.com');
  });

  it('logs requests by method and path only, without headers or query strings', () => {
    const { lines, logger } = capture();
    logger.info({
      req: {
        id: 1,
        method: 'POST',
        url: '/v1/auth/verify?token=verify-secret',
        headers: { authorization: 'Bearer eyJh' },
      },
    });

    const out = lines.join('');
    expect(out).toContain('/v1/auth/verify');
    expect(out).not.toContain('verify-secret');
    expect(out).not.toContain('eyJh');
  });

  it('keeps query parameters and row values out of logged database errors', () => {
    const { lines, logger } = capture();
    const cause = Object.assign(new Error('duplicate key value violates unique constraint'), {
      code: '23505',
      detail: 'Key (token_hash)=(hash-of-secret) already exists.',
    });
    const error = Object.assign(
      new Error(
        'Failed query: insert into "refresh_tokens" values ($1, $2)\nparams: hash-of-secret,1299',
      ),
      {
        query: 'insert into "refresh_tokens" values ($1, $2)',
        params: ['hash-of-secret', '1299'],
        cause,
      },
    );
    logger.error({ err: error }, 'request failed');

    const out = lines.join('');
    expect(out).toContain('refresh_tokens');
    expect(out).toContain('23505');
    expect(out).not.toContain('hash-of-secret');
    expect(out).not.toContain('1299');
  });
});
