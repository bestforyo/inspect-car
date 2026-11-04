import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { PrismaService } from '../database/prisma.service';

export interface CreateInvitationInput {
  tenantId: string;
  actorMembershipId: string;
  phone?: string;
  email?: string;
  roleIds: string[];
  expiresInHours?: number;
}

@Injectable()
export class TenantMembershipService {
  constructor(private readonly prisma: PrismaService) {}

  async createInvitation(input: CreateInvitationInput) {
    const phone = input.phone?.trim() || null;
    const email = input.email?.trim().toLowerCase() || null;
    const roleIds = [...new Set(input.roleIds)];
    const hours = input.expiresInHours ?? 72;
    if ((!phone && !email) || roleIds.length === 0 || !Number.isInteger(hours) || hours < 1 || hours > 168) {
      throw new BadRequestException('邀请联系方式、角色或有效期不合法');
    }
    const id = randomUUID();
    const token = randomBytes(32).toString('base64url');
    const tokenHash = createHash('sha256').update(token).digest('hex');

    await this.prisma.$transaction(async (tx) => {
      await this.assertManager(tx, input.tenantId, input.actorMembershipId);
      const validRoles: string[] = [];
      for (const roleId of roleIds) {
        const found = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT id FROM roles WHERE tenant_id = ${input.tenantId} AND id = ${roleId}
        `;
        if (found.length !== 1) throw new BadRequestException('角色不存在或不属于当前机构');
        validRoles.push(roleId);
      }
      await tx.$executeRaw`
        INSERT INTO tenant_invitations
          (id, tenant_id, invitee_phone, invitee_email, token_hash, role_ids_json, invited_by_membership_id, expires_at)
        VALUES (${id}, ${input.tenantId}, ${phone}, ${email}, ${tokenHash},
          CAST(${JSON.stringify(validRoles)} AS JSON), ${input.actorMembershipId},
          DATE_ADD(CURRENT_TIMESTAMP, INTERVAL ${hours} HOUR))
      `;
      await tx.$executeRaw`
        INSERT INTO audit_logs (id, tenant_id, actor_membership_id, action, resource_type, resource_id, metadata_json)
        VALUES (${randomUUID()}, ${input.tenantId}, ${input.actorMembershipId},
          'membership.invitation_created', 'tenant_invitation', ${id},
          JSON_OBJECT('phone', ${phone}, 'email', ${email}, 'roleCount', ${validRoles.length}))
      `;
    });
    return { invitationId: id, token, expiresInHours: hours };
  }

  async revokeInvitation(tenantId: string, invitationId: string, actorMembershipId: string) {
    await this.prisma.$transaction(async (tx) => {
      await this.assertManager(tx, tenantId, actorMembershipId);
      const rows = await tx.$executeRaw`
        UPDATE tenant_invitations SET revoked_at = CURRENT_TIMESTAMP
        WHERE id = ${invitationId} AND tenant_id = ${tenantId}
          AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > CURRENT_TIMESTAMP
      `;
      if (rows !== 1) throw new NotFoundException('有效邀请不存在');
      await tx.$executeRaw`
        INSERT INTO audit_logs (id, tenant_id, actor_membership_id, action, resource_type, resource_id)
        VALUES (${randomUUID()}, ${tenantId}, ${actorMembershipId},
          'membership.invitation_revoked', 'tenant_invitation', ${invitationId})
      `;
    });
  }

  async createRole(tenantId: string, actorMembershipId: string, code: string, name: string, permissionCodes: string[]) {
    const normalizedCode = code.trim().toLowerCase();
    const normalizedName = name.trim();
    const permissions = [...new Set(permissionCodes)];
    if (!/^[a-z][a-z0-9_-]{1,79}$/.test(normalizedCode) || !normalizedName || permissions.length === 0) {
      throw new BadRequestException('角色编码、名称或权限配置不合法');
    }
    const roleId = randomUUID();
    await this.prisma.$transaction(async (tx) => {
      await this.assertManager(tx, tenantId, actorMembershipId);
      for (const permission of permissions) {
        const exists = await tx.$queryRaw<Array<{ code: string }>>`
          SELECT code FROM permissions WHERE code = ${permission}
        `;
        if (exists.length !== 1 || permission.startsWith('platform:')) {
          throw new BadRequestException('权限不存在或不允许分配平台级权限');
        }
      }
      await tx.$executeRaw`
        INSERT INTO roles (id, tenant_id, code, name, is_system)
        VALUES (${roleId}, ${tenantId}, ${normalizedCode}, ${normalizedName}, FALSE)
      `;
      for (const permission of permissions) {
        await tx.$executeRaw`
          INSERT INTO role_permissions (tenant_id, role_id, permission_code)
          VALUES (${tenantId}, ${roleId}, ${permission})
        `;
      }
      await tx.$executeRaw`
        INSERT INTO audit_logs (id, tenant_id, actor_membership_id, action, resource_type, resource_id, metadata_json)
        VALUES (${randomUUID()}, ${tenantId}, ${actorMembershipId},
          'role.created', 'role', ${roleId}, JSON_OBJECT('code', ${normalizedCode}))
      `;
    });
    return { roleId, code: normalizedCode, name: normalizedName, permissionCodes: permissions };
  }

  async assignRoles(tenantId: string, membershipId: string, actorMembershipId: string, roleIds: string[]) {
    const roles = [...new Set(roleIds)];
    if (roles.length === 0) throw new BadRequestException('至少分配一个角色');
    await this.prisma.$transaction(async (tx) => {
      await this.assertManager(tx, tenantId, actorMembershipId);
      const member = await tx.$queryRaw<Array<{ id: string; status: string }>>`
        SELECT id, status FROM tenant_memberships
        WHERE tenant_id = ${tenantId} AND id = ${membershipId} FOR UPDATE
      `;
      if (member.length !== 1 || member[0].status !== 'active') throw new NotFoundException('有效机构成员不存在');
      const existingAdmin = await this.hasAdminRole(tx, tenantId, membershipId);
      const willRemainAdmin = await this.rolesContainAdmin(tx, tenantId, roles);
      if (existingAdmin && !willRemainAdmin) await this.assertAnotherAdminExists(tx, tenantId, membershipId);
      for (const roleId of roles) {
        const found = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT id FROM roles WHERE tenant_id = ${tenantId} AND id = ${roleId}
        `;
        if (found.length !== 1) throw new BadRequestException('角色不存在或不属于当前机构');
      }
      await tx.$executeRaw`DELETE FROM user_roles WHERE tenant_id = ${tenantId} AND membership_id = ${membershipId}`;
      for (const roleId of roles) {
        await tx.$executeRaw`
          INSERT INTO user_roles (tenant_id, membership_id, role_id)
          VALUES (${tenantId}, ${membershipId}, ${roleId})
        `;
      }
      await tx.$executeRaw`
        INSERT INTO audit_logs (id, tenant_id, actor_membership_id, action, resource_type, resource_id)
        VALUES (${randomUUID()}, ${tenantId}, ${actorMembershipId}, 'membership.roles_updated', 'membership', ${membershipId})
      `;
    });
  }

  async disableMembership(tenantId: string, membershipId: string, actorMembershipId: string) {
    await this.prisma.$transaction(async (tx) => {
      await this.assertManager(tx, tenantId, actorMembershipId);
      const members = await tx.$queryRaw<Array<{ id: string; status: string }>>`
        SELECT id, status FROM tenant_memberships
        WHERE tenant_id = ${tenantId} AND id = ${membershipId} FOR UPDATE
      `;
      if (members.length !== 1 || members[0].status !== 'active') throw new NotFoundException('有效机构成员不存在');
      if (await this.hasAdminRole(tx, tenantId, membershipId)) {
        await this.assertAnotherAdminExists(tx, tenantId, membershipId);
      }
      await tx.$executeRaw`
        UPDATE tenant_memberships SET status = 'suspended'
        WHERE tenant_id = ${tenantId} AND id = ${membershipId}
      `;
      await tx.$executeRaw`
        INSERT INTO audit_logs (id, tenant_id, actor_membership_id, action, resource_type, resource_id)
        VALUES (${randomUUID()}, ${tenantId}, ${actorMembershipId}, 'membership.suspended', 'membership', ${membershipId})
      `;
    });
  }

  private async assertManager(tx: any, tenantId: string, membershipId: string) {
    // Serialize all membership/role mutations per tenant so concurrent requests
    // cannot both remove the final administrator.
    const tenant = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM tenants WHERE id = ${tenantId} FOR UPDATE
    `;
    if (tenant.length !== 1) throw new NotFoundException('机构不存在');
    const rows = await tx.$queryRaw<Array<{ id: string; status: string; can_manage: number }>>`
      SELECT m.id, m.status, MAX(rp.permission_code = 'tenant:members:manage') AS can_manage
      FROM tenant_memberships m
      JOIN user_roles ur ON ur.tenant_id = m.tenant_id AND ur.membership_id = m.id
      JOIN role_permissions rp ON rp.tenant_id = ur.tenant_id AND rp.role_id = ur.role_id
      WHERE m.tenant_id = ${tenantId} AND m.id = ${membershipId}
      GROUP BY m.id, m.status
    `;
    if (rows.length !== 1 || rows[0].status !== 'active' || !rows[0].can_manage) {
      throw new ForbiddenException('需要当前机构的成员管理权限');
    }
  }

  private async hasAdminRole(tx: any, tenantId: string, membershipId: string): Promise<boolean> {
    const rows = await tx.$queryRaw<Array<{ found: number }>>`
      SELECT EXISTS(SELECT 1 FROM user_roles ur JOIN roles r
        ON r.tenant_id = ur.tenant_id AND r.id = ur.role_id
        WHERE ur.tenant_id = ${tenantId} AND ur.membership_id = ${membershipId}
          AND r.code = 'tenant_admin' AND r.is_system = TRUE) AS found
    `;
    return Boolean(rows[0]?.found);
  }

  private async rolesContainAdmin(tx: any, tenantId: string, roleIds: string[]): Promise<boolean> {
    for (const roleId of roleIds) {
      const rows = await tx.$queryRaw<Array<{ found: number }>>`
        SELECT EXISTS(SELECT 1 FROM roles WHERE tenant_id = ${tenantId} AND id = ${roleId}
          AND code = 'tenant_admin' AND is_system = TRUE) AS found
      `;
      if (rows[0]?.found) return true;
    }
    return false;
  }

  private async assertAnotherAdminExists(tx: any, tenantId: string, excludedMembershipId: string) {
    const rows = await tx.$queryRaw<Array<{ total: bigint }>>`
      SELECT COUNT(DISTINCT m.id) AS total
      FROM tenant_memberships m
      JOIN user_roles ur ON ur.tenant_id = m.tenant_id AND ur.membership_id = m.id
      JOIN roles r ON r.tenant_id = ur.tenant_id AND r.id = ur.role_id
      WHERE m.tenant_id = ${tenantId} AND m.status = 'active'
        AND m.id <> ${excludedMembershipId} AND r.code = 'tenant_admin' AND r.is_system = TRUE
    `;
    if (Number(rows[0]?.total ?? 0) < 1) {
      throw new ConflictException('不能移除、停用或降权本机构最后一位有效管理员');
    }
  }
}
