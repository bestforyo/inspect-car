import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthUser } from '../auth/auth-user.interface';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequirePermissions } from './permissions.decorator';
import { PermissionsGuard } from './permissions.guard';
import { TenantContextGuard } from './tenant-context.guard';
import { TenantMembershipService } from './tenant-membership.service';
import { AssignTenantRolesDto, CreateTenantInvitationDto, CreateTenantRoleDto } from './dto/tenant-membership.dto';

@ApiTags('tenant-members')
@ApiBearerAuth()
@Controller('tenants/:tenantId')
@UseGuards(JwtAuthGuard, TenantContextGuard, PermissionsGuard)
export class TenantMembershipController {
  constructor(private readonly memberships: TenantMembershipService) {}

  @Get('members')
  @RequirePermissions('tenant:members:manage')
  @ApiOperation({ summary: 'List members and assigned roles in this institution' })
  listMembers(@Param('tenantId') tenantId: string) {
    return this.memberships.listMembers(tenantId);
  }

  @Get('roles')
  @RequirePermissions('tenant:members:manage')
  @ApiOperation({ summary: 'List tenant-local roles and their permissions' })
  listRoles(@Param('tenantId') tenantId: string) {
    return this.memberships.listRoles(tenantId);
  }

  @Post('invitations')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('tenant:members:manage')
  @ApiOperation({ summary: 'Create a one-time invitation for this institution' })
  createInvitation(
    @Param('tenantId') tenantId: string,
    @CurrentUser() user: AuthUser,
    @Body() body: CreateTenantInvitationDto,
  ) {
    return this.memberships.createInvitation({
      tenantId,
      actorMembershipId: user.membershipId,
      phone: body.phone,
      email: body.email,
      roleIds: body.roleIds,
      expiresInHours: body.expiresInHours,
    });
  }

  @Post('invitations/:invitationId/revoke')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('tenant:members:manage')
  @ApiOperation({ summary: 'Revoke an unused invitation in this institution' })
  async revokeInvitation(
    @Param('tenantId') tenantId: string,
    @Param('invitationId') invitationId: string,
    @CurrentUser() user: AuthUser,
  ): Promise<void> {
    await this.memberships.revokeInvitation(tenantId, invitationId, user.membershipId);
  }

  @Post('roles')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('tenant:members:manage')
  @ApiOperation({ summary: 'Create a tenant-local custom role' })
  createRole(
    @Param('tenantId') tenantId: string,
    @CurrentUser() user: AuthUser,
    @Body() body: CreateTenantRoleDto,
  ) {
    return this.memberships.createRole(
      tenantId, user.membershipId, body.code, body.name, body.permissionCodes,
    );
  }

  @Post('members/:membershipId/roles')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('tenant:members:manage')
  @ApiOperation({ summary: 'Replace roles assigned to an active institution member' })
  async assignRoles(
    @Param('tenantId') tenantId: string,
    @Param('membershipId') membershipId: string,
    @CurrentUser() user: AuthUser,
    @Body() body: AssignTenantRolesDto,
  ): Promise<void> {
    await this.memberships.assignRoles(tenantId, membershipId, user.membershipId, body.roleIds);
  }

  @Patch('members/:membershipId/status')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('tenant:members:manage')
  @ApiOperation({ summary: 'Suspend an active institution membership' })
  async suspendMember(
    @Param('tenantId') tenantId: string,
    @Param('membershipId') membershipId: string,
    @CurrentUser() user: AuthUser,
  ): Promise<void> {
    await this.memberships.disableMembership(tenantId, membershipId, user.membershipId);
  }
}
