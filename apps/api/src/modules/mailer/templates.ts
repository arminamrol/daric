import type { AssignableRole, Locale } from '@daric/core';
import { themes } from '@daric/design-tokens';
import { direction } from '@daric/i18n';
import type { MailMessage } from './mailer';

type Template = Omit<MailMessage, 'to'>;

// Mail clients ignore dark-mode CSS unevenly, so mail always uses the light theme, inline.
const c = themes.light;

/** The words every mail shares, in each language. */
const FRAME: Readonly<
  Record<
    Locale,
    {
      greeting: string;
      signature: string;
      fallback: string;
      font: string;
      number: Intl.NumberFormat;
    }
  >
> = {
  fa: {
    greeting: 'سلام،',
    signature: 'دریک',
    fallback: 'اگر دکمه کار نکرد، این نشانی را در مرورگر باز کنید:',
    font: 'Tahoma,Vazirmatn,sans-serif',
    number: new Intl.NumberFormat('fa-IR'),
  },
  en: {
    greeting: 'Hello,',
    signature: 'Daric',
    fallback: 'If the button does not work, open this address in your browser:',
    font: 'Inter,Arial,sans-serif',
    number: new Intl.NumberFormat('en'),
  },
};

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch] ?? ch,
  );
}

interface Body {
  subject: string;
  /** Paragraphs before the button. */
  intro: string[];
  action?: { label: string; url: string };
  /** Paragraphs after the button. */
  outro: string[];
}

/** One message as plain text and as HTML in the language's direction that keeps working when images are off. */
function render(locale: Locale, { subject, intro, action, outro }: Body): Template {
  const { greeting, signature, fallback, font } = FRAME[locale];
  const dir = direction(locale);
  const align = dir === 'rtl' ? 'right' : 'left';
  const text = [
    greeting,
    ...intro,
    ...(action ? [`${action.label}:\n${action.url}`] : []),
    ...outro,
    signature,
  ].join('\n\n');

  const paragraph = (p: string) => `<p style="margin:0 0 16px">${escapeHtml(p)}</p>`;
  const button = action
    ? `<p style="margin:24px 0"><a href="${escapeHtml(action.url)}" style="display:inline-block;background:${c.primary};color:${c.onPrimary};padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold">${escapeHtml(action.label)}</a></p>` +
      `<p style="margin:0 0 16px;font-size:13px;color:${c.foregroundMuted}">${escapeHtml(fallback)}<br><a href="${escapeHtml(action.url)}" dir="ltr" style="color:${c.accent};word-break:break-all">${escapeHtml(action.url)}</a></p>`
    : '';
  const html = `<!doctype html>
<html lang="${locale}" dir="${dir}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:24px;background:${c.background};font-family:${font};line-height:1.8;color:${c.foreground}">
<div dir="${dir}" style="max-width:480px;margin:0 auto;background:${c.surface};border:1px solid ${c.border};border-radius:12px;padding:32px;text-align:${align}">
${paragraph(greeting)}
${intro.map(paragraph).join('\n')}
${button}
${outro.map(paragraph).join('\n')}
<p style="margin:24px 0 0;color:${c.accent};font-weight:bold">${escapeHtml(signature)}</p>
</div>
</body>
</html>`;
  return { subject, text, html };
}

function validFor(locale: Locale, hours: number): string {
  const count = FRAME[locale].number.format(hours);
  return locale === 'fa'
    ? `این پیوند تا ${count} ساعت معتبر است و فقط یک بار کار می‌کند.`
    : `This link works for ${count} ${hours === 1 ? 'hour' : 'hours'}, and only once.`;
}

export function verifyEmailTemplate(locale: Locale, link: string, validHours: number): Template {
  return render(
    locale,
    locale === 'fa'
      ? {
          subject: 'ایمیل خود را در دریک تأیید کنید',
          intro: ['برای تأیید ایمیل حساب دریک خود روی دکمهٔ زیر بزنید.'],
          action: { label: 'تأیید ایمیل', url: link },
          outro: [
            validFor(locale, validHours),
            'اگر شما در دریک ثبت‌نام نکرده‌اید، این ایمیل را نادیده بگیرید.',
          ],
        }
      : {
          subject: 'Verify your email for Daric',
          intro: ['Press the button below to verify the email of your Daric account.'],
          action: { label: 'Verify email', url: link },
          outro: [
            validFor(locale, validHours),
            'If you did not sign up for Daric, you can ignore this email.',
          ],
        },
  );
}

export function resetPasswordTemplate(locale: Locale, link: string, validHours: number): Template {
  return render(
    locale,
    locale === 'fa'
      ? {
          subject: 'بازنشانی رمز عبور دریک',
          intro: [
            'درخواستی برای بازنشانی رمز عبور حساب دریک شما رسید. برای گذاشتن رمز تازه روی دکمهٔ زیر بزنید.',
          ],
          action: { label: 'گذاشتن رمز تازه', url: link },
          outro: [
            validFor(locale, validHours),
            'اگر این درخواست از شما نبوده، این ایمیل را نادیده بگیرید؛ رمز عبورتان تغییر نمی‌کند.',
          ],
        }
      : {
          subject: 'Reset your Daric password',
          intro: [
            'We received a request to reset the password of your Daric account. Press the button below to set a new one.',
          ],
          action: { label: 'Set a new password', url: link },
          outro: [
            validFor(locale, validHours),
            'If you did not ask for this, ignore this email; your password will not change.',
          ],
        },
  );
}

export function passwordChangedTemplate(locale: Locale, forgotLink: string): Template {
  return render(
    locale,
    locale === 'fa'
      ? {
          subject: 'رمز عبور دریک شما تغییر کرد',
          intro: ['رمز عبور حساب دریک شما همین حالا تغییر کرد و همهٔ دستگاه‌ها از حساب خارج شدند.'],
          action: { label: 'این کار من نبود', url: forgotLink },
          outro: ['اگر این کار شما نبوده، همین حالا با دکمهٔ بالا رمز تازه‌ای بگذارید.'],
        }
      : {
          subject: 'Your Daric password was changed',
          intro: [
            'The password of your Daric account was just changed, and every device was logged out.',
          ],
          action: { label: 'This was not me', url: forgotLink },
          outro: ['If this was not you, set a new password right away with the button above.'],
        },
  );
}

/** The words for each Role an Invitation can give, in each language. */
const ROLE_NAMES: Readonly<Record<Locale, Record<AssignableRole, string>>> = {
  fa: { ADMIN: 'مدیر', MEMBER: 'عضو', VIEWER: 'بیننده' },
  en: { ADMIN: 'Admin', MEMBER: 'Member', VIEWER: 'Viewer' },
};

export function invitationTemplate(
  locale: Locale,
  invite: { inviterEmail: string; workspaceName: string; role: AssignableRole },
  link: string,
  validDays: number,
): Template {
  const role = ROLE_NAMES[locale][invite.role];
  const days = FRAME[locale].number.format(validDays);
  return render(
    locale,
    locale === 'fa'
      ? {
          subject: `دعوت به فضای کاری «${invite.workspaceName}» در دریک`,
          intro: [
            `${invite.inviterEmail} شما را دعوت کرده است تا با نقش «${role}» به فضای کاری «${invite.workspaceName}» در دریک بپیوندید.`,
          ],
          action: { label: 'دیدن دعوت', url: link },
          outro: [
            `این دعوت تا ${days} روز معتبر است و فقط یک بار کار می‌کند. برای پذیرفتن آن باید با همین ایمیل وارد دریک شوید و ایمیل را تأیید کرده باشید.`,
            'اگر این فرد را نمی‌شناسید، این ایمیل را نادیده بگیرید.',
          ],
        }
      : {
          subject: `Join "${invite.workspaceName}" on Daric`,
          intro: [
            `${invite.inviterEmail} invited you to join the workspace "${invite.workspaceName}" on Daric as ${role}.`,
          ],
          action: { label: 'See the invitation', url: link },
          outro: [
            `This invitation works for ${days} ${validDays === 1 ? 'day' : 'days'}, and only once. To accept it, sign in to Daric with this email and verify it.`,
            'If you do not know this person, you can ignore this email.',
          ],
        },
  );
}
