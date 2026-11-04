import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthUser } from './auth-user.interface';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    const secret = config.get<string>('JWT_ACCESS_SECRET');
    if (!secret || secret.length < 32) {
      throw new Error('JWT_ACCESS_SECRET must be configured with at least 32 characters');
    }
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
      algorithms: ['HS256'],
    });
  }

  validate(payload: Record<string, unknown>): AuthUser {
    const { sub, membershipId, tenantId, permissions, roles } = payload;
    if (
      typeof sub !== 'string' ||
      typeof membershipId !== 'string' ||
      typeof tenantId !== 'string' ||
      !Array.isArray(permissions) ||
      !permissions.every((item) => typeof item === 'string') ||
      !Array.isArray(roles) ||
      !roles.every((item) => typeof item === 'string')
    ) {
      throw new UnauthorizedException('Invalid access token claims');
    }
    return { sub, membershipId, tenantId, permissions, roles } as AuthUser;
  }
}