import { Module } from '@nestjs/common';
import { TenantContextController } from './tenant-context.controller';
import { PermissionsGuard } from './permissions.guard';
import { TenantContextGuard } from './tenant-context.guard';
import { TenantProvisioningService } from './tenant-provisioning.service';

@Module({
  controllers: [TenantContextController],
  providers: [PermissionsGuard, TenantContextGuard, TenantProvisioningService],
  exports: [PermissionsGuard, TenantContextGuard, TenantProvisioningService],
})
export class TenancyModule {}