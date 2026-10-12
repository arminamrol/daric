import { Get, Inject, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { reportQuerySchema, reportSchema } from '@daric/core';
import { createZodDto, ZodValidationPipe } from 'nestjs-zod';
import { CurrentMembership, type Membership } from '../../common/request';
import { WorkspaceController } from '../../common/workspace-route';
import { ReportsService } from './reports.service';

class ReportDto extends createZodDto(reportSchema) {}
class ReportQueryDto extends createZodDto(reportQuerySchema) {}

@ApiTags('reports')
@ApiNotFoundResponse({ description: 'No such Workspace, or the caller is not a Member' })
@WorkspaceController('reports')
export class ReportsController {
  constructor(@Inject(ReportsService) private readonly reports: ReportsService) {}

  @Get()
  @ApiQuery({
    name: 'period',
    required: false,
    description:
      'A month (`1405-07`) or year (`1405`) of the Workspace Calendar; the current month by default',
  })
  @ApiOkResponse({
    type: ReportDto,
    description:
      'The Period’s Income, Expense and net, Category and Label breakdowns, and the trend of the twelve months up to it, in the Base Currency',
  })
  @ApiBadRequestResponse({ description: 'A period that is neither YYYY nor YYYY-MM' })
  get(
    @CurrentMembership() membership: Membership,
    @Query(new ZodValidationPipe(ReportQueryDto)) query: ReportQueryDto,
  ) {
    return this.reports.get(membership, query.period);
  }
}
