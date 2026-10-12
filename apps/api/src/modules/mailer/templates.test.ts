import { describe, expect, it } from 'vitest';
import { passwordChangedTemplate, resetPasswordTemplate, verifyEmailTemplate } from './templates';

const link = 'https://daric.example/verify-email?token=abc_DEF-123';

describe('email templates', () => {
  it.each([
    ['verification', verifyEmailTemplate(link, 24)],
    ['password reset', resetPasswordTemplate(link, 1)],
    ['password changed', passwordChangedTemplate(link)],
  ])('render the %s mail in Persian, right to left, with the link in both bodies', (_, mail) => {
    expect(mail.subject).toMatch(/دریک/);
    expect(mail.text).toContain(link);
    expect(mail.html).toContain(`href="${link}"`);
    expect(mail.html).toMatch(/<html lang="fa" dir="rtl">/);
  });

  it('states how long a link is valid in Persian digits', () => {
    expect(verifyEmailTemplate(link, 24).text).toContain('۲۴ ساعت');
    expect(resetPasswordTemplate(link, 1).text).toContain('۱ ساعت');
  });

  it('escapes the link in HTML', () => {
    const mail = verifyEmailTemplate('https://x.example/?a=1&token="><script>', 24);
    expect(mail.html).not.toContain('"><script>');
    expect(mail.html).toContain('&amp;token=&quot;&gt;&lt;script&gt;');
  });
});
