import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../database/prisma.service';

interface ReviewInput {
  tenantId: string;
  orderId: string;
  reviewerMembershipId: string;
  action: 'approved' | 'returned';
  comment?: string;
}

@Injectable()
export class InspectionReviewService {
  constructor(private readonly prisma: PrismaService) {}

  async list(tenantId: string, orderId: string) {
    const order = await this.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM orders WHERE tenant_id = ${tenantId} AND id = ${orderId}
    `;
    if (order.length !== 1) throw new NotFoundException('检测订单不存在');
    return this.prisma.$queryRaw<Array<Record<string, unknown>>>`
      SELECT id AS reviewId, reviewer_membership_id AS reviewerMembershipId,
        action, comment, submission_version AS submissionVersion, created_at AS createdAt
      FROM reviews WHERE tenant_id = ${tenantId} AND order_id = ${orderId}
      ORDER BY submission_version DESC, created_at DESC
    `;
  }

  async review(input: ReviewInput) {
    if (input.action === 'returned' && !input.comment?.trim()) {
      throw new BadRequestException('退回修改必须填写审核意见');
    }

    return this.prisma.$transaction(async (tx) => {
      const orders = await tx.$queryRaw<Array<{
        id: string; status: string; created_by_membership_id: string;
        assigned_to_membership_id: string | null; template_version_id: string; vehicle_id: string;
      }>>`
        SELECT id, status, created_by_membership_id, assigned_to_membership_id,
          template_version_id, vehicle_id
        FROM orders WHERE tenant_id = ${input.tenantId} AND id = ${input.orderId}
        FOR UPDATE
      `;
      if (orders.length !== 1) throw new NotFoundException('检测订单不存在');
      const order = orders[0];
      if (!['pending_review', 'resubmitted'].includes(order.status)) {
        throw new ConflictException('订单当前不在待审核状态');
      }
      if (order.assigned_to_membership_id === input.reviewerMembershipId) {
        throw new ForbiddenException('被指派的检测师不能审核自己的检测订单');
      }

      const prior = await tx.$queryRaw<Array<{ total: bigint }>>`
        SELECT COUNT(*) AS total FROM reviews
        WHERE tenant_id = ${input.tenantId} AND order_id = ${input.orderId}
      `;
      const submissionVersion = Number(prior[0]?.total ?? 0) + 1;
      await tx.$executeRaw`
        INSERT INTO reviews
          (id, tenant_id, order_id, reviewer_membership_id, action, comment, submission_version)
        VALUES (${randomUUID()}, ${input.tenantId}, ${input.orderId},
          ${input.reviewerMembershipId}, ${input.action}, ${input.comment?.trim() || null},
          ${submissionVersion})
      `;

      if (input.action === 'returned') {
        await tx.$executeRaw`
          UPDATE orders SET status = 'needs_revision'
          WHERE tenant_id = ${input.tenantId} AND id = ${input.orderId}
        `;
      } else {
        const vehicleRows = await tx.$queryRaw<Array<Record<string, unknown>>>`
          SELECT vin, plate_number AS plateNumber, brand_model AS brandModel,
            first_registered_on AS firstRegisteredOn, odometer_km AS odometerKm, color
          FROM vehicles WHERE tenant_id = ${input.tenantId} AND id = ${order.vehicle_id}
        `;
        const templateRows = await tx.$queryRaw<Array<Record<string, unknown>>>`
          SELECT t.name AS templateName, t.vehicle_type AS vehicleType,
            t.inspection_scope AS inspectionScope, s.code AS standardCode,
            s.name AS standardName, s.version_label AS standardVersion,
            tv.version_label AS templateVersion, tv.definition_json AS templateDefinition
          FROM template_versions tv
          JOIN inspection_templates t ON t.id = tv.template_id
          JOIN standards s ON s.id = t.standard_id
          WHERE tv.id = ${order.template_version_id}
        `;
        const recordRows = await tx.$queryRaw<Array<Record<string, unknown>>>`
          SELECT i.item_code AS itemCode, i.title, i.description,
            r.result_code AS resultCode, r.result_json AS resultJson, r.notes,
            r.updated_at AS updatedAt
          FROM inspection_items i
          LEFT JOIN inspection_records r ON r.item_id = i.id
            AND r.tenant_id = ${input.tenantId} AND r.order_id = ${input.orderId}
          WHERE i.template_version_id = ${order.template_version_id}
          ORDER BY i.sort_order, i.item_code
        `;
        const photoRows = await tx.$queryRaw<Array<Record<string, unknown>>>`
          SELECT p.id AS photoId, i.item_code AS itemCode,
            p.object_key_original AS originalObjectKey,
            p.object_key_thumbnail AS thumbnailObjectKey,
            p.object_key_medium AS mediumObjectKey,
            p.mime_type AS mimeType, p.file_size_bytes AS fileSizeBytes,
            p.width_px AS widthPx, p.height_px AS heightPx, p.captured_at AS capturedAt
          FROM inspection_photos p
          LEFT JOIN inspection_records r ON r.id = p.record_id
            AND r.tenant_id = p.tenant_id AND r.order_id = p.order_id
          LEFT JOIN inspection_items i ON i.id = r.item_id
          WHERE p.tenant_id = ${input.tenantId} AND p.order_id = ${input.orderId}
          ORDER BY p.created_at
        `;

        const snapshot = {
          snapshotSchemaVersion: 1,
          orderId: input.orderId,
          submissionVersion,
          approvedAt: new Date().toISOString(),
          vehicle: vehicleRows[0] ?? null,
          template: templateRows[0] ?? null,
          records: recordRows,
          photos: photoRows,
        };
        const reportRows = await tx.$queryRaw<Array<{ id: string; current_version: number }>>`
          SELECT id, current_version FROM reports
          WHERE tenant_id = ${input.tenantId} AND order_id = ${input.orderId}
          FOR UPDATE
        `;
        let reportId: string;
        let versionNumber: number;
        if (reportRows.length === 0) {
          reportId = randomUUID();
          versionNumber = 1;
          await tx.$executeRaw`
            INSERT INTO reports (id, tenant_id, order_id, current_version, status)
            VALUES (${reportId}, ${input.tenantId}, ${input.orderId}, 1, 'approved')
          `;
        } else {
          reportId = reportRows[0].id;
          versionNumber = Number(reportRows[0].current_version) + 1;
          await tx.$executeRaw`
            UPDATE reports SET current_version = ${versionNumber}, status = 'approved'
            WHERE tenant_id = ${input.tenantId} AND id = ${reportId}
          `;
        }
        await tx.$executeRaw`
          INSERT INTO report_versions
            (id, tenant_id, report_id, version_number, snapshot_json, approved_by_membership_id)
          VALUES (${randomUUID()}, ${input.tenantId}, ${reportId}, ${versionNumber},
            ${JSON.stringify(snapshot)}, ${input.reviewerMembershipId})
        `;
        await tx.$executeRaw`
          UPDATE orders SET status = 'approved', approved_at = CURRENT_TIMESTAMP
          WHERE tenant_id = ${input.tenantId} AND id = ${input.orderId}
        `;
      }

      await tx.$executeRaw`
        INSERT INTO audit_logs (id, tenant_id, actor_membership_id, action, resource_type, resource_id, metadata_json)
        VALUES (${randomUUID()}, ${input.tenantId}, ${input.reviewerMembershipId},
          ${input.action === 'approved' ? 'inspection_order.approved' : 'inspection_order.returned'},
          'order', ${input.orderId},
          JSON_OBJECT('submissionVersion', ${submissionVersion}, 'comment', ${input.comment?.trim() || null}))
      `;
      return {
        orderId: input.orderId,
        action: input.action,
        status: input.action === 'approved' ? 'approved' : 'needs_revision',
        submissionVersion,
      };
    });
  }
}
