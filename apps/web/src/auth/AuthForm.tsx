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
import { useOfflineDevice } from '../offline/offline';
import { logoutPending, ME_QUERY_KEY, useAfterSignIn } from './session';
import { hasSignedIn, signedOutNotice } from './signedOut';

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

export const inputClass =
  'w-full rounded-md border border-border bg-background px-3 py-2 text-foreground aria-invalid:border-danger';
export const cardClass =
  'mx-auto flex max-w-sm flex-col gap-6 rounded-xl border border-border bg-surface px-6 py-8';
export const submitClass =
  'rounded-md bg-primary px-4 py-2 font-medium text-on-primary disabled:opacity-60';
export const linkClass = 'font-medium text-accent underline underline-offset-4';
export const alertClass = 'rounded-md bg-surface-muted px-3 py-2 text-sm text-danger';

/**
 * The login and sign-up form; the server sets the session cookies, so success
 * just goes home. It asks whether this device keeps data for offline use: no
 * unless ticked, since a shared browser would otherwise hold financial data.
 */
export function AuthForm({ mode }: { mode: Mode }) {
  const { t, locale } = useI18n();
  const api = useApi();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const afterSignIn = useAfterSignIn();
  const device = useOfflineDevice();
  // Read once: it stays on screen until this form signs someone in.
  const [signedOut] = useState(() => (mode === 'login' ? signedOutNotice.get() : null));
  const copy = COPY[mode];
  const id = useId();
  const ids = {
    title: `${id}-title`,
    email: `${id}-email`,
    emailError: `${id}-email-error`,
    password: `${id}-password`,
    passwordHint: `${id}-password-hint`,
    passwordError: `${id}-password-error`,
    keepData: `${id}-keep-data`,
    keepDataHint: `${id}-keep-data-hint`,
  };
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const [errors, setErrors] = useState<FieldErrors>({});

  const submit = useMutation({
    mutationFn: ({
      keepData: _,
      ...input
    }: LoginInput & { keepData: boolean }): Promise<Session> =>
      mode === 'signup' ? api.register({ ...input, locale }) : api.login(input),
    onSuccess: async (_, { keepData }) => {
      logoutPending.set(false);
      signedOutNotice.set(null);
      hasSignedIn.set(true);
      await device.setKeep(keepData);
      // The cookies changed; ask the API who is signed in now. Reset, not removed:
      // the header keeps watching the same query and shows the signed-in nav.
      await queryClient.resetQueries({ queryKey: ME_QUERY_KEY });
      await navigate(afterSignIn(), { replace: true });
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
    submit.mutate({ ...values, keepData: data.get('keepData') === 'yes' });
  }

  const showHint = mode === 'signup';
  const passwordDescribedBy =
    [showHint && ids.passwordHint, errors.password && ids.passwordError]
      .filter(Boolean)
      .join(' ') || undefined;

  return (
    <section className={cardClass}>
      <h1 id={ids.title} className="text-2xl font-bold">
        {t(copy.title)}
      </h1>
      {signedOut && (
        <div
          role="status"
          className="flex flex-col gap-2 rounded-md bg-surface-muted px-3 py-2 text-sm"
        >
          <p>{t(`auth.signedOut.${signedOut}`)}</p>
          {signedOut === 'DEVICE_LIMIT' && (
            <Link to="/settings/subscription" className={linkClass}>
              {t('auth.signedOut.upgrade')}
            </Link>
          )}
        </div>
      )}
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
        <div className="flex flex-col gap-1">
          <label htmlFor={ids.keepData} className="flex items-center gap-2 font-medium">
            <input
              id={ids.keepData}
              name="keepData"
              type="checkbox"
              value="yes"
              aria-describedby={ids.keepDataHint}
              className="size-4"
            />
            {t('auth.keepData')}
          </label>
          <p id={ids.keepDataHint} className="text-sm text-foreground-muted">
            {t('auth.keepDataHint')}
          </p>
        </div>
        {submit.isError && (
          <p role="alert" className={alertClass}>
            {t(failureMessage(mode, submit.error))}
          </p>
        )}
        <button type="submit" disabled={submit.isPending} className={submitClass}>
          {t(copy.submit)}
        </button>
      </form>
      {mode === 'login' && (
        <Link to="/forgot-password" className={`text-sm ${linkClass}`}>
          {t('auth.login.forgot')}
        </Link>
      )}
      <p className="text-sm text-foreground-muted">
        {t(copy.switchPrompt)}{' '}
        <Link to={copy.switchTo} className={linkClass}>
          {t(copy.switchLink)}
        </Link>
      </p>
    </section>
  );
}
