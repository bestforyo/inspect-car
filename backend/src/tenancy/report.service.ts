import { ConflictException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { PrismaService } from '../database/prisma.service';

interface ReportRow { id: string; status: string; current_version: number; }
interface VersionRow { id: string; version_number: number; snapshot_json: unknown; published_at: Date | null; }

function parseSnapshot(value: unknown): Record<string, any> {
  if (typeof value === 'string') return JSON.parse(value) as Record<string, any>;
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, any>;
  throw new ConflictException('报告快照格式无效');
}

@Injectable()
export class ReportService {
  constructor(private readonly prisma: PrismaService) {}

  async publish(tenantId: string, reportId: string, actorId: string) {
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<ReportRow[]>\`
        SELECT id, status, current_version FROM reports
        WHERE tenant_id = \${tenantId} AND id = \${reportId} FOR UPDATE
      \`;
      const report = rows[0];
      if (!report) throw new NotFoundException('检测报告不存在');
      if (!['approved', 'published'].includes(report.status)) throw new ConflictException('只有审核通过的报告才能发布');
      const versions = await tx.$queryRaw<VersionRow[]>\`
        SELECT id, version_number, snapshot_json, published_at FROM report_versions
        WHERE tenant_id = \${tenantId} AND report_id = \${reportId}
          AND version_number = \${report.current_version} FOR UPDATE
      \`;
      if (!versions[0]) throw new ConflictException('报告当前版本不存在');
      await tx.$executeRaw\`UPDATE reports SET status = 'published' WHERE tenant_id = \${tenantId} AND id = \${reportId}\`;
      await tx.$executeRaw\`UPDATE report_versions SET published_at = COALESCE(published_at, CURRENT_TIMESTAMP) WHERE tenant_id = \${tenantId} AND id = \${versions[0].id}\`;
      await tx.$executeRaw\`
        INSERT INTO audit_logs (id, tenant_id, actor_membership_id, action, resource_type, resource_id)
        VALUES (\${randomUUID()}, \${tenantId}, \${actorId}, 'report.published', 'report', \${reportId})
      \`;
      return { reportId, version: report.current_version, status: 'published' };
    });
  }

  async createShare(tenantId: string, reportId: string, actorId: string, expiresInDays = 30) {
    const token = randomBytes(32).toString('base64url');
    const hash = createHash('sha256').update(token).digest('hex');
    const shareId = randomUUID();
    const expiresAt = new Date(Date.now() + expiresInDays * 86400000);
    await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<ReportRow[]>\`
        SELECT id, status, current_version FROM reports
        WHERE tenant_id = \${tenantId} AND id = \${reportId} FOR UPDATE
      \`;
      const report = rows[0];
      if (!report) throw new NotFoundException('检测报告不存在');
      if (report.status !== 'published') throw new ConflictException('请先发布报告，再创建分享链接');
      const versions = await tx.$queryRaw<Array<{id: string; published_at: Date | null}>>\`
        SELECT id, published_at FROM report_versions
        WHERE tenant_id = \${tenantId} AND report_id = \${reportId} AND version_number = \${report.current_version}
      \`;
      if (!versions[0]?.published_at) throw new ConflictException('当前报告版本尚未发布');
      await tx.$executeRaw\`
        INSERT INTO report_share_tokens (id, tenant_id, report_version_id, token_hash, expires_at, created_by_membership_id)
        VALUES (\${shareId}, \${tenantId}, \${versions[0].id}, \${hash}, \${expiresAt}, \${actorId})
      \`;
      await tx.$executeRaw\`
        INSERT INTO audit_logs (id, tenant_id, actor_membership_id, action, resource_type, resource_id, metadata_json)
        VALUES (\${randomUUID()}, \${tenantId}, \${actorId}, 'report.share_created', 'report', \${reportId},
          JSON_OBJECT('shareId', \${shareId}, 'expiresAt', \${expiresAt.toISOString()}))
      \`;
    });
    return { shareId, token, expiresAt };
  }

  async revokeShare(tenantId: string, reportId: string, shareId: string, actorId: string) {
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{id: string}>>\`
        SELECT s.id FROM report_share_tokens s
        JOIN report_versions v ON v.id = s.report_version_id AND v.tenant_id = s.tenant_id
        WHERE s.tenant_id = \${tenantId} AND s.id = \${shareId} AND v.report_id = \${reportId} FOR UPDATE
      \`;
      if (!rows[0]) throw new NotFoundException('分享链接不存在');
      await tx.$executeRaw\`UPDATE report_share_tokens SET revoked_at = COALESCE(revoked_at, CURRENT_TIMESTAMP) WHERE tenant_id = \${tenantId} AND id = \${shareId}\`;
      await tx.$executeRaw\`
        INSERT INTO audit_logs (id, tenant_id, actor_membership_id, action, resource_type, resource_id)
        VALUES (\${randomUUID()}, \${tenantId}, \${actorId}, 'report.share_revoked', 'report', \${reportId})
      \`;
      return { shareId, revoked: true };
    });
  }

  async revokePublication(tenantId: string, reportId: string, actorId: string) {
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<ReportRow[]>\`
        SELECT id, status, current_version FROM reports
        WHERE tenant_id = \${tenantId} AND id = \${reportId} FOR UPDATE
      \`;
      if (!rows[0]) throw new NotFoundException('检测报告不存在');
      if (rows[0].status !== 'published') throw new ConflictException('报告当前不是已发布状态');
      await tx.$executeRaw\`UPDATE reports SET status = 'revoked' WHERE tenant_id = \${tenantId} AND id = \${reportId}\`;
      await tx.$executeRaw\`
        UPDATE report_share_tokens s JOIN report_versions v ON v.id = s.report_version_id AND v.tenant_id = s.tenant_id
        SET s.revoked_at = COALESCE(s.revoked_at, CURRENT_TIMESTAMP)
        WHERE s.tenant_id = \${tenantId} AND v.report_id = \${reportId}
      \`;
      await tx.$executeRaw\`
        INSERT INTO audit_logs (id, tenant_id, actor_membership_id, action, resource_type, resource_id)
        VALUES (\${randomUUID()}, \${tenantId}, \${actorId}, 'report.publication_revoked', 'report', \${reportId})
      \`;
      return { reportId, status: 'revoked', sharesRevoked: true };
    });
  }

  async getPublicReport(rawToken: string) {
    if (!/^[A-Za-z0-9_-]{40,60}$/.test(rawToken)) throw new UnauthorizedException('分享链接无效或已失效');
    const hash = createHash('sha256').update(rawToken).digest('hex');
    const rows = await this.prisma.$queryRaw<Array<{share_id: string; tenant_id: string; version_number: number; snapshot_json: unknown}>>\`
      SELECT s.id AS share_id, s.tenant_id, v.version_number, v.snapshot_json
      FROM report_share_tokens s
      JOIN report_versions v ON v.id = s.report_version_id AND v.tenant_id = s.tenant_id
      JOIN reports r ON r.id = v.report_id AND r.tenant_id = v.tenant_id
      JOIN tenants t ON t.id = s.tenant_id
      WHERE s.token_hash = \${hash} AND s.revoked_at IS NULL
        AND (s.expires_at IS NULL OR s.expires_at > CURRENT_TIMESTAMP)
        AND r.status = 'published' AND v.published_at IS NOT NULL AND t.status = 'active'
      LIMIT 1
    \`;
    const share = rows[0];
    if (!share) throw new UnauthorizedException('分享链接无效或已失效');
    const snapshot = parseSnapshot(share.snapshot_json);
    const photos = Array.isArray(snapshot.photos) ? snapshot.photos.map((p: Record<string, any>) => ({
      photoId: p.photoId, itemCode: p.itemCode ?? null, mimeType: p.mimeType ?? null,
      widthPx: p.widthPx ?? null, heightPx: p.heightPx ?? null, capturedAt: p.capturedAt ?? null,
      thumbnailAvailable: false, mediumAvailable: false, originalAvailable: false,
    })) : [];
    const t = snapshot.template;
    const template = t ? {
      templateName: t.templateName, vehicleType: t.vehicleType, inspectionScope: t.inspectionScope,
      standardCode: t.standardCode, standardName: t.standardName, standardVersion: t.standardVersion,
      templateVersion: t.templateVersion,
    } : null;
    await this.prisma.$executeRaw\`
      UPDATE report_share_tokens SET view_count = view_count + 1, last_viewed_at = CURRENT_TIMESTAMP
      WHERE id = \${share.share_id} AND tenant_id = \${share.tenant_id}
    \`;
    return {
      reportVersion: share.version_number, approvedAt: snapshot.approvedAt ?? null,
      vehicle: snapshot.vehicle ?? null, template,
      records: Array.isArray(snapshot.records) ? snapshot.records : [],
      photos, photoDelivery: 'not_configured',
    };
  }
}
