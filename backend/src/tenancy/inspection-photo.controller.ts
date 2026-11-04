import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthUser } from '../auth/auth-user.interface';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequirePermissions } from './permissions.decorator';
import { PermissionsGuard } from './permissions.guard';
import { TenantContextGuard } from './tenant-context.guard';
import { CreatePhotoUploadDto } from './dto/create-photo-upload.dto';
import { InspectionPhotoService } from './inspection-photo.service';

@ApiTags('inspection-photos')
@ApiBearerAuth()
@Controller('tenants/:tenantId/orders/:orderId/photos')
@UseGuards(JwtAuthGuard, TenantContextGuard, PermissionsGuard)
export class InspectionPhotoController {
  constructor(private readonly photos: InspectionPhotoService) {}
  @Post('upload-url')
  @RequirePermissions('tenant:orders:manage')
  @ApiOperation({summary:'Create a short-lived direct-to-COS upload URL for an inspection photo'})
  create(@Param('tenantId') tenantId:string,@Param('orderId') orderId:string,@CurrentUser() user:AuthUser,@Body() body:CreatePhotoUploadDto) {
    return this.photos.createUpload(tenantId,orderId,user.membershipId,body);
  }
  @Post(':photoId/complete')
  @RequirePermissions('tenant:orders:manage')
  @ApiOperation({summary:'Verify the uploaded COS object and register it against an inspection record'})
  complete(@Param('tenantId') tenantId:string,@Param('orderId') orderId:string,@Param('photoId') photoId:string,@CurrentUser() user:AuthUser,@Body() body:CreatePhotoUploadDto) {
    return this.photos.complete(tenantId,orderId,photoId,user.membershipId,body);
  }
}
