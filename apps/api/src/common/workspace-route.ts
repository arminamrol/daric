import { applyDecorators, Controller, UseGuards, UseInterceptors } from '@nestjs/common';
import { ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { RolesGuard, WorkspaceGuard } from './workspace.guard';
import { WorkspaceScopeInterceptor } from './workspace-scope.interceptor';

/**
 * A controller under `/v1/workspaces/:wsId/<path>`: membership and Role are
 * checked, and every handler runs in a Workspace-scoped transaction.
 */
export function WorkspaceController(path = '') {
  return applyDecorators(
    Controller(`v1/workspaces/:wsId${path ? `/${path}` : ''}`),
    UseGuards(WorkspaceGuard, RolesGuard),
    UseInterceptors(WorkspaceScopeInterceptor),
    ApiBearerAuth(),
    ApiParam({ name: 'wsId', format: 'uuid' }),
  );
}
