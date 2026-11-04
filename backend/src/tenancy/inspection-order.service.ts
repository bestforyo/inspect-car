import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../database/prisma.service';

interface CreateOrderInput {
  tenantId: string;
  actorMembershipId: string;
  templateVersionId: string;
  assignedToMembershipId?: string;
  vin?: string;
  plateNumber?: string;
  brandModel?: string;
  color?: string;
  odometerKm?: number;
}

@Injectable()
export class InspectionOrderService {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateOrderInput) {
    const orderId = randomUUID();
    const vehicleId = randomUUID();
    const orderNumber = `CI${new Date().toISOString().slice(0, 10).replace(/-/g, '')}${randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase()}`;

    if (!input.vin?.trim() && !input.plateNumber?.trim() && !input.brandModel?.trim()) {
      throw new BadRequestException('至少填写 VIN、车牌号或品牌车型');
    }

    await this.prisma.$transaction(async (tx) => {
      const template = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT tv.id
        FROM template_versions tv
        JOIN inspection_templates t ON t.id = tv.template_id
        JOIN package_templates pt ON pt.template_id = t.id
        JOIN tenant_packages tp ON tp.package_id = pt.package_id
          AND tp.tenant_id = ${input.tenantId}
          AND tp.status IN ('trial', 'active')
          AND tp.starts_at <= CURRENT_TIMESTAMP
          AND (tp.ends_at IS NULL OR tp.ends_at > CURRENT_TIMESTAMP)
        WHERE tv.id = ${input.templateVersionId}
          AND tv.status = 'published' AND t.status = 'published'
          AND (t.owner_tenant_id IS NULL OR t.owner_tenant_id = ${input.tenantId})
        LIMIT 1
      `;
      if (template.length !== 1) {
        throw new ForbiddenException('检测模板未发布或当前机构套餐未授权该模板');
      }

      if (input.assignedToMembershipId) {
        const assignee = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT id FROM tenant_memberships
          WHERE id = ${input.assignedToMembershipId} AND tenant_id = ${input.tenantId} AND status = 'active'
        `;
        if (assignee.length !== 1) throw new BadRequestException('检测师不是当前机构的有效成员');
      }

      await tx.$executeRaw`
        INSERT INTO vehicles (id, tenant_id, vin, plate_number, brand_model, odometer_km, color)
        VALUES (${vehicleId}, ${input.tenantId}, ${input.vin?.trim() || null},
          ${input.plateNumber?.trim() || null}, ${input.brandModel?.trim() || null},
          ${input.odometerKm ?? null}, ${input.color?.trim() || null})
      `;
      await tx.$executeRaw`
        INSERT INTO orders
          (id, tenant_id, order_number, vehicle_id, template_version_id,
           created_by_membership_id, assigned_to_membership_id, status)
        VALUES (${orderId}, ${input.tenantId}, ${orderNumber}, ${vehicleId},
          ${input.templateVersionId}, ${input.actorMembershipId},
          ${input.assignedToMembershipId ?? input.actorMembershipId}, 'in_progress')
      `;
      await tx.$executeRaw`
        INSERT INTO audit_logs (id, tenant_id, actor_membership_id, action, resource_type, resource_id)
        VALUES (${randomUUID()}, ${input.tenantId}, ${input.actorMembershipId},
          'inspection_order.created', 'order', ${orderId})
      `;
    });

    return { orderId, orderNumber, vehicleId, status: 'in_progress' as const };
  }

  async list(tenantId: string, page = 1, pageSize = 20, status?: string) {
    const safePage = Math.max(1, Math.floor(page));
    const safeSize = Math.min(100, Math.max(1, Math.floor(pageSize)));
    const offset = (safePage - 1) * safeSize;
    const allowedStatuses = ['draft', 'in_progress', 'pending_review', 'needs_revision', 'resubmitted', 'approved', 'published', 'cancelled'];
    if (status && !allowedStatuses.includes(status)) throw new BadRequestException('订单状态筛选值无效');

    const rows = await this.prisma.$queryRaw<Array<Record<string, unknown>>>`
      SELECT o.id AS orderId, o.order_number AS orderNumber, o.status,
        o.created_at AS createdAt, o.updated_at AS updatedAt,
        v.vin, v.plate_number AS plateNumber, v.brand_model AS brandModel,
        t.name AS templateName, tv.version_label AS templateVersion,
        o.assigned_to_membership_id AS assignedToMembershipId
      FROM orders o
      JOIN vehicles v ON v.id = o.vehicle_id AND v.tenant_id = o.tenant_id
      JOIN template_versions tv ON tv.id = o.template_version_id
      JOIN inspection_templates t ON t.id = tv.template_id
      WHERE o.tenant_id = ${tenantId}
        AND (${status ?? null} IS NULL OR o.status = ${status ?? null})
      ORDER BY o.created_at DESC
      LIMIT ${safeSize} OFFSET ${offset}
    `;
    const counts = await this.prisma.$queryRaw<Array<{ total: bigint }>>`
      SELECT COUNT(*) AS total FROM orders
      WHERE tenant_id = ${tenantId} AND (${status ?? null} IS NULL OR status = ${status ?? null})
    `;
    return { items: rows, page: safePage, pageSize: safeSize, total: Number(counts[0]?.total ?? 0) };
  }

  async get(tenantId: string, orderId: string) {
    const orders = await this.prisma.$queryRaw<Array<Record<string, unknown>>>`
      SELECT o.id AS orderId, o.order_number AS orderNumber, o.status,
        o.template_version_id AS templateVersionId, o.created_by_membership_id AS createdByMembershipId,
        o.assigned_to_membership_id AS assignedToMembershipId, o.submitted_at AS submittedAt,
        o.approved_at AS approvedAt, o.created_at AS createdAt,
        v.id AS vehicleId, v.vin, v.plate_number AS plateNumber, v.brand_model AS brandModel,
        v.first_registered_on AS firstRegisteredOn, v.odometer_km AS odometerKm, v.color,
        t.name AS templateName, t.vehicle_type AS vehicleType, t.inspection_scope AS inspectionScope,
        tv.version_label AS templateVersion
      FROM orders o
      JOIN vehicles v ON v.id = o.vehicle_id AND v.tenant_id = o.tenant_id
      JOIN template_versions tv ON tv.id = o.template_version_id
      JOIN inspection_templates t ON t.id = tv.template_id
      WHERE o.tenant_id = ${tenantId} AND o.id = ${orderId}
      LIMIT 1
    `;
    if (orders.length !== 1) throw new NotFoundException('检测订单不存在');
    const records = await this.prisma.$queryRaw<Array<Record<string, unknown>>>`
      SELECT r.id AS recordId, r.item_id AS itemId, i.item_code AS itemCode,
        i.title, i.parent_id AS parentId, r.result_code AS resultCode,
        r.result_json AS resultJson, r.notes, r.updated_at AS updatedAt
      FROM inspection_items i
      LEFT JOIN inspection_records r ON r.item_id = i.id
        AND r.order_id = ${orderId} AND r.tenant_id = ${tenantId}
      WHERE i.template_version_id = ${orders[0].templateVersionId as string}
      ORDER BY i.sort_order ASC, i.item_code ASC
    `;
    return { ...orders[0], records };
  }

  async saveRecord(tenantId: string, orderId: string, itemId: string, actorMembershipId: string,
    input: { resultCode?: string; resultJson?: Record<string, unknown>; notes?: string }) {
    const recordId = randomUUID();
    await this.prisma.$transaction(async (tx) => {
      const orders = await tx.$queryRaw<Array<{ id: string; status: string; template_version_id: string; assigned_to_membership_id: string | null }>>`
        SELECT id, status, template_version_id, assigned_to_membership_id
        FROM orders WHERE tenant_id = ${tenantId} AND id = ${orderId} FOR UPDATE
      `;
      if (orders.length !== 1) throw new NotFoundException('检测订单不存在');
      const order = orders[0];
      if (!['in_progress', 'needs_revision'].includes(order.status)) {
        throw new ConflictException('当前订单状态不允许修改检测记录');
      }
      if (order.assigned_to_membership_id && order.assigned_to_membership_id !== actorMembershipId) {
        throw new ForbiddenException('仅被指派的检测师可以编辑该订单');
      }
      const items = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM inspection_items
        WHERE id = ${itemId} AND template_version_id = ${order.template_version_id}
      `;
      if (items.length !== 1) throw new BadRequestException('检测项目不属于该订单锁定的模板版本');
      await tx.$executeRaw`
        INSERT INTO inspection_records
          (id, tenant_id, order_id, item_id, result_code, result_json, notes, updated_by_membership_id)
        VALUES (${recordId}, ${tenantId}, ${orderId}, ${itemId},
          ${input.resultCode ?? null},
          ${input.resultJson ? JSON.stringify(input.resultJson) : null},
          ${input.notes ?? null}, ${actorMembershipId})
        ON DUPLICATE KEY UPDATE
          result_code = VALUES(result_code), result_json = VALUES(result_json),
          notes = VALUES(notes), updated_by_membership_id = VALUES(updated_by_membership_id),
          updated_at = CURRENT_TIMESTAMP
      `;
      await tx.$executeRaw`
        INSERT INTO audit_logs (id, tenant_id, actor_membership_id, action, resource_type, resource_id)
        VALUES (${randomUUID()}, ${tenantId}, ${actorMembershipId},
          'inspection_record.saved', 'order', ${orderId})
      `;
    });
    return { saved: true };
  }

  async submit(tenantId: string, orderId: string, actorMembershipId: string) {
    return this.prisma.$transaction(async (tx) => {
      const orders = await tx.$queryRaw<Array<{ id: string; status: string; template_version_id: string; assigned_to_membership_id: string | null }>>`
        SELECT id, status, template_version_id, assigned_to_membership_id
        FROM orders WHERE tenant_id = ${tenantId} AND id = ${orderId} FOR UPDATE
      `;
      if (orders.length !== 1) throw new NotFoundException('检测订单不存在');
      const order = orders[0];
      if (!['in_progress', 'needs_revision'].includes(order.status)) {
        throw new ConflictException('当前订单状态不允许提交审核');
      }
      if (order.assigned_to_membership_id && order.assigned_to_membership_id !== actorMembershipId) {
        throw new ForbiddenException('仅被指派的检测师可以提交该订单');
      }
      const counts = await tx.$queryRaw<Array<{ itemCount: bigint; recordCount: bigint }>>`
        SELECT
          (SELECT COUNT(*) FROM inspection_items WHERE template_version_id = ${order.template_version_id}) AS itemCount,
          (SELECT COUNT(DISTINCT r.item_id) FROM inspection_records r
            JOIN inspection_items i ON i.id = r.item_id
            WHERE r.tenant_id = ${tenantId} AND r.order_id = ${orderId}
              AND i.template_version_id = ${order.template_version_id}) AS recordCount
      `;
      const itemCount = Number(counts[0]?.itemCount ?? 0);
      const recordCount = Number(counts[0]?.recordCount ?? 0);
      if (itemCount === 0 || recordCount < itemCount) {
        throw new BadRequestException(`尚有检测项目未填写（已填写 ${recordCount}/${itemCount}）`);
      }
      const nextStatus = order.status === 'needs_revision' ? 'resubmitted' : 'pending_review';
      await tx.$executeRaw`
        UPDATE orders SET status = ${nextStatus}, submitted_at = CURRENT_TIMESTAMP
        WHERE tenant_id = ${tenantId} AND id = ${orderId}
      `;
      await tx.$executeRaw`
        INSERT INTO audit_logs (id, tenant_id, actor_membership_id, action, resource_type, resource_id)
        VALUES (${randomUUID()}, ${tenantId}, ${actorMembershipId},
          'inspection_order.submitted', 'order', ${orderId})
      `;
      return { orderId, status: nextStatus, completedItems: recordCount, totalItems: itemCount };
    });
  }
}
