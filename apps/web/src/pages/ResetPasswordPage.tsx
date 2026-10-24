import { ApiError } from '@daric/api-client';
import { passwordSchema } from '@daric/core';
import type { PlainMessageKey } from '@daric/i18n';
import { useMutation } from '@tanstack/react-query';
import { useId, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link } from 'react-router';
import { useApi } from '../api/api';
import { AuthOutcome, AuthPage, SubmitButton } from '../auth/AuthPage';
import { useLinkToken } from '../auth/linkToken';
import { useI18n } from '../i18n/locale';
import { Button } from '../ui/Button';
import { Field, FieldDescription, FieldError, FormMessage, Input, Label } from '../ui/Field';

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
  const token = useLinkToken();
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
    <AuthPage title={t('auth.reset.title')} titleId={ids.title}>
      {reset.isSuccess ? (
        <>
          <AuthOutcome tone="done">
            <p>{t('auth.reset.done')}</p>
          </AuthOutcome>
          <Button asChild className="w-full">
            <Link to="/login">{t('auth.reset.toLogin')}</Link>
          </Button>
        </>
      ) : (
        <form
          aria-labelledby={ids.title}
          noValidate
          onSubmit={onSubmit}
          className="flex flex-col gap-section"
        >
          <Field>
            <Label htmlFor={ids.password}>{t('auth.reset.password')}</Label>
            <Input
              ref={passwordRef}
              id={ids.password}
              name="password"
              type="password"
              dir="ltr"
              autoComplete="new-password"
              aria-invalid={error ? true : undefined}
              aria-describedby={[ids.hint, error && ids.error].filter(Boolean).join(' ')}
            />
            <FieldDescription id={ids.hint}>{t('auth.passwordHint')}</FieldDescription>
            {error && <FieldError id={ids.error}>{t(error)}</FieldError>}
          </Field>
          {reset.isError && (
            <div className="flex flex-col gap-2">
              <FormMessage tone="alert">
                {t(
                  linkInvalid
                    ? 'auth.error.linkInvalid'
                    : reset.error instanceof ApiError && reset.error.status === 429
                      ? 'auth.error.tooManyAttempts'
                      : 'auth.error.unexpected',
                )}
              </FormMessage>
              {linkInvalid && (
                <Button asChild variant="link" className="self-start text-sm">
                  <Link to="/forgot-password">{t('auth.reset.requestAgain')}</Link>
                </Button>
              )}
            </div>
          )}
          <SubmitButton pending={reset.isPending}>{t('auth.reset.submit')}</SubmitButton>
        </form>
      )}
    </AuthPage>
  );
}
