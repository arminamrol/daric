import { z } from 'zod';
import { calendarSystems, canonicalTimeZone } from '../calendar';
import { digitSystems } from '../locale';
import { currencies, moneyDisplays } from '../money';
import { userSchema } from './auth';
import { notEmpty } from './partial';

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
  /** The Workspace Calendar; it alone defines Periods (ADR-0002). */
  calendar: z.enum(calendarSystems),
  timezone: z.string(),
  /** Whether IRR is shown and typed as rials or tomans. */
  moneyDisplay: z.enum(moneyDisplays),
  role: workspaceRoleSchema,
});
export type Workspace = z.infer<typeof workspaceSchema>;

export const baseCurrencyCodes = currencies.map((c) => c.code);

/** An IANA timezone name, stored in its canonical spelling. */
const timeZoneSchema = z
  .string()
  .max(64)
  .transform((value, ctx) => {
    const name = canonicalTimeZone(value);
    if (name) return name;
    ctx.addIssue({ code: 'custom', message: 'Unknown timezone' });
    return z.NEVER;
  });

/** Workspace settings an Owner or Admin may change; at least one per request. */
export const updateWorkspaceInputSchema = z
  .object({
    name: z.string().trim().min(1).max(100).exactOptional(),
    baseCurrency: z
      .string()
      .refine((code) => baseCurrencyCodes.includes(code), { message: 'Unsupported currency' })
      .exactOptional(),
    calendar: z.enum(calendarSystems).exactOptional(),
    timezone: timeZoneSchema.exactOptional(),
    moneyDisplay: z.enum(moneyDisplays).exactOptional(),
  })
  .refine(...notEmpty);
export type UpdateWorkspaceInput = z.infer<typeof updateWorkspaceInputSchema>;

export const themePreferences = ['system', 'light', 'dark'] as const;
export type ThemePreference = (typeof themePreferences)[number];

/** How one User likes things drawn, in every Workspace; it never changes what is stored. */
export const userPreferencesSchema = z.object({
  /** Changes how dates are shown, never how Periods are bucketed. */
  displayCalendar: z.enum(calendarSystems),
  digits: z.enum(digitSystems),
  theme: z.enum(themePreferences),
});
export type UserPreferences = z.infer<typeof userPreferencesSchema>;

export const updateUserPreferencesInputSchema = z
  .object({
    displayCalendar: z.enum(calendarSystems).exactOptional(),
    digits: z.enum(digitSystems).exactOptional(),
    theme: z.enum(themePreferences).exactOptional(),
  })
  .refine(...notEmpty);
export type UpdateUserPreferencesInput = z.infer<typeof updateUserPreferencesInputSchema>;

export const meSchema = z.object({
  user: userSchema,
  preferences: userPreferencesSchema,
  workspaces: z.array(workspaceSchema),
});
export type Me = z.infer<typeof meSchema>;
