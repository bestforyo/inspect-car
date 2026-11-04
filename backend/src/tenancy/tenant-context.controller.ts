import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthUser } from '../auth/auth-user.interface';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequirePermissions } from './permissions.decorator';
import { PermissionsGuard } from './permissions.guard';
import { TenantContextGuard } from './tenant-context.guard';

@ApiTags('tenant-context')
@ApiBearerAuth()
@Controller('tenants/:tenantId/context')
@UseGuards(JwtAuthGuard, TenantContextGuard, PermissionsGuard)
export class TenantContextController {
  @Get()
  @RequirePermissions('tenant:read')
  @ApiOperation({ summary: 'Verify active tenant membership and tenant:read permission' })
  getContext(@Param('tenantId') tenantId: string, @CurrentUser() user: AuthUser) {
    return { tenantId, membershipId: user.membershipId, roles: user.roles };
  }
}
