# Initial API contract (planned)

This document describes the first API boundaries. Implemented routes are identified below; remaining routes are planned and are not implemented by this scaffold.

## Authentication and tenant context

- `POST /api/v1/auth/wechat` — implemented: exchange a WeChat mini-program code server-side, then sign in only an already-linked user with an active institution membership. A multi-institution user must select a tenant.
- `POST /api/v1/auth/accept-invitation` — implemented: exchange a fresh WeChat code and consume a one-time institution invitation token in a transaction; creates or activates the invited account/membership, binds the WeChat identity, assigns only the invitation's tenant-local roles, audits acceptance, and returns a session. The invitation token is a bearer secret and must be delivered only to the intended invitee.
- `POST /api/v1/auth/refresh` — implemented: rotate opaque refresh token; reuse of a rotated credential revokes its token family.
- `POST /api/v1/auth/logout` — implemented: revoke the authenticated user's supplied refresh token.
- `GET /api/v1/me` — current user and tenant memberships.
- `POST /api/v1/tenants` — platform-only institution provisioning; atomically creates first tenant administrator.
- `GET /api/v1/tenants/:tenantId/members` — implemented: tenant-scoped membership list with assigned role codes.
- `POST /api/v1/tenants/:tenantId/invitations` — implemented: create a one-time invitation; raw token is returned once and must be delivered securely.
- `POST /api/v1/tenants/:tenantId/invitations/:invitationId/revoke` — implemented: revoke an unused invitation.
- `GET /api/v1/tenants/:tenantId/roles` — implemented: list tenant-local roles and permission codes.
- `POST /api/v1/tenants/:tenantId/roles` — implemented: create a custom tenant-local role using existing non-platform permission codes.
- `POST /api/v1/tenants/:tenantId/members/:membershipId/roles` — implemented: replace roles for an active member.
- `PATCH /api/v1/tenants/:tenantId/members/:membershipId/status` — implemented: suspend an active membership (the endpoint currently supports suspension only).

All routes require JWT authentication and a tenant ID matching the active membership. Member listing requires `tenant:members:read`; role listing requires `tenant:roles:read`; custom role creation requires `tenant:roles:manage`; invitation, member-role assignment, and suspension require `tenant:members:manage`. Mutations are audited; role changes and suspension protect the institution's final active system administrator. CI runs executable guard tests for tenant mismatch, missing identity, and missing permissions.

The active tenant must be selected from a verified membership. A client-supplied tenant ID is only a selector and must be checked against the caller's memberships on every request.

## Roles and entitlements

- `GET/POST /api/v1/tenants/:tenantId/roles`
- `PATCH /api/v1/tenants/:tenantId/roles/:roleId`
- `PUT /api/v1/tenants/:tenantId/roles/:roleId/permissions`
- `POST /api/v1/tenants/:tenantId/members/:membershipId/roles`
- `GET /api/v1/tenants/:tenantId/templates` — only templates enabled by active tenant packages.
- `GET /api/v1/catalog/templates` — platform catalogue visible to platform-authorized callers.

## Orders, inspection and review

- `POST /api/v1/tenants/:tenantId/orders` — implemented: create a vehicle/order, pin a published template version, and validate that the institution has an active package entitlement for the template.
- `GET /api/v1/tenants/:tenantId/orders` — implemented: tenant-scoped pagination and optional status filter.
- `GET /api/v1/tenants/:tenantId/orders/:orderId` — implemented: tenant-scoped order, locked template items, and saved inspection records.
- `PUT /api/v1/tenants/:tenantId/orders/:orderId/records/:itemId` — implemented: upsert a record only for an item in the order's pinned template version; assigned-inspector and state checks apply.
- `POST /api/v1/tenants/:tenantId/orders/:orderId/submissions` — implemented: checks every template item has a record, then moves the order to the review queue or resubmitted state. Evidence-photo policy validation and immutable submission snapshots remain pending.
- `GET /api/v1/tenants/:tenantId/orders/:orderId/reviews` — implemented: tenant-scoped review history.
- `POST /api/v1/tenants/:tenantId/orders/:orderId/reviews` — implemented: approve or return; return requires a comment, assigned inspector cannot review their own assigned order.
- `POST /api/v1/tenants/:tenantId/orders/:orderId/publication` — publish an approved report snapshot; planned.

Order read endpoints require `tenant:orders:read`; order creation, record updates and submission require `tenant:orders:manage`. The provisioned institution administrator receives both permissions. Order and record SQL queries always include the authenticated tenant ID; template versions are pinned at order creation and cannot be substituted while recording results. Submission currently checks record completeness, but does not yet enforce each item's evidence-photo policy, create an immutable submission snapshot, or provide reviewer approve/return endpoints. Review/publication routes remain planned.

## Photos and public report

- `POST /api/v1/tenants/:tenantId/uploads/presign` — issue short-lived upload authorization for COS.
- `POST /api/v1/tenants/:tenantId/orders/:orderId/photos/complete` — verify uploaded object and persist metadata.
- `POST /api/v1/tenants/:tenantId/reports/:reportId/shares` — create random share token, optional expiry/password.
- `DELETE /api/v1/tenants/:tenantId/reports/:reportId/shares/:shareId` — revoke share.
- `GET /api/v1/public/reports/:token` — allowlisted report snapshot without account registration.
- `GET /api/v1/public/reports/:token/photos/:photoId` — authorize and issue short-lived image access.

The public endpoints are token-authenticated, rate-limited, and must not accept tenant IDs as authorization. Share token values are shown once and stored hashed.
