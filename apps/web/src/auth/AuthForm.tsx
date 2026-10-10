import { ApiError } from '@daric/api-client';
import { loginInputSchema, registerInputSchema } from '@daric/core';
import type { LoginInput, Session } from '@daric/core';
import type { PlainMessageKey } from '@daric/i18n';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useId, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { useApi } from '../api/api';
import { useI18n } from '../i18n/locale';
import { ME_QUERY_KEY } from './session';

type Mode = 'login' | 'signup';
type Field = 'email' | 'password';
type FieldErrors = Partial<Record<Field, PlainMessageKey>>;

const COPY = {
  login: {
    title: 'auth.login.title',
    submit: 'auth.login.submit',
    switchPrompt: 'auth.login.noAccount',
    switchLink: 'auth.login.toSignup',
    switchTo: '/signup',
  },
  signup: {
    title: 'auth.signup.title',
    submit: 'auth.signup.submit',
    switchPrompt: 'auth.signup.hasAccount',
    switchLink: 'auth.signup.toLogin',
    switchTo: '/login',
  },
} as const satisfies Record<Mode, Record<string, string>>;

/** Field errors from the same schemas the API validates with, as message keys. */
function validate(mode: Mode, values: LoginInput): FieldErrors {
  const errors: FieldErrors = {};
  if (!values.email.trim()) errors.email = 'auth.error.emailRequired';
  if (!values.password) errors.password = 'auth.error.passwordRequired';

  const schema = mode === 'signup' ? registerInputSchema : loginInputSchema;
  const result = schema.safeParse(values);
  for (const issue of result.success ? [] : result.error.issues) {
    const field = issue.path[0];
    if (field === 'email') errors.email ??= 'auth.error.emailInvalid';
    if (field === 'password') {
      errors.password ??=
        issue.code === 'too_big' ? 'auth.error.passwordTooLong' : 'auth.error.passwordTooShort';
    }
  }
  return errors;
}

function failureMessage(mode: Mode, error: unknown): PlainMessageKey {
  if (error instanceof ApiError) {
    if (error.status === 401 && mode === 'login') return 'auth.error.wrongCredentials';
    if (error.status === 409 && mode === 'signup') return 'auth.error.emailTaken';
    if (error.status === 429) return 'auth.error.tooManyAttempts';
  }
  return 'auth.error.unexpected';
}

const inputClass =
  'w-full rounded-md border border-border bg-background px-3 py-2 text-foreground aria-invalid:border-danger';

/** The login and sign-up form; the server sets the session cookies, so success just goes home. */
export function AuthForm({ mode }: { mode: Mode }) {
  const { t } = useI18n();
  const api = useApi();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const copy = COPY[mode];
  const id = useId();
  const ids = {
    title: `${id}-title`,
    email: `${id}-email`,
    emailError: `${id}-email-error`,
    password: `${id}-password`,
    passwordHint: `${id}-password-hint`,
    passwordError: `${id}-password-error`,
  };
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const [errors, setErrors] = useState<FieldErrors>({});

  const submit = useMutation({
    mutationFn: (input: LoginInput): Promise<Session> =>
      mode === 'signup' ? api.register(input) : api.login(input),
    onSuccess: async () => {
      // The cookies changed; ask the API who is signed in now.
      queryClient.removeQueries({ queryKey: ME_QUERY_KEY });
      await navigate('/', { replace: true });
    },
  });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const values = { email: String(data.get('email')), password: String(data.get('password')) };
    const found = validate(mode, values);
    setErrors(found);
    if (found.email) return emailRef.current?.focus();
    if (found.password) return passwordRef.current?.focus();
    submit.mutate(values);
  }

  const showHint = mode === 'signup';
  const passwordDescribedBy =
    [showHint && ids.passwordHint, errors.password && ids.passwordError]
      .filter(Boolean)
      .join(' ') || undefined;

  return (
    <section className="mx-auto flex max-w-sm flex-col gap-6 rounded-xl border border-border bg-surface px-6 py-8">
      <h1 id={ids.title} className="text-2xl font-bold">
        {t(copy.title)}
      </h1>
      <form
        aria-labelledby={ids.title}
        noValidate
        onSubmit={onSubmit}
        className="flex flex-col gap-4"
      >
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
            aria-invalid={errors.email ? true : undefined}
            aria-describedby={errors.email ? ids.emailError : undefined}
            className={inputClass}
          />
          {errors.email && (
            <p id={ids.emailError} className="text-sm text-danger">
              {t(errors.email)}
            </p>
          )}
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={ids.password} className="font-medium">
            {t('auth.password')}
          </label>
          <input
            ref={passwordRef}
            id={ids.password}
            name="password"
            type="password"
            dir="ltr"
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            aria-invalid={errors.password ? true : undefined}
            aria-describedby={passwordDescribedBy}
            className={inputClass}
          />
          {showHint && (
            <p id={ids.passwordHint} className="text-sm text-foreground-muted">
              {t('auth.passwordHint')}
            </p>
          )}
          {errors.password && (
            <p id={ids.passwordError} className="text-sm text-danger">
              {t(errors.password)}
            </p>
          )}
        </div>
        {submit.isError && (
          <p role="alert" className="rounded-md bg-surface-muted px-3 py-2 text-sm text-danger">
            {t(failureMessage(mode, submit.error))}
          </p>
        )}
        <button
          type="submit"
          disabled={submit.isPending}
          className="rounded-md bg-primary px-4 py-2 font-medium text-on-primary disabled:opacity-60"
        >
          {t(copy.submit)}
        </button>
      </form>
      <p className="text-sm text-foreground-muted">
        {t(copy.switchPrompt)}{' '}
        <Link to={copy.switchTo} className="font-medium text-accent underline underline-offset-4">
          {t(copy.switchLink)}
        </Link>
      </p>
    </section>
  );
}
