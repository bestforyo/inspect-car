-- One-time tenant invitations. Only token hashes are persisted.
CREATE TABLE tenant_invitations (
  id CHAR(36) PRIMARY KEY,
  tenant_id CHAR(36) NOT NULL,
  invitee_phone VARCHAR(32) NULL,
  invitee_email VARCHAR(190) NULL,
  token_hash CHAR(64) NOT NULL UNIQUE,
  role_ids_json JSON NOT NULL,
  invited_by_membership_id CHAR(36) NOT NULL,
  expires_at DATETIME NOT NULL,
  accepted_at DATETIME NULL,
  revoked_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_invitation_tenant_status (tenant_id, expires_at, accepted_at, revoked_at),
  CONSTRAINT fk_invitation_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  CONSTRAINT fk_invitation_inviter FOREIGN KEY (tenant_id, invited_by_membership_id)
    REFERENCES tenant_memberships(tenant_id, id)
) ENGINE=InnoDB;
