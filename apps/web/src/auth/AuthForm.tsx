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
import { Button } from '../ui/Button';
import { Field, FieldDescription, FieldError, FormMessage, Input, Label } from '../ui/Field';
import { AuthOutcome, AuthPage, SubmitButton } from './AuthPage';
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
    <AuthPage
      title={t(copy.title)}
      titleId={ids.title}
      footer={
        <p>
          {t(copy.switchPrompt)}{' '}
          <Button asChild variant="link">
            <Link to={copy.switchTo}>{t(copy.switchLink)}</Link>
          </Button>
        </p>
      }
    >
      {signedOut && (
        <AuthOutcome tone="info">
          <p>{t(`auth.signedOut.${signedOut}`)}</p>
          {(signedOut === 'DEVICE_LIMIT' || signedOut === 'PLUS_ENDED') && (
            <Button asChild variant="link" className="self-start">
              <Link to="/settings/subscription">{t('auth.signedOut.upgrade')}</Link>
            </Button>
          )}
        </AuthOutcome>
      )}
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
            aria-invalid={errors.email ? true : undefined}
            aria-describedby={errors.email ? ids.emailError : undefined}
          />
          {errors.email && <FieldError id={ids.emailError}>{t(errors.email)}</FieldError>}
        </Field>
        <Field>
          <Label htmlFor={ids.password}>{t('auth.password')}</Label>
          <Input
            ref={passwordRef}
            id={ids.password}
            name="password"
            type="password"
            dir="ltr"
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            aria-invalid={errors.password ? true : undefined}
            aria-describedby={passwordDescribedBy}
          />
          {showHint && (
            <FieldDescription id={ids.passwordHint}>{t('auth.passwordHint')}</FieldDescription>
          )}
          {errors.password && <FieldError id={ids.passwordError}>{t(errors.password)}</FieldError>}
          {mode === 'login' && (
            <Button asChild variant="link" className="self-end text-sm">
              <Link to="/forgot-password">{t('auth.login.forgot')}</Link>
            </Button>
          )}
        </Field>
        <div className="flex items-start gap-3 rounded-md border border-border px-4 py-3">
          <input
            id={ids.keepData}
            name="keepData"
            type="checkbox"
            value="yes"
            aria-describedby={ids.keepDataHint}
            className="mt-1 size-5 shrink-0 cursor-pointer accent-primary"
          />
          <div className="flex flex-col gap-0.5">
            <Label htmlFor={ids.keepData} className="cursor-pointer">
              {t('auth.keepData')}
            </Label>
            <FieldDescription id={ids.keepDataHint}>{t('auth.keepDataHint')}</FieldDescription>
          </div>
        </div>
        {submit.isError && (
          <FormMessage tone="alert">{t(failureMessage(mode, submit.error))}</FormMessage>
        )}
        <SubmitButton pending={submit.isPending}>{t(copy.submit)}</SubmitButton>
      </form>
    </AuthPage>
  );
}
