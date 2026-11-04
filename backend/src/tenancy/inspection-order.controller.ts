import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthUser } from '../auth/auth-user.interface';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequirePermissions } from './permissions.decorator';
import { PermissionsGuard } from './permissions.guard';
import { TenantContextGuard } from './tenant-context.guard';
import { InspectionOrderService } from './inspection-order.service';
import { CreateInspectionOrderDto, SaveInspectionRecordDto } from './dto/inspection-order.dto';

@ApiTags('inspection-orders')
@ApiBearerAuth()
@Controller('tenants/:tenantId/orders')
@UseGuards(JwtAuthGuard, TenantContextGuard, PermissionsGuard)
export class InspectionOrderController {
  constructor(private readonly orders: InspectionOrderService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('tenant:orders:manage')
  @ApiOperation({ summary: 'Create an inspection order with a published, entitled template version' })
  create(
    @Param('tenantId') tenantId: string,
    @CurrentUser() user: AuthUser,
    @Body() body: CreateInspectionOrderDto,
  ) {
    return this.orders.create({
      tenantId,
      actorMembershipId: user.membershipId,
      templateVersionId: body.templateVersionId,
      assignedToMembershipId: body.assignedToMembershipId,
      vin: body.vin,
      plateNumber: body.plateNumber,
      brandModel: body.brandModel,
      color: body.color,
      odometerKm: body.odometerKm,
    });
  }

  @Get()
  @RequirePermissions('tenant:orders:read')
  @ApiOperation({ summary: 'List inspection orders belonging to the active institution' })
  list(
    @Param('tenantId') tenantId: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('status') status?: string,
  ) {
    return this.orders.list(tenantId, Number(page ?? 1), Number(pageSize ?? 20), status);
  }

  @Get(':orderId')
  @RequirePermissions('tenant:orders:read')
  @ApiOperation({ summary: 'Get an institution-scoped order, template items and saved records' })
  get(@Param('tenantId') tenantId: string, @Param('orderId') orderId: string) {
    return this.orders.get(tenantId, orderId);
  }

  @Put(':orderId/records/:itemId')
  @RequirePermissions('tenant:orders:manage')
  @ApiOperation({ summary: 'Save or update a record for an item in the order template version' })
  saveRecord(
    @Param('tenantId') tenantId: string,
    @Param('orderId') orderId: string,
    @Param('itemId') itemId: string,
    @CurrentUser() user: AuthUser,
    @Body() body: SaveInspectionRecordDto,
  ) {
    return this.orders.saveRecord(tenantId, orderId, itemId, user.membershipId, body);
  }

  @Post(':orderId/submissions')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('tenant:orders:manage')
  @ApiOperation({ summary: 'Submit a completed inspection to the institution review queue' })
  submit(
    @Param('tenantId') tenantId: string,
    @Param('orderId') orderId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.orders.submit(tenantId, orderId, user.membershipId);
  }
}
