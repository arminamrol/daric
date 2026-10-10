import { Controller, Get, Inject, NotFoundException, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import {
  meSchema,
  updateUserPreferencesInputSchema,
  userPreferencesSchema,
  type Me,
  type UserPreferences,
} from '@daric/core';
import { eq } from 'drizzle-orm';
import { createZodDto } from 'nestjs-zod';
import { CurrentUserId } from '../../common/request';
import { ZodBody } from '../../common/zod';
import { DATABASE } from '../../common/di-tokens';
import type { Database } from '../../db/client';
import { users } from '../../db/schema';
import { WorkspacesService } from '../workspaces/workspaces.service';

class MeDto extends createZodDto(meSchema) {}
class UserPreferencesDto extends createZodDto(userPreferencesSchema) {}
class UpdateUserPreferencesDto extends createZodDto(updateUserPreferencesInputSchema) {}

const preferenceColumns = {
  displayCalendar: users.displayCalendar,
  digits: users.digits,
  theme: users.theme,
};

@ApiTags('me')
@ApiBearerAuth()
@Controller('v1/me')
export class MeController {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(WorkspacesService) private readonly workspaces: WorkspacesService,
  ) {}

  @Get()
  @ApiOkResponse({ type: MeDto })
  async get(@CurrentUserId() userId: string): Promise<Me> {
    const [row] = await this.db
      .select({ id: users.id, email: users.email, preferences: preferenceColumns })
      .from(users)
      .where(eq(users.id, userId));
    if (!row) throw new NotFoundException();
    const { preferences, ...user } = row;
    return { user, preferences, workspaces: await this.workspaces.listForUser(userId) };
  }

  /** Preferences only change how things are drawn, so any User may set their own. */
  @Patch('preferences')
  @ApiOkResponse({ type: UserPreferencesDto })
  async updatePreferences(
    @CurrentUserId() userId: string,
    @ZodBody(UpdateUserPreferencesDto) body: UpdateUserPreferencesDto,
  ): Promise<UserPreferences> {
    const [preferences] = await this.db
      .update(users)
      .set(body)
      .where(eq(users.id, userId))
      .returning(preferenceColumns);
    if (!preferences) throw new NotFoundException();
    return preferences;
  }
}
