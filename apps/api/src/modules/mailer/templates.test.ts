import { describe, expect, it } from 'vitest';
import {
  gracePeriodTemplate,
  invitationTemplate,
  passwordChangedTemplate,
  plusEndingTemplate,
  resetPasswordTemplate,
  verifyEmailTemplate,
} from './templates';

const link = 'https://daric.example/verify-email?token=abc_DEF-123';
const ending = { days: 7, onTrial: false, graceDays: 7, hasMembers: true };
const grace = { days: 7, hasMembers: true };
const invite = { inviterEmail: 'sara@example.com', workspaceName: 'Home', role: 'MEMBER' } as const;

describe('email templates', () => {
  it.each([
    ['verification', verifyEmailTemplate('fa', link, 24)],
    ['password reset', resetPasswordTemplate('fa', link, 1)],
    ['password changed', passwordChangedTemplate('fa', link)],
    ['invitation', invitationTemplate('fa', invite, link, 7)],
    ['Plus reminder', plusEndingTemplate('fa', ending, link)],
    ['Grace Period', gracePeriodTemplate('fa', grace, link)],
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
    ['invitation', invitationTemplate('en', invite, link, 7)],
    ['Plus reminder', plusEndingTemplate('en', ending, link)],
    ['Grace Period', gracePeriodTemplate('en', grace, link)],
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

  it('names who invited, to which Workspace and with which Role', () => {
    const fa = invitationTemplate('fa', invite, link, 7);
    expect(fa.text).toContain('sara@example.com');
    expect(fa.text).toContain('«Home»');
    expect(fa.text).toContain('«عضو»');
    expect(fa.text).toContain('۷ روز');
    const en = invitationTemplate('en', { ...invite, role: 'VIEWER' }, link, 7);
    expect(en.subject).toBe('Join "Home" on Daric');
    expect(en.text).toContain('as Viewer');
    expect(en.text).toContain('works for 7 days');
  });

  it('escapes a Workspace name in the HTML', () => {
    const mail = invitationTemplate('en', { ...invite, workspaceName: '<b>x</b>' }, link, 7);
    expect(mail.html).not.toContain('<b>x</b>');
    expect(mail.html).toContain('&lt;b&gt;x&lt;/b&gt;');
  });
});
