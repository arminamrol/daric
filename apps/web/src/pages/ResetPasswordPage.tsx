import { ApiError } from '@daric/api-client';
import { passwordSchema } from '@daric/core';
import type { PlainMessageKey } from '@daric/i18n';
import { useMutation } from '@tanstack/react-query';
import { useId, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useApi } from '../api/api';
import { alertClass, cardClass, inputClass, linkClass, submitClass } from '../auth/AuthForm';
import { useI18n } from '../i18n/locale';

function passwordError(password: string): PlainMessageKey | undefined {
  if (!password) return 'auth.error.passwordRequired';
  const issue = passwordSchema.safeParse(password).error?.issues[0];
  if (!issue) return undefined;
  return issue.code === 'too_big' ? 'auth.error.passwordTooLong' : 'auth.error.passwordTooShort';
}

/** Sets a new password with the token from a mailed reset link (`?token=`). */
export function ResetPasswordPage() {
  const { t } = useI18n();
  const api = useApi();
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const id = useId();
  const ids = {
    title: `${id}-title`,
    password: `${id}-password`,
    hint: `${id}-hint`,
    error: `${id}-error`,
  };
  const passwordRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<PlainMessageKey>();
  const reset = useMutation({
    mutationFn: (password: string) => api.resetPassword({ token, password }),
  });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const password = String(new FormData(event.currentTarget).get('password'));
    const found = passwordError(password);
    setError(found);
    if (found) return passwordRef.current?.focus();
    reset.mutate(password);
  }

  const linkInvalid = reset.error instanceof ApiError && reset.error.status === 400;

  return (
    <section className={cardClass}>
      <h1 id={ids.title} className="text-2xl font-bold">
        {t('auth.reset.title')}
      </h1>
      {reset.isSuccess ? (
        <>
          <p role="status">{t('auth.reset.done')}</p>
          <Link to="/login" className={linkClass}>
            {t('auth.reset.toLogin')}
          </Link>
        </>
      ) : (
        <form
          aria-labelledby={ids.title}
          noValidate
          onSubmit={onSubmit}
          className="flex flex-col gap-4"
        >
          <div className="flex flex-col gap-1">
            <label htmlFor={ids.password} className="font-medium">
              {t('auth.reset.password')}
            </label>
            <input
              ref={passwordRef}
              id={ids.password}
              name="password"
              type="password"
              dir="ltr"
              autoComplete="new-password"
              aria-invalid={error ? true : undefined}
              aria-describedby={[ids.hint, error && ids.error].filter(Boolean).join(' ')}
              className={inputClass}
            />
            <p id={ids.hint} className="text-sm text-foreground-muted">
              {t('auth.passwordHint')}
            </p>
            {error && (
              <p id={ids.error} className="text-sm text-danger">
                {t(error)}
              </p>
            )}
          </div>
          {reset.isError && (
            <div className="flex flex-col gap-2">
              <p role="alert" className={alertClass}>
                {t(
                  linkInvalid
                    ? 'auth.error.linkInvalid'
                    : reset.error instanceof ApiError && reset.error.status === 429
                      ? 'auth.error.tooManyAttempts'
                      : 'auth.error.unexpected',
                )}
              </p>
              {linkInvalid && (
                <Link to="/forgot-password" className={`text-sm ${linkClass}`}>
                  {t('auth.reset.requestAgain')}
                </Link>
              )}
            </div>
          )}
          <button type="submit" disabled={reset.isPending} className={submitClass}>
            {t('auth.reset.submit')}
          </button>
        </form>
      )}
    </section>
  );
}
