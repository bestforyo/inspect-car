-- Opaque rotating refresh credentials; only SHA-256 token hashes are stored.
CREATE TABLE auth_refresh_tokens (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  membership_id CHAR(36) NOT NULL,
  tenant_id CHAR(36) NOT NULL,
  token_hash CHAR(64) NOT NULL UNIQUE,
  expires_at DATETIME NOT NULL,
  revoked_at DATETIME NULL,
  replaced_by_token_id CHAR(36) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_refresh_user_active (user_id, revoked_at, expires_at),
  CONSTRAINT fk_refresh_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_refresh_membership FOREIGN KEY (tenant_id, membership_id)
    REFERENCES tenant_memberships(tenant_id, id),
  CONSTRAINT fk_refresh_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  CONSTRAINT fk_refresh_replacement FOREIGN KEY (replaced_by_token_id) REFERENCES auth_refresh_tokens(id)
) ENGINE=InnoDB;
