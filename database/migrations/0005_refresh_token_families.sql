-- Refresh-token family tracking enables reuse detection after rotation.
-- Backfill each existing credential into its own family before enforcing NOT NULL.
ALTER TABLE auth_refresh_tokens
  ADD COLUMN family_id CHAR(36) NULL AFTER id;

UPDATE auth_refresh_tokens
SET family_id = id
WHERE family_id IS NULL;

ALTER TABLE auth_refresh_tokens
  MODIFY family_id CHAR(36) NOT NULL,
  ADD KEY idx_refresh_family (family_id, revoked_at);
