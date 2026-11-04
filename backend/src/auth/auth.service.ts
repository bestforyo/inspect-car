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
        id: string; user_id: string; membership_id: string; tenant_id: string;
        expires_at: Date; revoked_at: Date | null;
      }>>`
        SELECT id, user_id, membership_id, tenant_id, expires_at, revoked_at
        FROM auth_refresh_tokens WHERE token_hash = ${tokenHash} FOR UPDATE
      `;
      const current = rows[0];
      if (!current || current.revoked_at || new Date(current.expires_at).getTime() <= Date.now()) {
        throw new UnauthorizedException('Refresh token expired, revoked, or invalid');
      }
      const active = await this.loadActiveIdentityInTransaction(tx, current.user_id, current.tenant_id);
      if (active.membershipId !== current.membership_id) {
        throw new UnauthorizedException('Membership is no longer active');
      }
      await tx.$executeRaw`
        INSERT INTO auth_refresh_tokens
          (id, user_id, membership_id, tenant_id, token_hash, expires_at)
        VALUES (${nextId}, ${current.user_id}, ${current.membership_id}, ${current.tenant_id},
          ${nextHash}, DATE_ADD(CURRENT_TIMESTAMP, INTERVAL ${REFRESH_TTL_DAYS} DAY))
      `;
      await tx.$executeRaw`
        UPDATE auth_refresh_tokens SET revoked_at = CURRENT_TIMESTAMP, replaced_by_token_id = ${nextId}
        WHERE id = ${current.id} AND revoked_at IS NULL
      `;
      return active;
    });
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
    await this.prisma.$executeRaw`
      INSERT INTO auth_refresh_tokens (id, user_id, membership_id, tenant_id, token_hash, expires_at)
      VALUES (${id}, ${identity.sub}, ${identity.membershipId}, ${identity.tenantId},
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
