export interface AuthUser {
  sub: string;
  membershipId: string;
  tenantId: string;
  permissions: string[];
  roles: string[];
}