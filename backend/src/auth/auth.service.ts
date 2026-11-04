import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { PrismaService } from '../database/prisma.service';
import { AuthUser } from './auth-user.interface';

const ACCESS_TTL_SECONDS = 15 * 60;
const REFRESH_TTL_DAYS = 30;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  // Call only after a trusted identity provider has authenticated the user.
  async createSessionForUser(userId: string, tenantId: string) {
    const identity = await this.loadActiveIdentity(userId, tenantId);
    return this.issueSession(identity);
  }

  async loginWithWechatCode(code: string, tenantId?: string) {
    if (!code || code.length > 256) {
      throw new UnauthorizedException('Invalid WeChat login code');
    }
    const appId = this.config.getOrThrow<string>('WX_APP_ID');
    const appSecret = this.config.getOrThrow<string>('WX_APP_SECRET');
    const params = new URLSearchParams({
      appid: appId,
      secret: appSecret,
      js_code: code,
      grant_type: 'authorization_code',
    });
    let result: { openid?: string; errcode?: number };
    try {
      const response = await fetch(
        `https://api.weixin.qq.com/sns/jscode2session?${params.toString()}`,
        { signal: AbortSignal.timeout(8000) },
      );
      if (!response.ok) throw new Error('WeChat identity provider unavailable');
      result = await response.json() as { openid?: string; errcode?: number };
    } catch {
      throw new UnauthorizedException('WeChat login is temporarily unavailable');
    }
    if (!result.openid || result.errcode) {
      throw new UnauthorizedException('WeChat login code is invalid or expired');
    }

    const users = await this.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM users WHERE wx_openid = ${result.openid} LIMIT 1
    `;
    if (users.length !== 1) {
      throw new UnauthorizedException('No account is linked to this WeChat identity; accept an institution invitation first');
    }
    const memberships = await this.prisma.$queryRaw<Array<{ tenant_id: string }>>`
      SELECT m.tenant_id FROM tenant_memberships m
      JOIN tenants t ON t.id = m.tenant_id
      WHERE m.user_id = ${users[0].id} AND m.status = 'active' AND t.status = 'active'
      ORDER BY m.created_at ASC
    `;
    const selected = tenantId
      ? memberships.find((membership) => membership.tenant_id === tenantId)
      : memberships.length === 1 ? memberships[0] : undefined;
    if (!selected) {
      if (memberships.length > 1 && !tenantId) {
        return { requiresTenantSelection: true, tenantIds: memberships.map((membership) => membership.tenant_id) };
      }
      throw new UnauthorizedException('No active membership exists for the selected institution');
    }
    return this.issueSession(await this.loadActiveIdentity(users[0].id, selected.tenant_id));
  }

  async acceptWechatInvitation(code: string, rawInvitationToken: string) {
    if (!code || code.length > 256 || !rawInvitationToken || rawInvitationToken.length < 32 || rawInvitationToken.length > 200) {
      throw new UnauthorizedException('Invalid invitation acceptance request');
    }
    const appId = this.config.getOrThrow<string>('WX_APP_ID');
    const appSecret = this.config.getOrThrow<string>('WX_APP_SECRET');
    const params = new URLSearchParams({ appid: appId, secret: appSecret, js_code: code, grant_type: 'authorization_code' });
    let providerResult: { openid?: string; errcode?: number };
    try {
      const response = await fetch(`https://api.weixin.qq.com/sns/jscode2session?${params.toString()}`, {
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) throw new Error('WeChat identity provider unavailable');
      providerResult = await response.json() as { openid?: string; errcode?: number };
    } catch {
      throw new UnauthorizedException('WeChat login is temporarily unavailable');
    }
    if (!providerResult.openid || providerResult.errcode) {
      throw new UnauthorizedException('WeChat login code is invalid or expired');
    }

    const tokenHash = this.hash(rawInvitationToken);
    const identity = await this.prisma.$transaction(async (tx) => {
      const invitations = await tx.$queryRaw<Array<{
        id: string; tenant_id: string; invitee_phone: string | null; invitee_email: string | null;
        role_ids_json: unknown; expires_at: Date; accepted_at: Date | null; revoked_at: Date | null;
        tenant_status: string;
      }>>`
        SELECT i.id, i.tenant_id, i.invitee_phone, i.invitee_email, i.role_ids_json,
          i.expires_at, i.accepted_at, i.revoked_at, t.status AS tenant_status
        FROM tenant_invitations i JOIN tenants t ON t.id = i.tenant_id
        WHERE i.token_hash = ${tokenHash} FOR UPDATE
      `;
      const invitation = invitations[0];
      if (!invitation || invitation.accepted_at || invitation.revoked_at ||
          new Date(invitation.expires_at).getTime() <= Date.now() || invitation.tenant_status !== 'active') {
        throw new UnauthorizedException('Invitation is invalid, expired, or revoked');
      }

      const users = await tx.$queryRaw<Array<{ id: string; wx_openid: string | null; status: string }>>`
        SELECT id, wx_openid, status FROM users
        WHERE (${invitation.invitee_phone} IS NOT NULL AND phone = ${invitation.invitee_phone})
           OR (${invitation.invitee_email} IS NOT NULL AND email = ${invitation.invitee_email})
        FOR UPDATE
      `;
      if (users.length > 1) throw new UnauthorizedException('Invitation contact matches conflicting accounts');
      let userId: string;
      if (users.length === 1) {
        const existing = users[0];
        if (existing.status === 'disabled') {
          throw new UnauthorizedException('This account has been disabled');
        }
        if (existing.wx_openid && existing.wx_openid !== providerResult.openid) {
          throw new UnauthorizedException('This account is already linked to another WeChat identity');
        }
        userId = existing.id;
        await tx.$executeRaw`
          UPDATE users SET wx_openid = ${providerResult.openid}, status = 'active'
          WHERE id = ${userId} AND (wx_openid IS NULL OR wx_openid = ${providerResult.openid})
        `;
      } else {
        userId = randomUUID();
        await tx.$executeRaw`
          INSERT INTO users (id, phone, email, display_name, wx_openid, status)
          VALUES (${userId}, ${invitation.invitee_phone}, ${invitation.invitee_email},
            '微信用户', ${providerResult.openid}, 'active')
        `;
      }

      const memberships = await tx.$queryRaw<Array<{ id: string; status: string }>>`
        SELECT id, status FROM tenant_memberships
        WHERE tenant_id = ${invitation.tenant_id} AND user_id = ${userId} FOR UPDATE
      `;
      let membershipId: string;
      if (memberships.length === 1) {
        if (memberships[0].status !== 'invited') {
          throw new UnauthorizedException('An active or previously closed membership already exists');
        }
        membershipId = memberships[0].id;
        await tx.$executeRaw`
          UPDATE tenant_memberships SET status = 'active', joined_at = CURRENT_TIMESTAMP
          WHERE id = ${membershipId} AND tenant_id = ${invitation.tenant_id} AND status = 'invited'
        `;
      } else if (memberships.length === 0) {
        membershipId = randomUUID();
        await tx.$executeRaw`
          INSERT INTO tenant_memberships (id, tenant_id, user_id, status, joined_at)
          VALUES (${membershipId}, ${invitation.tenant_id}, ${userId}, 'active', CURRENT_TIMESTAMP)
        `;
      } else {
        throw new UnauthorizedException('Membership state is inconsistent');
      }

      const roleIds = Array.isArray(invitation.role_ids_json)
        ? invitation.role_ids_json as string[]
        : JSON.parse(String(invitation.role_ids_json)) as string[];
      if (!roleIds.length || roleIds.some((roleId) => typeof roleId !== 'string')) {
        throw new UnauthorizedException('Invitation role configuration is invalid');
      }
      for (const roleId of roleIds) {
        const roles = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT id FROM roles WHERE tenant_id = ${invitation.tenant_id} AND id = ${roleId}
        `;
        if (roles.length !== 1) throw new UnauthorizedException('An invited role is no longer available');
        await tx.$executeRaw`
          INSERT INTO user_roles (tenant_id, membership_id, role_id)
          VALUES (${invitation.tenant_id}, ${membershipId}, ${roleId})
        `;
      }
      await tx.$executeRaw`
        UPDATE tenant_invitations SET accepted_at = CURRENT_TIMESTAMP
        WHERE id = ${invitation.id} AND accepted_at IS NULL AND revoked_at IS NULL
      `;
      await tx.$executeRaw`
        INSERT INTO audit_logs (id, tenant_id, actor_membership_id, action, resource_type, resource_id, metadata_json)
        VALUES (${randomUUID()}, ${invitation.tenant_id}, ${membershipId},
          'membership.invitation_accepted', 'tenant_invitation', ${invitation.id},
          JSON_OBJECT('membershipId', ${membershipId}))
      `;
      return { userId, tenantId: invitation.tenant_id };
    });
    return this.issueSession(await this.loadActiveIdentity(identity.userId, identity.tenantId));
  }

  async refreshSession(rawRefreshToken: string) {
    if (!rawRefreshToken || rawRefreshToken.length < 40 || rawRefreshToken.length > 200) {
      throw new UnauthorizedException('Invalid refresh token');
    }
    const tokenHash = this.hash(rawRefreshToken);
    const nextToken = randomBytes(48).toString('base64url');
    const nextHash = this.hash(nextToken);
    const nextId = randomUUID();

    const identity = await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{
        id: string; family_id: string; user_id: string; membership_id: string; tenant_id: string;
        expires_at: Date; revoked_at: Date | null;
      }>>`
        SELECT id, family_id, user_id, membership_id, tenant_id, expires_at, revoked_at
        FROM auth_refresh_tokens WHERE token_hash = ${tokenHash} FOR UPDATE
      `;
      const current = rows[0];
      if (!current) {
        throw new UnauthorizedException('Refresh token expired, revoked, or invalid');
      }
      if (current.revoked_at) {
        // A rotated token was presented again: revoke every credential in its family.
        await tx.$executeRaw`
          UPDATE auth_refresh_tokens SET revoked_at = COALESCE(revoked_at, CURRENT_TIMESTAMP)
          WHERE family_id = ${current.family_id}
        `;
        return { reuseDetected: true as const };
      }
      if (new Date(current.expires_at).getTime() <= Date.now()) {
        throw new UnauthorizedException('Refresh token expired, revoked, or invalid');
      }
      const active = await this.loadActiveIdentityInTransaction(tx, current.user_id, current.tenant_id);
      if (active.membershipId !== current.membership_id) {
        throw new UnauthorizedException('Membership is no longer active');
      }
      await tx.$executeRaw`
        INSERT INTO auth_refresh_tokens
          (id, family_id, user_id, membership_id, tenant_id, token_hash, expires_at)
        VALUES (${nextId}, ${current.family_id}, ${current.user_id}, ${current.membership_id}, ${current.tenant_id},
          ${nextHash}, DATE_ADD(CURRENT_TIMESTAMP, INTERVAL ${REFRESH_TTL_DAYS} DAY))
      `;
      await tx.$executeRaw`
        UPDATE auth_refresh_tokens SET revoked_at = CURRENT_TIMESTAMP, replaced_by_token_id = ${nextId}
        WHERE id = ${current.id} AND revoked_at IS NULL
      `;
      return active;
    });
    if ('reuseDetected' in identity) {
      throw new UnauthorizedException('Refresh token reuse detected; session family revoked');
    }
    return this.formatSession(identity, nextToken);
  }

  async revokeRefreshToken(rawRefreshToken: string, userId: string) {
    if (!rawRefreshToken) return;
    await this.prisma.$executeRaw`
      UPDATE auth_refresh_tokens SET revoked_at = CURRENT_TIMESTAMP
      WHERE token_hash = ${this.hash(rawRefreshToken)} AND user_id = ${userId} AND revoked_at IS NULL
    `;
  }

  async loadActiveIdentity(userId: string, tenantId: string): Promise<AuthUser> {
    return this.loadActiveIdentityInTransaction(this.prisma, userId, tenantId);
  }

  private async loadActiveIdentityInTransaction(tx: any, userId: string, tenantId: string): Promise<AuthUser> {
    const rows = await tx.$queryRaw<Array<{
      membership_id: string; user_id: string; tenant_id: string; user_status: string;
      membership_status: string; tenant_status: string;
    }>>`
      SELECT m.id AS membership_id, u.id AS user_id, m.tenant_id,
        u.status AS user_status, m.status AS membership_status, t.status AS tenant_status
      FROM users u
      JOIN tenant_memberships m ON m.user_id = u.id
      JOIN tenants t ON t.id = m.tenant_id
      WHERE u.id = ${userId} AND m.tenant_id = ${tenantId}
      LIMIT 1
    `;
    const row = rows[0];
    if (!row || row.user_status !== 'active' || row.membership_status !== 'active' || row.tenant_status !== 'active') {
      throw new UnauthorizedException('No active membership for this institution');
    }
    const grants: Array<{ role_code: string; permission_code: string | null }> = await tx.$queryRaw`
      SELECT r.code AS role_code, rp.permission_code
      FROM user_roles ur
      JOIN roles r ON r.tenant_id = ur.tenant_id AND r.id = ur.role_id
      LEFT JOIN role_permissions rp ON rp.tenant_id = r.tenant_id AND rp.role_id = r.id
      WHERE ur.tenant_id = ${tenantId} AND ur.membership_id = ${row.membership_id}
    `;
    return {
      sub: row.user_id,
      membershipId: row.membership_id,
      tenantId: row.tenant_id,
      roles: [...new Set<string>(grants.map((grant: { role_code: string; permission_code: string | null }) => grant.role_code))],
      permissions: [...new Set<string>(grants.map((grant: { role_code: string; permission_code: string | null }) => grant.permission_code).filter((value): value is string => typeof value === 'string'))],
    };
  }

  private async issueSession(identity: AuthUser) {
    const refreshToken = randomBytes(48).toString('base64url');
    const id = randomUUID();
    const familyId = randomUUID();
    await this.prisma.$executeRaw`
      INSERT INTO auth_refresh_tokens (id, family_id, user_id, membership_id, tenant_id, token_hash, expires_at)
      VALUES (${id}, ${familyId}, ${identity.sub}, ${identity.membershipId}, ${identity.tenantId},
        ${this.hash(refreshToken)}, DATE_ADD(CURRENT_TIMESTAMP, INTERVAL ${REFRESH_TTL_DAYS} DAY))
    `;
    return this.formatSession(identity, refreshToken);
  }

  private async formatSession(identity: AuthUser, refreshToken: string) {
    const accessToken = await this.jwt.signAsync({
      sub: identity.sub,
      membershipId: identity.membershipId,
      tenantId: identity.tenantId,
    }, {
      secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      algorithm: 'HS256',
      expiresIn: ACCESS_TTL_SECONDS,
    });
    return {
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
      expiresIn: ACCESS_TTL_SECONDS,
      user: identity,
    };
  }

  private hash(value: string) {
    return createHash('sha256').update(value).digest('hex');
  }
}
