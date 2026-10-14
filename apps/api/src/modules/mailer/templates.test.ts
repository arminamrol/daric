import { describe, expect, it } from 'vitest';
import { passwordChangedTemplate, resetPasswordTemplate, verifyEmailTemplate } from './templates';

const link = 'https://daric.example/verify-email?token=abc_DEF-123';

describe('email templates', () => {
  it.each([
    ['verification', verifyEmailTemplate('fa', link, 24)],
    ['password reset', resetPasswordTemplate('fa', link, 1)],
    ['password changed', passwordChangedTemplate('fa', link)],
  ])('render the %s mail in Persian, right to left, with the link in both bodies', (_, mail) => {
    expect(mail.subject).toMatch(/دریک/);
    expect(mail.text).toContain(link);
    expect(mail.html).toContain(`href="${link}"`);
    expect(mail.html).toMatch(/<html lang="fa" dir="rtl">/);
  });

  it.each([
    ['verification', verifyEmailTemplate('en', link, 24)],
    ['password reset', resetPasswordTemplate('en', link, 1)],
    ['password changed', passwordChangedTemplate('en', link)],
  ])('render the %s mail in English, left to right, with the link in both bodies', (_, mail) => {
    expect(mail.subject).toMatch(/Daric/);
    expect(mail.text).toMatch(/^Hello,/);
    expect(mail.text).toContain(link);
    expect(mail.html).toContain(`href="${link}"`);
    expect(mail.html).toMatch(/<html lang="en" dir="ltr">/);
    expect(mail.html).toContain('text-align:left');
  });

  it('states how long a link is valid in Persian digits', () => {
    expect(verifyEmailTemplate('fa', link, 24).text).toContain('۲۴ ساعت');
    expect(resetPasswordTemplate('fa', link, 1).text).toContain('۱ ساعت');
  });

  it('states how long a link is valid in English', () => {
    expect(verifyEmailTemplate('en', link, 24).text).toContain('works for 24 hours');
    expect(resetPasswordTemplate('en', link, 1).text).toContain('works for 1 hour,');
  });

  it('escapes the link in HTML', () => {
    const mail = verifyEmailTemplate('fa', 'https://x.example/?a=1&token="><script>', 24);
    expect(mail.html).not.toContain('"><script>');
    expect(mail.html).toContain('&amp;token=&quot;&gt;&lt;script&gt;');
  });
});
