import { randomBytes } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  type AcceptedInvitation,
  consentPolicyVersions,
  type CreatedInvitation,
  type CreateInvitationInput,
  type Invitation,
  type InvitationList,
  type InvitationPreview,
  type InvitationRefusal,
  type InvitationStatus,
  mayManageMember,
  rolesAssignableBy,
} from '@daric/core';
import { and, desc, eq, gt, isNull, sql } from 'drizzle-orm';
import { CONFIG, DATABASE } from '../../common/di-tokens';
import { type ClientInfo, isUuid, type Membership } from '../../common/request';
import { DAY } from '../../common/time';
import type { Config } from '../../config';
import { type Database, type Executor, one } from '../../db/client';
import { invitations, users, userConsents, workspaceMembers, workspaces } from '../../db/schema';
import { afterScopedCommit, scopedTx } from '../../db/scope';
import { AuditService } from '../audit/audit.service';
import { hashToken } from '../auth/token.service';
import { EntitlementsService } from '../billing/entitlements.service';
import { MailService } from '../mailer/mail.service';
import { invitationTemplate } from '../mailer/templates';
import { workspaceColumns } from '../workspaces/workspaces.service';
import { emailsOf, ownerOf } from './sharing';

/** How long an Invitation can be accepted. */
export const INVITATION_TTL_DAYS = 7;

const columns = {
  id: invitations.id,
  email: invitations.email,
  role: invitations.role,
  invitedByUserId: invitations.invitedByUserId,
  createdAt: invitations.createdAt,
  expiresAt: invitations.expiresAt,
  acceptedAt: invitations.acceptedAt,
  revokedAt: invitations.revokedAt,
};

interface Row {
  id: string;
  email: string | null;
  role: Invitation['role'];
  invitedByUserId: string | null;
  createdAt: Date;
  expiresAt: Date;
  acceptedAt: Date | null;
  revokedAt: Date | null;
}

function statusOf(row: Row, now: Date): InvitationStatus {
  if (row.acceptedAt) return 'ACCEPTED';
  if (row.revokedAt) return 'REVOKED';
  if (row.expiresAt <= now) return 'EXPIRED';
  return 'PENDING';
}

const invalidInvitation = () =>
  new BadRequestException('The invitation is invalid, used, revoked or expired');

const sharingNotEntitled = () =>
  new HttpException(
    "Sharing this Workspace needs its Owner's Daric Plus",
    HttpStatus.PAYMENT_REQUIRED,
  );

const refused = (reason: InvitationRefusal, message: string) =>
  new ForbiddenException({ statusCode: 403, message, reason });

/**
 * Invitations into a Workspace. Creating, listing and revoking run in
 * Workspace scope; looking one up by its token and accepting it run on the
 * owner connection, since the person holding the link is not a Member yet.
 * Sharing is the Owner's Entitlement (ADR-0008), whoever sends the Invitation.
 */
@Injectable()
export class InvitationsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(CONFIG) private readonly config: Config,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(EntitlementsService) private readonly entitlements: EntitlementsService,
    @Inject(MailService) private readonly mail: MailService,
  ) {}

  async list(membership: Membership): Promise<InvitationList> {
    const tx = scopedTx();
    const rows = await tx
      .select(columns)
      .from(invitations)
      .orderBy(desc(invitations.createdAt), desc(invitations.id));
    return {
      sharingAllowed: await this.sharingAllowed(tx, membership.workspaceId),
      invitations: await this.view(rows),
    };
  }

  async create(
    membership: Membership,
    userId: string,
    input: CreateInvitationInput,
    client: ClientInfo,
  ): Promise<CreatedInvitation> {
    const { workspaceId } = membership;
    if (!rolesAssignableBy(membership.role).includes(input.role)) throw new ForbiddenException();
    const tx = scopedTx();
    if (!(await this.sharingAllowed(tx, workspaceId))) throw sharingNotEntitled();
    const now = new Date();
    if (input.email) await this.assertInvitable(tx, input.email, now);

    const token = randomBytes(32).toString('base64url');
    const row = one(
      await tx
        .insert(invitations)
        .values({
          workspaceId,
          email: input.email ?? null,
          role: input.role,
          tokenHash: hashToken(token),
          invitedByUserId: userId,
          expiresAt: new Date(now.getTime() + INVITATION_TTL_DAYS * DAY),
          createdAt: now,
        })
        .returning(columns),
    );
    await this.audit.record(tx, {
      action: 'invitation.create',
      actorUserId: userId,
      workspaceId,
      client,
      metadata: { invitationId: row.id, role: row.role, mailed: Boolean(input.email) },
    });

    const link = this.link(token);
    const invitation = one(await this.view([row]));
    if (input.email) {
      const to = input.email;
      const [workspace] = await tx
        .select({ name: workspaces.name })
        .from(workspaces)
        .where(eq(workspaces.id, workspaceId));
      const [inviter] = await this.db
        .select({ email: users.email, locale: users.locale })
        .from(users)
        .where(eq(users.id, userId));
      if (workspace && inviter) {
        // The invitee may not be a User yet, so the mail is in the inviter's language.
        const message = invitationTemplate(
          inviter.locale,
          { inviterEmail: inviter.email, workspaceName: workspace.name, role: row.role },
          link,
          INVITATION_TTL_DAYS,
        );
        afterScopedCommit(() => this.mail.deliver({ to, ...message }));
      }
    }
    return { ...invitation, link };
  }

  /** Owner or Admin; an Admin only for the Roles they may give. */
  async revoke(
    membership: Membership,
    userId: string,
    invitationId: string,
    client: ClientInfo,
  ): Promise<void> {
    if (!isUuid(invitationId)) throw new NotFoundException();
    const tx = scopedTx();
    const [row] = await tx
      .select(columns)
      .from(invitations)
      .where(eq(invitations.id, invitationId))
      .for('update');
    if (!row) throw new NotFoundException();
    if (!mayManageMember(membership.role, row.role)) throw new ForbiddenException();
    const now = new Date();
    if (statusOf(row, now) !== 'PENDING') {
      throw new ConflictException('The invitation is no longer pending');
    }
    await tx.update(invitations).set({ revokedAt: now }).where(eq(invitations.id, row.id));
    await this.audit.record(tx, {
      action: 'invitation.revoke',
      actorUserId: userId,
      workspaceId: membership.workspaceId,
      client,
      metadata: { invitationId: row.id, role: row.role },
    });
  }

  async preview(token: string): Promise<InvitationPreview> {
    const found = await this.pending(this.db, token);
    if (!found) throw invalidInvitation();
    const emails = await emailsOf(this.db, [found.invitedByUserId]);
    return {
      workspaceName: found.workspaceName,
      role: found.role,
      invitedByEmail: found.invitedByUserId ? (emails.get(found.invitedByUserId) ?? null) : null,
      email: found.email,
      expiresAt: found.expiresAt.toISOString(),
    };
  }

  /**
   * Makes the User a Member with the Invitation's Role and records their
   * sharing Consent. Needs a verified email (the invited one, if any) but no
   * Plan of their own; the Owner must still be entitled to share.
   */
  async accept(userId: string, token: string, client: ClientInfo): Promise<AcceptedInvitation> {
    return this.db.transaction(async (tx) => {
      const found = await this.pending(tx, token, { lock: true });
      if (!found) throw invalidInvitation();
      const user = one(
        await tx
          .select({ email: users.email, verifiedAt: users.emailVerifiedAt })
          .from(users)
          .where(eq(users.id, userId)),
      );
      if (!user.verifiedAt) {
        throw refused('EMAIL_NOT_VERIFIED', 'Verify your email before accepting an invitation');
      }
      if (found.email && found.email !== user.email.toLowerCase()) {
        throw refused('EMAIL_MISMATCH', 'This invitation is for another email');
      }
      const [already] = await tx
        .select({ id: workspaceMembers.id })
        .from(workspaceMembers)
        .where(
          and(
            eq(workspaceMembers.workspaceId, found.workspaceId),
            eq(workspaceMembers.userId, userId),
          ),
        );
      if (already) throw new ConflictException('Already a Member of this Workspace');
      if (!(await this.sharingAllowed(tx, found.workspaceId))) throw sharingNotEntitled();

      const { workspaceId, role } = found;
      await tx.insert(workspaceMembers).values({ workspaceId, userId, role });
      const now = new Date();
      await tx
        .update(invitations)
        .set({ acceptedAt: now, acceptedByUserId: userId })
        .where(eq(invitations.id, found.id));
      const consent = one(
        await tx
          .insert(userConsents)
          .values({
            userId,
            workspaceId,
            purpose: 'WORKSPACE_SHARING',
            policyVersion: consentPolicyVersions.WORKSPACE_SHARING,
            grantedAt: now,
          })
          .returning({ id: userConsents.id }),
      );
      await this.audit.record(tx, {
        action: 'invitation.accept',
        actorUserId: userId,
        workspaceId,
        client,
        metadata: { invitationId: found.id, role },
      });
      await this.audit.record(tx, {
        action: 'consent.grant',
        actorUserId: userId,
        workspaceId,
        client,
        metadata: { consentId: consent.id, purpose: 'WORKSPACE_SHARING' },
      });
      const workspace = one(
        await tx.select(workspaceColumns).from(workspaces).where(eq(workspaces.id, workspaceId)),
      );
      return { workspace: { ...workspace, role } };
    });
  }

  /** Whether the Workspace's Owner may share it under their Plan. */
  private async sharingAllowed(db: Executor, workspaceId: string): Promise<boolean> {
    const owner = await ownerOf(db, workspaceId);
    return (await this.entitlements.entitlementsOf(owner)).shareWorkspace;
  }

  /** Refuses an email that is already a Member, or already has a pending Invitation. */
  private async assertInvitable(db: Executor, email: string, now: Date): Promise<void> {
    const [pending] = await db
      .select({ id: invitations.id })
      .from(invitations)
      .where(
        and(
          eq(invitations.email, email),
          isNull(invitations.acceptedAt),
          isNull(invitations.revokedAt),
          gt(invitations.expiresAt, now),
        ),
      );
    if (pending) throw new ConflictException('This email already has a pending invitation');
    const [user] = await this.db
      .select({ id: users.id })
      .from(users)
      .where(sql`lower(${users.email}) = ${email}`);
    if (!user) return;
    const [member] = await db
      .select({ id: workspaceMembers.id })
      .from(workspaceMembers)
      .where(eq(workspaceMembers.userId, user.id));
    if (member) throw new ConflictException('This email is already a Member');
  }

  /** The pending Invitation a token belongs to, with its Workspace's name; null otherwise. */
  private async pending(db: Executor, token: string, { lock = false } = {}) {
    const query = db
      .select({
        ...columns,
        workspaceId: invitations.workspaceId,
        workspaceName: workspaces.name,
      })
      .from(invitations)
      .innerJoin(workspaces, eq(workspaces.id, invitations.workspaceId))
      .where(eq(invitations.tokenHash, hashToken(token)));
    const [row] = lock ? await query.for('update', { of: invitations }) : await query;
    if (!row || statusOf(row, new Date()) !== 'PENDING') return null;
    return row;
  }

  private async view(rows: Row[]): Promise<Invitation[]> {
    const now = new Date();
    const emails = await emailsOf(
      this.db,
      rows.map((r) => r.invitedByUserId),
    );
    return rows.map((row) => ({
      id: row.id,
      email: row.email,
      role: row.role,
      status: statusOf(row, now),
      invitedByEmail: row.invitedByUserId ? (emails.get(row.invitedByUserId) ?? null) : null,
      createdAt: row.createdAt.toISOString(),
      expiresAt: row.expiresAt.toISOString(),
    }));
  }

  private link(token: string): string {
    const url = new URL('/invitation', `${this.config.APP_URL}/`);
    url.searchParams.set('token', token);
    return url.toString();
  }
}
