# Initial API contract (planned)

This document describes the first API boundaries. Implemented routes are identified below; remaining routes are planned and are not implemented by this scaffold.

## Authentication and tenant context

- `POST /api/v1/auth/wechat` — implemented: exchange a WeChat mini-program code server-side, then sign in only an already-linked user with an active institution membership. A multi-institution user must select a tenant.
- `POST /api/v1/auth/refresh` — implemented: rotate opaque refresh token; reuse of a rotated credential revokes its token family.
- `POST /api/v1/auth/logout` — implemented: revoke the authenticated user's supplied refresh token.
- `GET /api/v1/me` — current user and tenant memberships.
- `POST /api/v1/tenants` — platform-only institution provisioning; atomically creates first tenant administrator.
- `POST /api/v1/tenants/:tenantId/invitations` — tenant-admin invitation.
- `GET /api/v1/tenants/:tenantId/members` — tenant-scoped membership list.

The active tenant must be selected from a verified membership. A client-supplied tenant ID is only a selector and must be checked against the caller's memberships on every request.

## Roles and entitlements

- `GET/POST /api/v1/tenants/:tenantId/roles`
- `PATCH /api/v1/tenants/:tenantId/roles/:roleId`
- `PUT /api/v1/tenants/:tenantId/roles/:roleId/permissions`
- `POST /api/v1/tenants/:tenantId/members/:membershipId/roles`
- `GET /api/v1/tenants/:tenantId/templates` — only templates enabled by active tenant packages.
- `GET /api/v1/catalog/templates` — platform catalogue visible to platform-authorized callers.

## Orders, inspection and review

- `POST /api/v1/tenants/:tenantId/orders` — create order and pin template version.
- `GET /api/v1/tenants/:tenantId/orders`
- `GET /api/v1/tenants/:tenantId/orders/:orderId`
- `PUT /api/v1/tenants/:tenantId/orders/:orderId/records/:itemId`
- `POST /api/v1/tenants/:tenantId/orders/:orderId/submissions` — idempotent submission with a new immutable submission version.
- `POST /api/v1/tenants/:tenantId/orders/:orderId/reviews` — approve or return with a required comment on return.
- `POST /api/v1/tenants/:tenantId/orders/:orderId/publication` — publish an approved report snapshot.

All writes must validate tenant ownership, assignment/role permissions, order state, and optimistic version before mutation.

## Photos and public report

- `POST /api/v1/tenants/:tenantId/uploads/presign` — issue short-lived upload authorization for COS.
- `POST /api/v1/tenants/:tenantId/orders/:orderId/photos/complete` — verify uploaded object and persist metadata.
- `POST /api/v1/tenants/:tenantId/reports/:reportId/shares` — create random share token, optional expiry/password.
- `DELETE /api/v1/tenants/:tenantId/reports/:reportId/shares/:shareId` — revoke share.
- `GET /api/v1/public/reports/:token` — allowlisted report snapshot without account registration.
- `GET /api/v1/public/reports/:token/photos/:photoId` — authorize and issue short-lived image access.

The public endpoints are token-authenticated, rate-limited, and must not accept tenant IDs as authorization. Share token values are shown once and stored hashed.
