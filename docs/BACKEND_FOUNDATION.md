# Backend foundation and tenancy model

## Scope of this phase

This branch adds a NestJS API process, validated environment configuration, a health endpoint, an OpenAPI UI at `/docs`, a container build, and the first MySQL schema proposal. It does **not** yet implement production authentication, complete HTTP controllers, COS uploads, or report sharing.

## Tenant and identity rules

- A tenant is a customer inspection institution. A user may hold memberships in more than one tenant.
- On institution provisioning, create the tenant, its first active membership, and a system-protected `tenant_admin` role assignment in one transaction.
- Institution administrators manage only roles and memberships inside their own tenant. Platform super-administrator identities and permissions are separate from tenant roles.
- All tenant-owned rows carry `tenant_id`. Derive tenant scope from the authenticated membership, never from a request body, query string, or mini-program local state.
- For cross-table reads and writes, validate both `tenant_id` and resource ownership. Use composite tenant-aware foreign keys/unique constraints where practical, plus service-layer authorization.
- Prevent a user from removing the final active tenant administrator. Protect system role codes and platform-managed permissions from tenant edits.
- Audit membership changes, role/permission changes, order assignment, submissions, review decisions, report publication, share-token creation/revocation, and exports.

## Templates and commercial entitlements

The six initial catalogue entries are:
- Full vehicle inspection (national standard)
- Full vehicle inspection (group standard)
- Four-non-compliance screening (national standard)
- Four-non-compliance screening (group standard)
- Three-non-compliance screening (national standard)
- Three-non-compliance screening (group standard)

These are product/template names, not verified legal mappings. Standard codes, editions, scope, inspection items, evidence requirements, and decision rules must be reviewed against the authoritative standard text before activation.

Platform-owned templates may be assigned to packages. A tenant may use a template only while it has an active entitlement. A tenant-specific template copy must have an owner tenant and cannot be visible to another tenant. Published template versions are immutable. An order pins the exact `template_version_id` used when it is created; later template edits never rewrite historical orders.

## Order and review workflow

`draft -> in_progress -> pending_review -> approved -> published`

A reviewer may return a submission: `pending_review -> needs_revision -> resubmitted -> pending_review`. Each submission increments a version. A review decision records reviewer membership, action, comment, and the submitted version. The default policy is that the institution administrator or a tenant-authorized reviewer can review; optionally prohibit self-review by the assigned inspector.

Approval and publication are separate actions. Publishing creates an immutable report-version snapshot. Any later correction creates a new version and preserves the previous one.

## Report sharing and photo delivery

- Public report access uses a cryptographically random token; store only a hash of the token.
- A share token points to one immutable report version and can expire, be revoked, or be password protected.
- Public report responses must use a field allowlist and must never expose internal IDs, private contact data, COS credentials, or permanent object keys.
- Keep original, medium, and thumbnail object keys. Report pages load thumbnails first and lazy-load images as they approach the viewport; load the original only after a user opens an image.
- Use a CDN for image delivery. Prefer short-lived signed image URLs or an authorization-aware image endpoint so revoking the report share also prevents future image access.
- Do not return a report's entire photo collection as full-resolution images in the initial page payload.

## Database

The initial schema is in `database/migrations/0001_initial_saas_schema.sql`. It is a first-pass MySQL 8 schema and must be reviewed against the eventual ORM/migration runner before production use. Tenant isolation must be enforced in the API layer in addition to the schema.

## Local development

1. Copy `backend/.env.example` to `backend/.env` and replace local values.
2. Start MySQL with `docker compose up -d mysql`.
3. Run the SQL migration manually for this scaffold, then start the API with `cd backend && npm install && npm run start:dev`.
4. Check `GET /api/v1/health` and open `/docs`.

No real credentials belong in Git. The current health endpoint is a process liveness check, not a database readiness check.

## Authentication and tenant guards (scaffold)

The API now includes a Passport JWT strategy, a bearer-token guard, a current-user decorator, a tenant-context guard, and a permission-code guard. The example `GET /api/v1/me` endpoint returns verified token identity. The example `GET /api/v1/tenants/:tenantId/context` requires the route tenant ID to match the verified active membership and requires `tenant:read`.

Access tokens are expected to contain `sub`, `membershipId`, `tenantId`, `permissions`, and `roles` claims. These claims must only be minted by the server after loading the active user membership and effective permissions from the database. Never accept client-supplied role/permission claims or tenant IDs as authority. Every repository query and mutation must still scope by the verified tenant ID; route guards alone do not provide row-level isolation. Token issuance, refresh rotation, revocation, membership lookup, and tenant provisioning are not implemented yet.


## Tenant-safe relational constraints

Migration `0002_tenant_composite_foreign_keys.sql` adds composite foreign keys for tenant-owned relationships. This prevents a row in one institution from referencing another institution's membership, role, vehicle, order, report, or report version even if an application query accidentally supplies a mismatched identifier. Apply migrations in numeric order.

The migration is additive and retains the original single-column foreign keys. Before applying it to an existing database, check for legacy cross-tenant references; MySQL will reject the migration if any violate the new constraints. The API must still derive tenant scope from the verified membership and include tenant predicates in every read and write. Database constraints are defense in depth, not a replacement for authorization.


## Prisma persistence and institution provisioning

The backend now includes a Prisma Client service and a global database module. The first Prisma schema maps the existing `tenants` table; institution provisioning uses parameterized Prisma raw SQL inside one interactive transaction because the full legacy schema is still being incrementally mapped.

`TenantProvisioningService.provision()` atomically creates:
- an active tenant;
- the first active user and tenant membership;
- a protected system `tenant_admin` role;
- the initial tenant-administration permission grants and user-role assignment;
- an audit event identifying the provisioning action.

The service requires an administrator phone number or email and validates the tenant slug. Duplicate unique values or any failed insert roll back the entire transaction. The service is registered for internal use but deliberately has no public controller yet: exposing institution creation before a verified platform-super-admin authorization mechanism exists would be unsafe. The future `POST /api/v1/tenants` endpoint must be platform-only and call this service after authorization.

Set `DATABASE_URL` in the backend environment before invoking database-backed services. The API process can still start without it for the existing liveness-only health endpoint, but provisioning cannot run without a reachable MySQL database. Prisma Client generation runs during backend dependency installation; the Docker build copies the Prisma schema before installing dependencies.


## Tenant invitations and membership administration (service layer)

Migration `0003_tenant_invitations.sql` adds tenant-scoped invitations. The invitation service generates a cryptographically random one-time token, persists only its SHA-256 hash, bounds expiry to 1–168 hours, supports revocation, and writes audit events. The raw token is returned once to a trusted delivery adapter; no SMS/email delivery or invitation-acceptance endpoint is included yet.

The membership service also supports tenant-scoped custom role creation, role assignment, and member suspension. It rejects unknown roles/permissions, prevents tenant roles from receiving `platform:` permissions, and serializes membership mutations on the tenant row while checking that at least one active system `tenant_admin` remains. System-role editing/deletion endpoints are not exposed. These are internal service methods only; public controllers and end-to-end authentication are intentionally deferred until server-side login and database-backed membership claims are complete.

Apply migrations in order: `0001`, `0002`, then `0003`. The migration chain and transactional behavior still require execution against a real MySQL 8 instance before production.
