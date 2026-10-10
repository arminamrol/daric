import { Controller, Get, Inject, NotFoundException } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { meSchema, type Me } from '@daric/core';
import { eq } from 'drizzle-orm';
import { createZodDto } from 'nestjs-zod';
import { CurrentUserId } from '../../common/request';
import { DATABASE } from '../../common/di-tokens';
import type { Database } from '../../db/client';
import { users } from '../../db/schema';
import { WorkspacesService } from '../workspaces/workspaces.service';

class MeDto extends createZodDto(meSchema) {}

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
    const [user] = await this.db
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(eq(users.id, userId));
    if (!user) throw new NotFoundException();
    return { user, workspaces: await this.workspaces.listForUser(userId) };
  }
}
