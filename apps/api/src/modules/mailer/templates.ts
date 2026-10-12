import { themes } from '@daric/design-tokens';
import type { MailMessage } from './mailer';

// Persian only for now; the English locale arrives with ticket 33.

type Template = Omit<MailMessage, 'to'>;

// Mail clients ignore dark-mode CSS unevenly, so mail always uses the light theme, inline.
const c = themes.light;
const persianNumber = new Intl.NumberFormat('fa-IR');

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

/** One message as plain text and as right-to-left HTML that keeps working when images are off. */
function render({ subject, intro, action, outro }: Body): Template {
  const text = [
    'سلام،',
    ...intro,
    ...(action ? [`${action.label}:\n${action.url}`] : []),
    ...outro,
    'دریک',
  ].join('\n\n');

  const paragraph = (p: string) => `<p style="margin:0 0 16px">${escapeHtml(p)}</p>`;
  const button = action
    ? `<p style="margin:24px 0"><a href="${escapeHtml(action.url)}" style="display:inline-block;background:${c.primary};color:${c.onPrimary};padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold">${escapeHtml(action.label)}</a></p>` +
      `<p style="margin:0 0 16px;font-size:13px;color:${c.foregroundMuted}">اگر دکمه کار نکرد، این نشانی را در مرورگر باز کنید:<br><a href="${escapeHtml(action.url)}" dir="ltr" style="color:${c.accent};word-break:break-all">${escapeHtml(action.url)}</a></p>`
    : '';
  const html = `<!doctype html>
<html lang="fa" dir="rtl">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:24px;background:${c.background};font-family:Tahoma,Vazirmatn,sans-serif;line-height:1.8;color:${c.foreground}">
<div dir="rtl" style="max-width:480px;margin:0 auto;background:${c.surface};border:1px solid ${c.border};border-radius:12px;padding:32px;text-align:right">
${paragraph('سلام،')}
${intro.map(paragraph).join('\n')}
${button}
${outro.map(paragraph).join('\n')}
<p style="margin:24px 0 0;color:${c.accent};font-weight:bold">دریک</p>
</div>
</body>
</html>`;
  return { subject, text, html };
}

function validFor(hours: number): string {
  return `این پیوند تا ${persianNumber.format(hours)} ساعت معتبر است و فقط یک بار کار می‌کند.`;
}

export function verifyEmailTemplate(link: string, validHours: number): Template {
  return render({
    subject: 'ایمیل خود را در دریک تأیید کنید',
    intro: ['برای تأیید ایمیل حساب دریک خود روی دکمهٔ زیر بزنید.'],
    action: { label: 'تأیید ایمیل', url: link },
    outro: [validFor(validHours), 'اگر شما در دریک ثبت‌نام نکرده‌اید، این ایمیل را نادیده بگیرید.'],
  });
}

export function resetPasswordTemplate(link: string, validHours: number): Template {
  return render({
    subject: 'بازنشانی رمز عبور دریک',
    intro: [
      'درخواستی برای بازنشانی رمز عبور حساب دریک شما رسید. برای گذاشتن رمز تازه روی دکمهٔ زیر بزنید.',
    ],
    action: { label: 'گذاشتن رمز تازه', url: link },
    outro: [
      validFor(validHours),
      'اگر این درخواست از شما نبوده، این ایمیل را نادیده بگیرید؛ رمز عبورتان تغییر نمی‌کند.',
    ],
  });
}

export function passwordChangedTemplate(forgotLink: string): Template {
  return render({
    subject: 'رمز عبور دریک شما تغییر کرد',
    intro: ['رمز عبور حساب دریک شما همین حالا تغییر کرد و همهٔ دستگاه‌ها از حساب خارج شدند.'],
    action: { label: 'این کار من نبود', url: forgotLink },
    outro: ['اگر این کار شما نبوده، همین حالا با دکمهٔ بالا رمز تازه‌ای بگذارید.'],
  });
}
