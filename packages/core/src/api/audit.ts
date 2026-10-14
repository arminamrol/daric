import { z } from 'zod';

/** Everything the audit log records. Append new actions at the end. */
export const auditActions = [
  'auth.register',
  'auth.login',
  'auth.login_failed',
  'auth.logout',
  'auth.refresh_reuse',
  'auth.email_verified',
  'auth.password_reset_requested',
  'auth.password_reset',
  'workspace.update',
  'workspace.export',
  'account.create',
  'account.update',
  'category.create',
  'category.update',
  'category.reorder',
  'label.create',
  'label.update',
  'budget.create',
  'budget.update',
  'budget.delete',
  'exchange_rate.create',
  'exchange_rate.update',
  'exchange_rate.delete',
  'valuation.create',
  'valuation.update',
  'valuation.delete',
  'net_worth_snapshot.create',
  'projection_settings.update',
  'planned_item.create',
  'planned_item.update',
  'planned_item.delete',
  'recurring.create',
  'recurring.update',
  'recurring.confirm',
  'recurring.skip',
  'recurring.auto_post',
  'transaction.create',
  'transaction.update',
  'transaction.delete',
  'transaction.restore',
  'transaction.label_attach',
  'transaction.label_detach',
  'invitation.create',
  'invitation.revoke',
  'invitation.accept',
  'member.role_change',
  'member.remove',
  'member.leave',
  'consent.grant',
  'consent.revoke',
] as const;
export type AuditAction = (typeof auditActions)[number];

/** Ids, Roles and field names only: never Amounts, notes, tokens, IPs or emails. */
export const auditMetadataSchema = z.record(
  z.string(),
  z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]),
);
export type AuditMetadata = z.infer<typeof auditMetadataSchema>;

/** One row of a Workspace's audit log as its Owner sees it. */
export const auditEntrySchema = z.object({
  id: z.uuid(),
  /** Unknown actions (from a newer server) stay readable as their raw name. */
  action: z.string(),
  /** Null for events without a User, or once that User is gone. */
  actorEmail: z.email().nullable(),
  metadata: auditMetadataSchema,
  createdAt: z.iso.datetime(),
});
export type AuditEntry = z.infer<typeof auditEntrySchema>;

/** A page of the audit log, newest first; `next` fetches the older page, null at the end. */
export const auditPageSchema = z.object({
  entries: z.array(auditEntrySchema),
  next: z.uuid().nullable(),
});
export type AuditPage = z.infer<typeof auditPageSchema>;

export const auditQuerySchema = z.object({
  /** The `next` of the previous page. */
  before: z.uuid().exactOptional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type AuditQuery = z.infer<typeof auditQuerySchema>;
