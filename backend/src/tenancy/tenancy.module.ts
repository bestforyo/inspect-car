import { Module } from '@nestjs/common';
import { PermissionsGuard } from './permissions.guard';
import { TenantContextGuard } from './tenant-context.guard';

@Module({
  providers: [PermissionsGuard, TenantContextGuard],
  exports: [PermissionsGuard, TenantContextGuard],
})
export class TenancyModule {}