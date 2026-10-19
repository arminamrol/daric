import type { Subscription } from '@daric/core';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { fakeApi } from '../test/fake-api';
import { renderApp } from '../test/render';

const free: Subscription = {
  billingEnabled: true,
  plan: 'FREE',
  onTrial: false,
  trialEndsAt: '2026-10-01T06:30:00.000Z',
  expiresAt: '2026-10-01T06:30:00.000Z',
  entitlements: {
    signedInDevices: 1,
    shareWorkspace: false,
    aiAnalysesPerMonth: 1,
    aiAnalysesLeftThisMonth: 1,
  },
};

const memberList = async () => within(await screen.findByRole('list', { name: 'اعضا' }));
const invitationRegion = async () => within(await screen.findByRole('region', { name: 'دعوت‌ها' }));

describe('Members page', () => {
  it('opens from Settings and lists everyone with their Role', async () => {
    const server = fakeApi({ signedInAs: 'sara@example.com' });
    server.addMember('reza@example.com', 'MEMBER');
    renderApp({ path: '/settings', api: server.api });
    await userEvent.click(await screen.findByRole('link', { name: 'اعضا و دعوت‌ها' }));

    const list = await memberList();
    expect(list.getByText('sara@example.com')).toBeTruthy();
    expect(list.getByText('(شما)')).toBeTruthy();
    expect(list.getByText('مالک')).toBeTruthy();
    expect((list.getByLabelText('نقش reza@example.com') as HTMLSelectElement).value).toBe('MEMBER');
  });

  it('lets the Owner invite by email and shows the link once to copy', async () => {
    const server = fakeApi({ signedInAs: 'sara@example.com' });
    renderApp({ path: '/settings/members', api: server.api });
    const region = await invitationRegion();
    await userEvent.type(await region.findByLabelText('ایمیل (اختیاری)'), 'reza@example.com');
    await userEvent.click(region.getByRole('radio', { name: 'بیننده' }));
    await userEvent.click(region.getByRole('button', { name: 'ساختن دعوت' }));

    expect(await region.findByText(/این پیوند فقط همین یک بار/)).toBeTruthy();
    const link = region.getByLabelText('پیوند دعوت') as HTMLInputElement;
    expect(link.value).toMatch(/^https:\/\/daric\.example\/invitation\?token=/);
    expect(region.getByText(/پیوند به .*reza@example\.com.* هم فرستاده شد/)).toBeTruthy();
    expect(server.invitations()[0]).toMatchObject({ email: 'reza@example.com', role: 'VIEWER' });
    const row = (await region.findByText('reza@example.com')).closest('li');
    expect(row && within(row).getByText('در انتظار')).toBeTruthy();
  });

  it('makes a link-only Invitation when no email is given', async () => {
    const server = fakeApi({ signedInAs: 'sara@example.com' });
    renderApp({ path: '/settings/members', api: server.api });
    const region = await invitationRegion();
    await userEvent.click(await region.findByRole('button', { name: 'ساختن دعوت' }));
    expect(await region.findByLabelText('پیوند دعوت')).toBeTruthy();
    expect(region.queryByText(/هم فرستاده شد/)).toBeNull();
    expect(await region.findByText('هر کسی با پیوند')).toBeTruthy();
    expect(server.invitations()[0]).toMatchObject({ email: null, role: 'MEMBER' });
  });

  it('says so when the email is already a Member', async () => {
    const server = fakeApi({ signedInAs: 'sara@example.com' });
    server.addMember('reza@example.com', 'MEMBER');
    renderApp({ path: '/settings/members', api: server.api });
    const region = await invitationRegion();
    await userEvent.type(await region.findByLabelText('ایمیل (اختیاری)'), 'reza@example.com');
    await userEvent.click(region.getByRole('button', { name: 'ساختن دعوت' }));
    expect(
      await region.findByText('این ایمیل همین حالا عضو است یا دعوت در انتظاری دارد.'),
    ).toBeTruthy();
  });

  it('revokes a pending Invitation', async () => {
    const server = fakeApi({ signedInAs: 'sara@example.com' });
    await server.api.createInvitation(server.workspace().id, {
      email: 'reza@example.com',
      role: 'MEMBER',
    });
    renderApp({ path: '/settings/members', api: server.api });
    const region = await invitationRegion();
    await userEvent.click(
      await region.findByRole('button', { name: /لغو دعوت .*reza@example\.com/ }),
    );
    expect(await region.findByText('لغو شد')).toBeTruthy();
    expect(server.invitations()[0]?.status).toBe('REVOKED');
  });

  it('shows a Free Owner the paywall instead of the form', async () => {
    const server = fakeApi({ signedInAs: 'sara@example.com' });
    server.setSubscription(free);
    renderApp({ path: '/settings/members', api: server.api });
    const region = await invitationRegion();
    expect(await region.findByText('اشتراک‌گذاری با دریک پلاس')).toBeTruthy();
    expect(region.getByRole('link', { name: 'خرید دریک پلاس' }).getAttribute('href')).toBe(
      '/settings/subscription/checkout',
    );
    expect(region.queryByRole('button', { name: 'ساختن دعوت' })).toBeNull();
  });

  it("asks an Admin to turn to the Owner when the Owner's Plan has no sharing", async () => {
    const server = fakeApi({ signedInAs: 'sara@example.com', role: 'ADMIN' });
    server.setSubscription(free);
    renderApp({ path: '/settings/members', api: server.api });
    const region = await invitationRegion();
    expect(
      await region.findByText('از مالک این فضای کاری بخواهید طرحش را به پلاس ببرد.'),
    ).toBeTruthy();
  });

  it('lets an Admin give only Member and Viewer, and not touch the Owner', async () => {
    const server = fakeApi({ signedInAs: 'sara@example.com', role: 'ADMIN' });
    server.addMember('reza@example.com', 'VIEWER');
    renderApp({ path: '/settings/members', api: server.api });
    const region = await invitationRegion();
    expect((await region.findAllByRole('radio')).map((r) => r.parentElement?.textContent)).toEqual([
      'عضو',
      'بیننده',
    ]);
    const list = await memberList();
    expect(list.queryByLabelText('نقش owner@example.com')).toBeNull();
    const select = list.getByLabelText('نقش reza@example.com');
    expect(
      within(select)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['عضو', 'بیننده']);
  });

  it('shows a Viewer the Members only', async () => {
    const server = fakeApi({ signedInAs: 'sara@example.com', role: 'VIEWER' });
    server.addMember('reza@example.com', 'MEMBER');
    renderApp({ path: '/settings/members', api: server.api });
    const list = await memberList();
    expect(list.getByText('reza@example.com')).toBeTruthy();
    expect(list.queryByRole('combobox')).toBeNull();
    expect(screen.queryByRole('region', { name: 'دعوت‌ها' })).toBeNull();
  });

  it("lets the Owner change a Member's Role and remove them after confirming", async () => {
    const server = fakeApi({ signedInAs: 'sara@example.com' });
    const reza = server.addMember('reza@example.com', 'MEMBER');
    renderApp({ path: '/settings/members', api: server.api });
    const list = await memberList();
    await userEvent.selectOptions(list.getByLabelText('نقش reza@example.com'), 'ADMIN');
    expect(server.members().find((m) => m.id === reza.id)?.role).toBe('ADMIN');

    await userEvent.click(list.getByRole('button', { name: 'برداشتن reza@example.com' }));
    expect(server.members()).toHaveLength(2);
    await userEvent.click(list.getByRole('button', { name: 'بله، بردار' }));
    expect(await list.findByText('sara@example.com')).toBeTruthy();
    expect(list.queryByText('reza@example.com')).toBeNull();
    expect(server.members().map((m) => m.email)).toEqual(['sara@example.com']);
  });

  it('lets a Member leave, but never the Owner', async () => {
    const server = fakeApi({ signedInAs: 'sara@example.com', role: 'MEMBER' });
    renderApp({ path: '/settings/members', api: server.api });
    const list = await memberList();
    await userEvent.click(list.getByRole('button', { name: 'ترک این فضای کاری' }));
    await userEvent.click(list.getByRole('button', { name: 'بله، ترک می‌کنم' }));
    expect(await screen.findByRole('heading', { name: 'به دریک خوش آمدید' })).toBeTruthy();
    expect(server.members().map((m) => m.email)).toEqual(['owner@example.com']);
  });

  it('gives the Owner no way to leave', async () => {
    renderApp({ path: '/settings/members' });
    const list = await memberList();
    expect(list.queryByRole('button', { name: 'ترک این فضای کاری' })).toBeNull();
  });
});
