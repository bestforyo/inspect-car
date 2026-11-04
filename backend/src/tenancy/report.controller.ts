import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthUser } from '../auth/auth-user.interface';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateReportShareDto } from './dto/create-report-share.dto';
import { RequirePermissions } from './permissions.decorator';
import { PermissionsGuard } from './permissions.guard';
import { ReportService } from './report.service';
import { TenantContextGuard } from './tenant-context.guard';

@ApiTags('reports')
@ApiBearerAuth()
@Controller('tenants/:tenantId/reports')
@UseGuards(JwtAuthGuard, TenantContextGuard, PermissionsGuard)
export class ReportController {
  constructor(private readonly reports: ReportService) {}

  @Post(':reportId/publication')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('tenant:reports:publish')
  @ApiOperation({ summary: 'Publish the latest approved report version' })
  publish(@Param('tenantId') tenantId: string, @Param('reportId') reportId: string, @CurrentUser() user: AuthUser) {
    return this.reports.publish(tenantId, reportId, user.membershipId);
  }

  @Post(':reportId/shares')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('tenant:reports:share')
  @ApiOperation({ summary: 'Create a one-time customer share token for a published report' })
  createShare(@Param('tenantId') tenantId: string, @Param('reportId') reportId: string, @CurrentUser() user: AuthUser, @Body() body: CreateReportShareDto) {
    return this.reports.createShare(tenantId, reportId, user.membershipId, body.expiresInDays ?? 30);
  }

  @Delete(':reportId/shares/:shareId')
  @RequirePermissions('tenant:reports:share')
  @ApiOperation({ summary: 'Revoke one customer share link' })
  revokeShare(@Param('tenantId') tenantId: string, @Param('reportId') reportId: string, @Param('shareId') shareId: string, @CurrentUser() user: AuthUser) {
    return this.reports.revokeShare(tenantId, reportId, shareId, user.membershipId);
  }

  @Post(':reportId/revocation')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('tenant:reports:publish')
  @ApiOperation({ summary: 'Revoke a published report and all of its customer share links' })
  revokePublication(@Param('tenantId') tenantId: string, @Param('reportId') reportId: string, @CurrentUser() user: AuthUser) {
    return this.reports.revokePublication(tenantId, reportId, user.membershipId);
  }
}

@ApiTags('public-reports')
@Controller('public/reports')
export class PublicReportController {
  constructor(private readonly reports: ReportService) {}

  @Get(':token')
  @ApiOperation({ summary: 'Read a published report using its customer share token; no account required' })
  get(@Param('token') token: string) {
    return this.reports.getPublicReport(token);
  }
}
