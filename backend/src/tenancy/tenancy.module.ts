import { Module } from '@nestjs/common';
import { TenantContextController } from './tenant-context.controller';
import { TenantMembershipController } from './tenant-membership.controller';
import { PermissionsGuard } from './permissions.guard';
import { TenantContextGuard } from './tenant-context.guard';
import { TenantProvisioningService } from './tenant-provisioning.service';
import { TenantMembershipService } from './tenant-membership.service';
import { InspectionOrderController } from './inspection-order.controller';
import { InspectionOrderService } from './inspection-order.service';
import { InspectionReviewService } from './inspection-review.service';
import { ReportController, PublicReportController } from './report.controller';
import { ReportService } from './report.service';

@Module({
  controllers: [TenantContextController, TenantMembershipController, InspectionOrderController, ReportController, PublicReportController],
  providers: [PermissionsGuard, TenantContextGuard, TenantProvisioningService, TenantMembershipService, InspectionOrderService, InspectionReviewService, ReportService],
  exports: [PermissionsGuard, TenantContextGuard, TenantProvisioningService, TenantMembershipService, InspectionOrderService, InspectionReviewService, ReportService],
})
export class TenancyModule {}