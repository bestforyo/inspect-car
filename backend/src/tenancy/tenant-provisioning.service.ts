import { BadRequestException, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../database/prisma.service';

export interface ProvisionTenantInput {
  name: string;
  slug: string;
  adminDisplayName: string;
  adminPhone?: string;
  adminEmail?: string;
}

@Injectable()
export class TenantProvisioningService {
  constructor(private readonly prisma: PrismaService) {}

  async provision(input: ProvisionTenantInput) {
    const name = input.name.trim();
    const slug = input.slug.trim().toLowerCase();
    const adminDisplayName = input.adminDisplayName.trim();
    const phone = input.adminPhone?.trim() || null;
    const email = input.adminEmail?.trim().toLowerCase() || null;

    if (!name || !/^[a-z0-9][a-z0-9-]{2,79}$/.test(slug) || !adminDisplayName) {
      throw new BadRequestException('机构名称、机构标识或管理员姓名不合法');
    }
    if (!phone && !email) {
      throw new BadRequestException('首位管理员必须提供手机号或邮箱');
    }

    const tenantId = randomUUID();
    const userId = randomUUID();
    const membershipId = randomUUID();
    const roleId = randomUUID();
    const permissionCodes = [
      'tenant:read',
      'tenant:members:read',
      'tenant:members:manage',
      'tenant:roles:read',
      'tenant:roles:manage',
      'tenant:orders:read',
      'tenant:reports:read',
      'tenant:reviews:manage',
    ];

    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`INSERT INTO tenants (id, name, slug, status) VALUES (${tenantId}, ${name}, ${slug}, 'active')`;
      await tx.$executeRaw`INSERT INTO users (id, phone, email, display_name, status) VALUES (${userId}, ${phone}, ${email}, ${adminDisplayName}, 'active')`;
      await tx.$executeRaw`INSERT INTO tenant_memberships (id, tenant_id, user_id, status, joined_at) VALUES (${membershipId}, ${tenantId}, ${userId}, 'active', CURRENT_TIMESTAMP)`;
      await tx.$executeRaw`INSERT INTO roles (id, tenant_id, code, name, is_system) VALUES (${roleId}, ${tenantId}, 'tenant_admin', '机构管理员', TRUE)`;

      for (const code of permissionCodes) {
        await tx.$executeRaw`INSERT IGNORE INTO permissions (code, name) VALUES (${code}, ${code})`;
        await tx.$executeRaw`INSERT INTO role_permissions (tenant_id, role_id, permission_code) VALUES (${tenantId}, ${roleId}, ${code})`;
      }

      await tx.$executeRaw`INSERT INTO user_roles (tenant_id, membership_id, role_id) VALUES (${tenantId}, ${membershipId}, ${roleId})`;
      await tx.$executeRaw`INSERT INTO audit_logs (id, tenant_id, actor_membership_id, action, resource_type, resource_id, metadata_json) VALUES (${randomUUID()}, ${tenantId}, ${membershipId}, 'tenant.provisioned', 'tenant', ${tenantId}, JSON_OBJECT('initialAdminUserId', ${userId}))`;
    });

    return { tenantId, userId, membershipId, roleId, status: 'active' as const };
  }
}
