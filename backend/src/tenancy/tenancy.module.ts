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
import { CosStorageService } from './cos-storage.service';
import { InspectionPhotoService } from './inspection-photo.service';
import { InspectionPhotoController } from './inspection-photo.controller';

@Module({
  controllers: [TenantContextController, TenantMembershipController, InspectionOrderController, ReportController, PublicReportController, InspectionPhotoController],
  providers: [PermissionsGuard, TenantContextGuard, TenantProvisioningService, TenantMembershipService, InspectionOrderService, InspectionReviewService, ReportService, CosStorageService, InspectionPhotoService],
  exports: [PermissionsGuard, TenantContextGuard, TenantProvisioningService, TenantMembershipService, InspectionOrderService, InspectionReviewService, ReportService],
})
export class TenancyModule {}