import { ApiError } from '@daric/api-client';
import { forgotPasswordInputSchema } from '@daric/core';
import type { PlainMessageKey } from '@daric/i18n';
import { useMutation } from '@tanstack/react-query';
import { useId, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router';
import { useApi } from '../api/api';
import { alertClass, cardClass, inputClass, linkClass, submitClass } from '../auth/AuthForm';
import { useI18n } from '../i18n/locale';

/**
 * Asks for a password-reset link. The answer reads the same whether or not the
 * email is registered, as the API's does.
 */
export function ForgotPasswordPage() {
  const { t } = useI18n();
  const api = useApi();
  const id = useId();
  const ids = { title: `${id}-title`, email: `${id}-email`, error: `${id}-error` };
  const emailRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<PlainMessageKey>();
  const send = useMutation({ mutationFn: (email: string) => api.forgotPassword(email) });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const raw = String(new FormData(event.currentTarget).get('email'));
    const parsed = forgotPasswordInputSchema.safeParse({ email: raw });
    const found: PlainMessageKey | undefined = !raw.trim()
      ? 'auth.error.emailRequired'
      : parsed.success
        ? undefined
        : 'auth.error.emailInvalid';
    setError(found);
    if (found || !parsed.success) return emailRef.current?.focus();
    send.mutate(parsed.data.email);
  }

  return (
    <section className={cardClass}>
      <h1 id={ids.title} className="text-2xl font-bold">
        {t('auth.forgot.title')}
      </h1>
      {send.isSuccess ? (
        <p role="status">{t('auth.forgot.sent')}</p>
      ) : (
        <form
          aria-labelledby={ids.title}
          noValidate
          onSubmit={onSubmit}
          className="flex flex-col gap-4"
        >
          <p className="text-foreground-muted">{t('auth.forgot.intro')}</p>
          <div className="flex flex-col gap-1">
            <label htmlFor={ids.email} className="font-medium">
              {t('auth.email')}
            </label>
            <input
              ref={emailRef}
              id={ids.email}
              name="email"
              type="email"
              dir="ltr"
              autoComplete="email"
              inputMode="email"
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? ids.error : undefined}
              className={inputClass}
            />
            {error && (
              <p id={ids.error} className="text-sm text-danger">
                {t(error)}
              </p>
            )}
          </div>
          {send.isError && (
            <p role="alert" className={alertClass}>
              {t(
                send.error instanceof ApiError && send.error.status === 429
                  ? 'auth.error.tooManyAttempts'
                  : 'auth.error.unexpected',
              )}
            </p>
          )}
          <button type="submit" disabled={send.isPending} className={submitClass}>
            {t('auth.forgot.submit')}
          </button>
        </form>
      )}
      <Link to="/login" className={`text-sm ${linkClass}`}>
        {t('auth.forgot.toLogin')}
      </Link>
    </section>
  );
}
