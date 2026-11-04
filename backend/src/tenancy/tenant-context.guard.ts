import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { AuthUser } from '../auth/auth-user.interface';

@Injectable()
export class TenantContextGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{
      user?: AuthUser;
      params?: Record<string, string>;
    }>();
    const user = request.user;
    if (!user) throw new ForbiddenException('Authenticated tenant membership required');

    const requestedTenantId = request.params?.tenantId;
    if (requestedTenantId && requestedTenantId !== user.tenantId) {
      throw new ForbiddenException('Cross-tenant access is forbidden');
    }
    return true;
  }
}