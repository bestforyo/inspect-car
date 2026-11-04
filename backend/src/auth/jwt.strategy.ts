import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthService } from './auth.service';
import { AuthUser } from './auth-user.interface';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService, private readonly auth: AuthService) {
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

  async validate(payload: Record<string, unknown>): Promise<AuthUser> {
    const { sub, membershipId, tenantId } = payload;
    if (typeof sub !== 'string' || typeof membershipId !== 'string' || typeof tenantId !== 'string') {
      throw new UnauthorizedException('Invalid access token claims');
    }
    const identity = await this.auth.loadActiveIdentity(sub, tenantId);
    if (identity.membershipId !== membershipId) {
      throw new UnauthorizedException('Token membership is no longer valid');
    }
    return identity;
  }
}
