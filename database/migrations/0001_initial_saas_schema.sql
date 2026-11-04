-- Initial SaaS schema for MySQL 8.0+
-- All tenant-owned records carry tenant_id. API repositories must scope every
-- tenant query by the authenticated membership's tenant_id; never trust client input.

CREATE TABLE tenants (
  id CHAR(36) PRIMARY KEY,
  name VARCHAR(160) NOT NULL,
  slug VARCHAR(80) NOT NULL UNIQUE,
  status ENUM('pending','active','suspended','closed') NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE users (
  id CHAR(36) PRIMARY KEY,
  phone VARCHAR(32) NULL UNIQUE,
  email VARCHAR(190) NULL UNIQUE,
  display_name VARCHAR(100) NOT NULL,
  password_hash VARCHAR(255) NULL,
  wx_openid VARCHAR(128) NULL UNIQUE,
  status ENUM('invited','active','disabled') NOT NULL DEFAULT 'invited',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE tenant_memberships (
  id CHAR(36) PRIMARY KEY,
  tenant_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  status ENUM('invited','active','suspended','left') NOT NULL DEFAULT 'invited',
  joined_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_membership_tenant_user (tenant_id, user_id),
  CONSTRAINT fk_membership_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  CONSTRAINT fk_membership_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE permissions (
  code VARCHAR(100) PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  description VARCHAR(255) NULL
) ENGINE=InnoDB;

CREATE TABLE roles (
  id CHAR(36) PRIMARY KEY,
  tenant_id CHAR(36) NOT NULL,
  code VARCHAR(80) NOT NULL,
  name VARCHAR(100) NOT NULL,
  is_system BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_role_tenant_code (tenant_id, code),
  CONSTRAINT fk_role_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id)
) ENGINE=InnoDB;

CREATE TABLE role_permissions (
  tenant_id CHAR(36) NOT NULL,
  role_id CHAR(36) NOT NULL,
  permission_code VARCHAR(100) NOT NULL,
  PRIMARY KEY (tenant_id, role_id, permission_code),
  CONSTRAINT fk_rp_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  CONSTRAINT fk_rp_role FOREIGN KEY (role_id) REFERENCES roles(id),
  CONSTRAINT fk_rp_permission FOREIGN KEY (permission_code) REFERENCES permissions(code)
) ENGINE=InnoDB;

CREATE TABLE user_roles (
  tenant_id CHAR(36) NOT NULL,
  membership_id CHAR(36) NOT NULL,
  role_id CHAR(36) NOT NULL,
  PRIMARY KEY (tenant_id, membership_id, role_id),
  CONSTRAINT fk_ur_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  CONSTRAINT fk_ur_membership FOREIGN KEY (membership_id) REFERENCES tenant_memberships(id),
  CONSTRAINT fk_ur_role FOREIGN KEY (role_id) REFERENCES roles(id)
) ENGINE=InnoDB;

CREATE TABLE standards (
  id CHAR(36) PRIMARY KEY,
  code VARCHAR(80) NOT NULL,
  name VARCHAR(200) NOT NULL,
  standard_type ENUM('national','group','other') NOT NULL,
  version_label VARCHAR(60) NOT NULL,
  effective_date DATE NULL,
  status ENUM('draft','active','superseded','withdrawn') NOT NULL DEFAULT 'draft',
  UNIQUE KEY uq_standard_code_version (code, version_label)
) ENGINE=InnoDB;

CREATE TABLE inspection_templates (
  id CHAR(36) PRIMARY KEY,
  owner_tenant_id CHAR(36) NULL,
  code VARCHAR(100) NOT NULL,
  name VARCHAR(160) NOT NULL,
  vehicle_type ENUM('passenger_car','motorcycle','other') NOT NULL,
  inspection_scope ENUM('full_vehicle','four_non','three_non','custom') NOT NULL,
  standard_id CHAR(36) NOT NULL,
  visibility ENUM('platform','tenant') NOT NULL DEFAULT 'platform',
  status ENUM('draft','published','archived') NOT NULL DEFAULT 'draft',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_template_owner_code (owner_tenant_id, code),
  CONSTRAINT fk_template_owner FOREIGN KEY (owner_tenant_id) REFERENCES tenants(id),
  CONSTRAINT fk_template_standard FOREIGN KEY (standard_id) REFERENCES standards(id)
) ENGINE=InnoDB;

CREATE TABLE template_versions (
  id CHAR(36) PRIMARY KEY,
  template_id CHAR(36) NOT NULL,
  version_label VARCHAR(40) NOT NULL,
  status ENUM('draft','published','retired') NOT NULL DEFAULT 'draft',
  definition_json JSON NOT NULL,
  published_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_template_version (template_id, version_label),
  CONSTRAINT fk_template_version_template FOREIGN KEY (template_id) REFERENCES inspection_templates(id)
) ENGINE=InnoDB;

CREATE TABLE inspection_items (
  id CHAR(36) PRIMARY KEY,
  template_version_id CHAR(36) NOT NULL,
  parent_id CHAR(36) NULL,
  item_code VARCHAR(100) NOT NULL,
  title VARCHAR(200) NOT NULL,
  description TEXT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  input_schema JSON NOT NULL,
  evidence_policy JSON NULL,
  UNIQUE KEY uq_item_version_code (template_version_id, item_code),
  CONSTRAINT fk_item_version FOREIGN KEY (template_version_id) REFERENCES template_versions(id),
  CONSTRAINT fk_item_parent FOREIGN KEY (parent_id) REFERENCES inspection_items(id)
) ENGINE=InnoDB;

CREATE TABLE inspection_rules (
  id CHAR(36) PRIMARY KEY,
  template_version_id CHAR(36) NOT NULL,
  item_id CHAR(36) NULL,
  rule_code VARCHAR(100) NOT NULL,
  rule_definition JSON NOT NULL,
  result_code VARCHAR(80) NOT NULL,
  explanation TEXT NULL,
  UNIQUE KEY uq_rule_version_code (template_version_id, rule_code),
  CONSTRAINT fk_rule_version FOREIGN KEY (template_version_id) REFERENCES template_versions(id),
  CONSTRAINT fk_rule_item FOREIGN KEY (item_id) REFERENCES inspection_items(id)
) ENGINE=InnoDB;

CREATE TABLE packages (
  id CHAR(36) PRIMARY KEY,
  code VARCHAR(80) NOT NULL UNIQUE,
  name VARCHAR(160) NOT NULL,
  status ENUM('draft','active','retired') NOT NULL DEFAULT 'draft',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE package_templates (
  package_id CHAR(36) NOT NULL,
  template_id CHAR(36) NOT NULL,
  PRIMARY KEY (package_id, template_id),
  CONSTRAINT fk_pt_package FOREIGN KEY (package_id) REFERENCES packages(id),
  CONSTRAINT fk_pt_template FOREIGN KEY (template_id) REFERENCES inspection_templates(id)
) ENGINE=InnoDB;

CREATE TABLE tenant_packages (
  id CHAR(36) PRIMARY KEY,
  tenant_id CHAR(36) NOT NULL,
  package_id CHAR(36) NOT NULL,
  status ENUM('trial','active','expired','suspended','cancelled') NOT NULL,
  starts_at DATETIME NOT NULL,
  ends_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_tenant_package_active (tenant_id, status, ends_at),
  CONSTRAINT fk_tenant_package_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  CONSTRAINT fk_tenant_package_package FOREIGN KEY (package_id) REFERENCES packages(id)
) ENGINE=InnoDB;

CREATE TABLE vehicles (
  id CHAR(36) PRIMARY KEY,
  tenant_id CHAR(36) NOT NULL,
  vin VARCHAR(32) NULL,
  plate_number VARCHAR(32) NULL,
  brand_model VARCHAR(160) NULL,
  first_registered_on DATE NULL,
  odometer_km INT NULL,
  color VARCHAR(40) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_vehicle_tenant_vin (tenant_id, vin),
  KEY idx_vehicle_tenant_plate (tenant_id, plate_number),
  CONSTRAINT fk_vehicle_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id)
) ENGINE=InnoDB;

CREATE TABLE orders (
  id CHAR(36) PRIMARY KEY,
  tenant_id CHAR(36) NOT NULL,
  order_number VARCHAR(64) NOT NULL,
  vehicle_id CHAR(36) NOT NULL,
  template_version_id CHAR(36) NOT NULL,
  created_by_membership_id CHAR(36) NOT NULL,
  assigned_to_membership_id CHAR(36) NULL,
  status ENUM('draft','in_progress','pending_review','needs_revision','resubmitted','approved','published','cancelled') NOT NULL DEFAULT 'draft',
  submitted_at DATETIME NULL,
  approved_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_order_tenant_number (tenant_id, order_number),
  KEY idx_order_tenant_status_created (tenant_id, status, created_at),
  CONSTRAINT fk_order_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  CONSTRAINT fk_order_vehicle FOREIGN KEY (vehicle_id) REFERENCES vehicles(id),
  CONSTRAINT fk_order_template_version FOREIGN KEY (template_version_id) REFERENCES template_versions(id),
  CONSTRAINT fk_order_creator FOREIGN KEY (created_by_membership_id) REFERENCES tenant_memberships(id),
  CONSTRAINT fk_order_assignee FOREIGN KEY (assigned_to_membership_id) REFERENCES tenant_memberships(id)
) ENGINE=InnoDB;

CREATE TABLE inspection_records (
  id CHAR(36) PRIMARY KEY,
  tenant_id CHAR(36) NOT NULL,
  order_id CHAR(36) NOT NULL,
  item_id CHAR(36) NOT NULL,
  result_code VARCHAR(80) NULL,
  result_json JSON NULL,
  notes TEXT NULL,
  updated_by_membership_id CHAR(36) NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_record_tenant_order_item (tenant_id, order_id, item_id),
  CONSTRAINT fk_record_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  CONSTRAINT fk_record_order FOREIGN KEY (order_id) REFERENCES orders(id),
  CONSTRAINT fk_record_item FOREIGN KEY (item_id) REFERENCES inspection_items(id),
  CONSTRAINT fk_record_editor FOREIGN KEY (updated_by_membership_id) REFERENCES tenant_memberships(id)
) ENGINE=InnoDB;

CREATE TABLE inspection_photos (
  id CHAR(36) PRIMARY KEY,
  tenant_id CHAR(36) NOT NULL,
  order_id CHAR(36) NOT NULL,
  record_id CHAR(36) NULL,
  object_key_original VARCHAR(512) NOT NULL,
  object_key_thumbnail VARCHAR(512) NULL,
  object_key_medium VARCHAR(512) NULL,
  mime_type VARCHAR(100) NOT NULL,
  file_size_bytes BIGINT UNSIGNED NOT NULL,
  width_px INT NULL,
  height_px INT NULL,
  captured_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_photo_tenant_order (tenant_id, order_id),
  CONSTRAINT fk_photo_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  CONSTRAINT fk_photo_order FOREIGN KEY (order_id) REFERENCES orders(id),
  CONSTRAINT fk_photo_record FOREIGN KEY (record_id) REFERENCES inspection_records(id)
) ENGINE=InnoDB;

CREATE TABLE reviews (
  id CHAR(36) PRIMARY KEY,
  tenant_id CHAR(36) NOT NULL,
  order_id CHAR(36) NOT NULL,
  reviewer_membership_id CHAR(36) NOT NULL,
  action ENUM('approved','returned') NOT NULL,
  comment TEXT NULL,
  submission_version INT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_review_tenant_order (tenant_id, order_id, created_at),
  CONSTRAINT fk_review_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  CONSTRAINT fk_review_order FOREIGN KEY (order_id) REFERENCES orders(id),
  CONSTRAINT fk_review_reviewer FOREIGN KEY (reviewer_membership_id) REFERENCES tenant_memberships(id)
) ENGINE=InnoDB;

CREATE TABLE reports (
  id CHAR(36) PRIMARY KEY,
  tenant_id CHAR(36) NOT NULL,
  order_id CHAR(36) NOT NULL,
  current_version INT NOT NULL DEFAULT 1,
  status ENUM('draft','approved','published','revoked') NOT NULL DEFAULT 'draft',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_report_tenant_order (tenant_id, order_id),
  CONSTRAINT fk_report_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  CONSTRAINT fk_report_order FOREIGN KEY (order_id) REFERENCES orders(id)
) ENGINE=InnoDB;

CREATE TABLE report_versions (
  id CHAR(36) PRIMARY KEY,
  tenant_id CHAR(36) NOT NULL,
  report_id CHAR(36) NOT NULL,
  version_number INT NOT NULL,
  snapshot_json JSON NOT NULL,
  pdf_object_key VARCHAR(512) NULL,
  approved_by_membership_id CHAR(36) NULL,
  published_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_report_version (report_id, version_number),
  CONSTRAINT fk_report_version_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  CONSTRAINT fk_report_version_report FOREIGN KEY (report_id) REFERENCES reports(id),
  CONSTRAINT fk_report_version_approver FOREIGN KEY (approved_by_membership_id) REFERENCES tenant_memberships(id)
) ENGINE=InnoDB;

CREATE TABLE report_share_tokens (
  id CHAR(36) PRIMARY KEY,
  tenant_id CHAR(36) NOT NULL,
  report_version_id CHAR(36) NOT NULL,
  token_hash CHAR(64) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NULL,
  expires_at DATETIME NULL,
  revoked_at DATETIME NULL,
  created_by_membership_id CHAR(36) NOT NULL,
  view_count BIGINT UNSIGNED NOT NULL DEFAULT 0,
  last_viewed_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_share_tenant_report (tenant_id, report_version_id),
  CONSTRAINT fk_share_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  CONSTRAINT fk_share_report_version FOREIGN KEY (report_version_id) REFERENCES report_versions(id),
  CONSTRAINT fk_share_creator FOREIGN KEY (created_by_membership_id) REFERENCES tenant_memberships(id)
) ENGINE=InnoDB;

CREATE TABLE audit_logs (
  id CHAR(36) PRIMARY KEY,
  tenant_id CHAR(36) NOT NULL,
  actor_membership_id CHAR(36) NULL,
  action VARCHAR(100) NOT NULL,
  resource_type VARCHAR(80) NOT NULL,
  resource_id CHAR(36) NOT NULL,
  metadata_json JSON NULL,
  ip_address VARCHAR(45) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_audit_tenant_resource (tenant_id, resource_type, resource_id, created_at),
  KEY idx_audit_tenant_actor (tenant_id, actor_membership_id, created_at),
  CONSTRAINT fk_audit_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  CONSTRAINT fk_audit_actor FOREIGN KEY (actor_membership_id) REFERENCES tenant_memberships(id)
) ENGINE=InnoDB;
