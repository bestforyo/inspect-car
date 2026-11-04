import { Module } from '@nestjs/common';
import { TenantContextController } from './tenant-context.controller';
import { PermissionsGuard } from './permissions.guard';
import { TenantContextGuard } from './tenant-context.guard';

@Module({
  controllers: [TenantContextController],
  providers: [PermissionsGuard, TenantContextGuard],
  exports: [PermissionsGuard, TenantContextGuard],
})
export class TenancyModule {}