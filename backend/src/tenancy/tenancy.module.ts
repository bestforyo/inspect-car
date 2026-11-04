import { Module } from '@nestjs/common';
import { TenantContextController } from './tenant-context.controller';
import { PermissionsGuard } from './permissions.guard';
import { TenantContextGuard } from './tenant-context.guard';
import { TenantProvisioningService } from './tenant-provisioning.service';
import { TenantMembershipService } from './tenant-membership.service';

@Module({
  controllers: [TenantContextController],
  providers: [PermissionsGuard, TenantContextGuard, TenantProvisioningService, TenantMembershipService],
  exports: [PermissionsGuard, TenantContextGuard, TenantProvisioningService, TenantMembershipService],
})
export class TenancyModule {}