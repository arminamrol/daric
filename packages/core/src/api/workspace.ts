import { z } from 'zod';
import { calendarSystems } from '../calendar';
import { userSchema } from './auth';

export const workspaceTypes = ['PERSONAL', 'BUSINESS'] as const;
export const workspaceTypeSchema = z.enum(workspaceTypes);
export type WorkspaceType = z.infer<typeof workspaceTypeSchema>;

/** Highest first; a Role may do everything the Roles after it may do. */
export const workspaceRoles = ['OWNER', 'ADMIN', 'MEMBER', 'VIEWER'] as const;
export const workspaceRoleSchema = z.enum(workspaceRoles);
export type WorkspaceRole = z.infer<typeof workspaceRoleSchema>;

/** Whether `role` is at least as powerful as `minimum`. */
export function hasRole(role: WorkspaceRole, minimum: WorkspaceRole): boolean {
  return workspaceRoles.indexOf(role) <= workspaceRoles.indexOf(minimum);
}

export const workspaceSchema = z.object({
  id: z.uuid(),
  type: workspaceTypeSchema,
  name: z.string(),
  baseCurrency: z.string(),
  calendar: z.enum(calendarSystems),
  timezone: z.string(),
  role: workspaceRoleSchema,
});
export type Workspace = z.infer<typeof workspaceSchema>;

export const updateWorkspaceInputSchema = z.object({
  name: z.string().trim().min(1).max(100),
});
export type UpdateWorkspaceInput = z.infer<typeof updateWorkspaceInputSchema>;

export const meSchema = z.object({
  user: userSchema,
  workspaces: z.array(workspaceSchema),
});
export type Me = z.infer<typeof meSchema>;
