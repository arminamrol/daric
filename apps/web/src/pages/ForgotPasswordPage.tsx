import { ApiError } from '@daric/api-client';
import { forgotPasswordInputSchema } from '@daric/core';
import type { PlainMessageKey } from '@daric/i18n';
import { useMutation } from '@tanstack/react-query';
import { useId, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router';
import { useApi } from '../api/api';
import { AuthOutcome, AuthPage, SubmitButton } from '../auth/AuthPage';
import { useI18n } from '../i18n/locale';
import { Button } from '../ui/Button';
import { Field, FieldError, FormMessage, Input, Label } from '../ui/Field';

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
    <AuthPage
      title={t('auth.forgot.title')}
      titleId={ids.title}
      description={send.isSuccess ? undefined : t('auth.forgot.intro')}
      footer={
        <Button asChild variant="link">
          <Link to="/login">{t('auth.forgot.toLogin')}</Link>
        </Button>
      }
    >
      {send.isSuccess ? (
        <AuthOutcome tone="done">
          <p>{t('auth.forgot.sent')}</p>
        </AuthOutcome>
      ) : (
        <form
          aria-labelledby={ids.title}
          noValidate
          onSubmit={onSubmit}
          className="flex flex-col gap-section"
        >
          <Field>
            <Label htmlFor={ids.email}>{t('auth.email')}</Label>
            <Input
              ref={emailRef}
              id={ids.email}
              name="email"
              type="email"
              dir="ltr"
              autoComplete="email"
              inputMode="email"
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? ids.error : undefined}
            />
            {error && <FieldError id={ids.error}>{t(error)}</FieldError>}
          </Field>
          {send.isError && (
            <FormMessage tone="alert">
              {t(
                send.error instanceof ApiError && send.error.status === 429
                  ? 'auth.error.tooManyAttempts'
                  : 'auth.error.unexpected',
              )}
            </FormMessage>
          )}
          <SubmitButton pending={send.isPending}>{t('auth.forgot.submit')}</SubmitButton>
        </form>
      )}
    </AuthPage>
  );
}
