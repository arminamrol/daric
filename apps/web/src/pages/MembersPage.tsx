import { ApiError } from '@daric/api-client';
import {
  type AssignableRole,
  type CreatedInvitation,
  hasRole,
  type Invitation,
  mayManageMember,
  type Member,
  rolesAssignableBy,
  type WorkspaceRole,
} from '@daric/core';
import { isolate } from '@daric/i18n';
import { useQueryClient } from '@tanstack/react-query';
import { type FormEvent, useId, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { ME_QUERY_KEY, useSignedIn } from '../auth/session';
import { useI18n } from '../i18n/locale';
import {
  useCreateInvitation,
  useInvitations,
  useMembers,
  useRemoveMember,
  useRevokeInvitation,
  useTransferOwnership,
  useUpdateMember,
} from '../members/members';
import { useFormatters } from '../settings/settings';
import { ChoiceGroup } from '../ui/ChoiceGroup';
import { ConfirmButton } from '../ui/ConfirmButton';
import { CHECKOUT_PATH, Paywall } from '../ui/Paywall';

const cardClass = 'flex flex-col gap-4 rounded-xl border border-border bg-surface px-6 py-6';
const alertClass = 'rounded-md bg-surface-muted px-3 py-2 text-sm text-danger';

function MemberRow({ member }: { member: Member }) {
  const { t } = useI18n();
  const { me, workspace } = useSignedIn();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const update = useUpdateMember();
  const remove = useRemoveMember();
  const transfer = useTransferOwnership();
  const roleId = useId();
  const self = member.userId === me.user.id;
  const manageable = !self && mayManageMember(workspace.role, member.role);

  async function leave() {
    await remove.mutateAsync(member.id);
    // No longer a Member: show the Workspaces left.
    await queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY });
    void navigate('/');
  }

  return (
    <li className="flex flex-col gap-2 py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="me-auto font-medium" dir="ltr">
          {member.email}
          {self && <span className="ms-1 text-sm text-foreground-muted">{t('members.you')}</span>}
          {member.suspended && (
            <span className="ms-2 rounded-full bg-surface-muted px-2 py-0.5 text-xs text-foreground-muted">
              {t('members.suspended')}
            </span>
          )}
        </span>
        {manageable ? (
          <>
            <label htmlFor={roleId} className="sr-only">
              {t('members.role', { email: member.email })}
            </label>
            <select
              id={roleId}
              value={member.role}
              disabled={update.isPending}
              onChange={(e) =>
                update.mutate({ memberId: member.id, role: e.target.value as AssignableRole })
              }
              className="rounded-md border border-border bg-surface px-2 py-1 text-sm"
            >
              {rolesAssignableBy(workspace.role).map((role) => (
                <option key={role} value={role}>
                  {t(`roles.${role}`)}
                </option>
              ))}
            </select>
            <ConfirmButton
              label={t('members.remove')}
              ariaLabel={t('members.removeLabel', { email: member.email })}
              question={t('members.removeConfirm', { email: isolate(member.email) })}
              confirm={t('members.removeYes')}
              cancel={t('members.cancel')}
              pending={remove.isPending}
              onConfirm={() => remove.mutate(member.id)}
            />
            {workspace.role === 'OWNER' && (
              <ConfirmButton
                label={t('members.makeOwner')}
                ariaLabel={t('members.makeOwnerLabel', { email: member.email })}
                question={t('members.makeOwnerConfirm', { email: isolate(member.email) })}
                confirm={t('members.makeOwnerYes')}
                cancel={t('members.cancel')}
                pending={transfer.isPending}
                onConfirm={() => transfer.mutate(member.id)}
              />
            )}
          </>
        ) : (
          <span className="text-sm text-foreground-muted">{t(`roles.${member.role}`)}</span>
        )}
        {self && member.role !== 'OWNER' && (
          <ConfirmButton
            label={t('members.leave')}
            question={t('members.leaveConfirm')}
            confirm={t('members.leaveYes')}
            cancel={t('members.cancel')}
            pending={remove.isPending}
            onConfirm={() => void leave().catch(() => undefined)}
          />
        )}
      </div>
      {(update.isError || remove.isError || transfer.isError) && (
        <p role="alert" className={alertClass}>
          {t('members.changeFailed')}
        </p>
      )}
    </li>
  );
}

function MemberList() {
  const { t } = useI18n();
  const { workspace } = useSignedIn();
  const members = useMembers();
  const titleId = useId();

  return (
    <section aria-labelledby={titleId} className={cardClass}>
      <h2 id={titleId} className="text-xl font-bold">
        {t('members.title')}
      </h2>
      <p className="text-sm text-foreground-muted">{t('members.hint')}</p>
      {members.isPending ? (
        <p role="status" className="text-foreground-muted">
          {t('session.loading')}
        </p>
      ) : members.isError ? (
        <p role="alert" className="text-danger">
          {t('members.loadFailed')}
        </p>
      ) : (
        <>
          {/* Only the Owner's Plus brings them back. */}
          {workspace.role === 'OWNER' && members.data.some((m) => m.suspended) && (
            <p className="rounded-md bg-surface-muted px-3 py-2 text-sm">
              {t('members.suspendedHint')}{' '}
              <Link
                to={CHECKOUT_PATH}
                className="font-medium text-accent underline underline-offset-4"
              >
                {t('subscription.extend')}
              </Link>
            </p>
          )}
          <ul aria-labelledby={titleId} className="flex flex-col divide-y divide-border">
            {members.data.map((member) => (
              <MemberRow key={member.id} member={member} />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

/** Shown instead of the Invitation form when the Owner's Plan does not include sharing (ADR-0008). */
function SharingPaywall({ role }: { role: WorkspaceRole }) {
  const { t } = useI18n();
  // Sharing is the Owner's Entitlement: only the Owner's own Plus helps.
  return (
    <Paywall
      title={t('invitations.paywall.title')}
      body={t('invitations.paywall.body')}
      cannotBuy={role === 'OWNER' ? undefined : t('invitations.paywall.askOwner')}
    />
  );
}

function CreatedLink({ invitation }: { invitation: CreatedInvitation }) {
  const { t } = useI18n();
  const linkId = useId();
  const [copied, setCopied] = useState(false);

  return (
    <div className="flex flex-col gap-2 rounded-lg bg-surface-muted px-4 py-3">
      <p role="status" className="text-sm">
        {t('invitations.created')}
      </p>
      <label htmlFor={linkId} className="sr-only">
        {t('invitations.link')}
      </label>
      <input
        id={linkId}
        readOnly
        dir="ltr"
        value={invitation.link}
        onFocus={(e) => e.target.select()}
        className="rounded-md border border-border bg-surface px-3 py-2 font-mono text-sm"
      />
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() =>
            void navigator.clipboard
              ?.writeText(invitation.link)
              .then(() => setCopied(true))
              .catch(() => undefined)
          }
          className="rounded-md border border-border px-3 py-1 text-sm font-medium"
        >
          {t('invitations.copy')}
        </button>
        {copied && <span className="text-sm text-foreground-muted">{t('invitations.copied')}</span>}
      </div>
      {invitation.email && (
        <p className="text-sm text-foreground-muted">
          {t('invitations.mailed', { email: isolate(invitation.email) })}
        </p>
      )}
    </div>
  );
}

function InviteForm() {
  const { t } = useI18n();
  const { workspace } = useSignedIn();
  const create = useCreateInvitation();
  const roles = rolesAssignableBy(workspace.role);
  const [email, setEmail] = useState('');
  // Owners and Admins may both give Member.
  const [role, setRole] = useState<AssignableRole>('MEMBER');
  const emailId = useId();
  const hintId = useId();
  const titleId = useId();

  function submit(event: FormEvent) {
    event.preventDefault();
    const trimmed = email.trim();
    create.mutate(trimmed ? { email: trimmed, role } : { role }, {
      onSuccess: () => setEmail(''),
    });
  }

  const taken = create.error instanceof ApiError && create.error.status === 409;

  return (
    <form onSubmit={submit} aria-labelledby={titleId} className="flex flex-col gap-3">
      <h3 id={titleId} className="font-bold">
        {t('invitations.new')}
      </h3>
      <div className="flex flex-col gap-1">
        <label htmlFor={emailId} className="font-medium">
          {t('invitations.email')}
        </label>
        <input
          id={emailId}
          type="email"
          dir="ltr"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-describedby={hintId}
          className="rounded-md border border-border bg-surface px-3 py-2"
        />
        <p id={hintId} className="text-sm text-foreground-muted">
          {t('invitations.emailHint')}
        </p>
      </div>
      <ChoiceGroup
        legend={t('invitations.role')}
        choices={roles.map((value) => ({ value, label: t(`roles.${value}`) }))}
        value={role}
        onChange={setRole}
      />
      <button
        type="submit"
        disabled={create.isPending}
        className="w-fit rounded-md bg-primary px-4 py-2 font-medium text-on-primary disabled:opacity-60"
      >
        {t('invitations.send')}
      </button>
      {create.isError && (
        <p role="alert" className={alertClass}>
          {t(taken ? 'invitations.taken' : 'invitations.createFailed')}
        </p>
      )}
      {create.isSuccess && <CreatedLink invitation={create.data} />}
    </form>
  );
}

function InvitationRow({ invitation }: { invitation: Invitation }) {
  const { t } = useI18n();
  const format = useFormatters();
  const { workspace } = useSignedIn();
  const revoke = useRevokeInvitation();
  const who = invitation.email ?? t('invitations.anyone');
  const revocable =
    invitation.status === 'PENDING' && mayManageMember(workspace.role, invitation.role);

  return (
    <li className="flex flex-col gap-1 py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="me-auto font-medium" dir={invitation.email ? 'ltr' : undefined}>
          {who}
        </span>
        <span className="text-sm">{t(`roles.${invitation.role}`)}</span>
        <span className="rounded-full bg-surface-muted px-2 py-0.5 text-sm">
          {t(`invitations.status.${invitation.status}`)}
        </span>
        {revocable && (
          <button
            type="button"
            disabled={revoke.isPending}
            aria-label={t('invitations.revokeLabel', { who: isolate(who) })}
            onClick={() => revoke.mutate(invitation.id)}
            className="rounded-md border border-border px-3 py-1 text-sm font-medium disabled:opacity-60"
          >
            {t('invitations.revoke')}
          </button>
        )}
      </div>
      {invitation.status === 'PENDING' && (
        <p className="text-sm text-foreground-muted">
          {t('invitations.until', {
            date: isolate(format.date(new Date(invitation.expiresAt), { style: 'long' })),
          })}
        </p>
      )}
      {revoke.isError && (
        <p role="alert" className={alertClass}>
          {t('invitations.revokeFailed')}
        </p>
      )}
    </li>
  );
}

function Invitations() {
  const { t } = useI18n();
  const { workspace } = useSignedIn();
  const invitations = useInvitations();
  const titleId = useId();

  return (
    <section aria-labelledby={titleId} className={cardClass}>
      <h2 id={titleId} className="text-xl font-bold">
        {t('invitations.title')}
      </h2>
      {invitations.isPending ? (
        <p role="status" className="text-foreground-muted">
          {t('session.loading')}
        </p>
      ) : invitations.isError ? (
        <p role="alert" className="text-danger">
          {t('invitations.loadFailed')}
        </p>
      ) : (
        <>
          {invitations.data.sharingAllowed ? (
            <InviteForm />
          ) : (
            <SharingPaywall role={workspace.role} />
          )}
          {invitations.data.invitations.length === 0 ? (
            <p className="text-foreground-muted">{t('invitations.empty')}</p>
          ) : (
            <ul aria-labelledby={titleId} className="flex flex-col divide-y divide-border">
              {invitations.data.invitations.map((invitation) => (
                <InvitationRow key={invitation.id} invitation={invitation} />
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

/** `/settings/members`: everyone sees who shares the Workspace; Owners and Admins invite and manage. */
export function MembersPage() {
  const { t } = useI18n();
  const { workspace } = useSignedIn();

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <h1 className="text-2xl font-bold">{t('members.link')}</h1>
      <MemberList />
      {hasRole(workspace.role, 'ADMIN') && <Invitations />}
    </div>
  );
}
