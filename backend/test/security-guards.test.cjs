const test = require('node:test');
const assert = require('node:assert/strict');
const {
  ForbiddenException,
} = require('@nestjs/common');
const {
  TenantContextGuard,
} = require('../dist/tenancy/tenant-context.guard');
const {
  PermissionsGuard,
} = require('../dist/tenancy/permissions.guard');

function executionContext(request, handler = () => undefined, controller = class TestController {}) {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => handler,
    getClass: () => controller,
  };
}

test('tenant context accepts the authenticated tenant', () => {
  const guard = new TenantContextGuard();
  const context = executionContext({
    user: { tenantId: 'tenant-a', membershipId: 'member-a' },
    params: { tenantId: 'tenant-a' },
  });
  assert.equal(guard.canActivate(context), true);
});

test('tenant context rejects cross-tenant path identifiers', () => {
  const guard = new TenantContextGuard();
  const context = executionContext({
    user: { tenantId: 'tenant-a', membershipId: 'member-a' },
    params: { tenantId: 'tenant-b' },
  });
  assert.throws(() => guard.canActivate(context), ForbiddenException);
});

test('tenant context rejects requests without an authenticated membership', () => {
  const guard = new TenantContextGuard();
  assert.throws(
    () => guard.canActivate(executionContext({ params: { tenantId: 'tenant-a' } })),
    ForbiddenException,
  );
});

test('permission guard allows a user with every required permission', () => {
  const reflector = { getAllAndOverride: () => ['tenant:members:read', 'tenant:roles:read'] };
  const guard = new PermissionsGuard(reflector);
  const context = executionContext({
    user: { permissions: ['tenant:members:read', 'tenant:roles:read'] },
  });
  assert.equal(guard.canActivate(context), true);
});

test('permission guard rejects a user missing any required permission', () => {
  const reflector = { getAllAndOverride: () => ['tenant:members:manage'] };
  const guard = new PermissionsGuard(reflector);
  const context = executionContext({
    user: { permissions: ['tenant:members:read'] },
  });
  assert.throws(() => guard.canActivate(context), ForbiddenException);
});

test('permission guard permits routes without declared permissions', () => {
  const reflector = { getAllAndOverride: () => undefined };
  const guard = new PermissionsGuard(reflector);
  assert.equal(guard.canActivate(executionContext({ user: {} })), true);
});
