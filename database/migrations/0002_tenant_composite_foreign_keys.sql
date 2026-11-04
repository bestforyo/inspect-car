-- Enforce tenant consistency across relationships.
-- MySQL requires referenced column sets to be indexed uniquely. Existing single-column
-- foreign keys are retained for backwards-compatible referential checks; these composite
-- constraints additionally prevent cross-tenant links.

ALTER TABLE tenant_memberships
  ADD UNIQUE KEY uq_membership_tenant_id (tenant_id, id);
ALTER TABLE roles
  ADD UNIQUE KEY uq_role_tenant_id (tenant_id, id);
ALTER TABLE vehicles
  ADD UNIQUE KEY uq_vehicle_tenant_id (tenant_id, id);
ALTER TABLE orders
  ADD UNIQUE KEY uq_order_tenant_id (tenant_id, id);
ALTER TABLE inspection_records
  ADD UNIQUE KEY uq_record_tenant_id (tenant_id, id);
ALTER TABLE report_versions
  ADD UNIQUE KEY uq_report_version_tenant_id (tenant_id, id);
ALTER TABLE reports
  ADD UNIQUE KEY uq_report_tenant_id (tenant_id, id);

ALTER TABLE role_permissions
  ADD CONSTRAINT fk_rp_tenant_role
    FOREIGN KEY (tenant_id, role_id) REFERENCES roles(tenant_id, id);

ALTER TABLE user_roles
  ADD CONSTRAINT fk_ur_tenant_membership
    FOREIGN KEY (tenant_id, membership_id) REFERENCES tenant_memberships(tenant_id, id),
  ADD CONSTRAINT fk_ur_tenant_role
    FOREIGN KEY (tenant_id, role_id) REFERENCES roles(tenant_id, id);

ALTER TABLE orders
  ADD CONSTRAINT fk_order_tenant_vehicle
    FOREIGN KEY (tenant_id, vehicle_id) REFERENCES vehicles(tenant_id, id),
  ADD CONSTRAINT fk_order_tenant_creator
    FOREIGN KEY (tenant_id, created_by_membership_id) REFERENCES tenant_memberships(tenant_id, id),
  ADD CONSTRAINT fk_order_tenant_assignee
    FOREIGN KEY (tenant_id, assigned_to_membership_id) REFERENCES tenant_memberships(tenant_id, id);

ALTER TABLE inspection_records
  ADD CONSTRAINT fk_record_tenant_order
    FOREIGN KEY (tenant_id, order_id) REFERENCES orders(tenant_id, id),
  ADD CONSTRAINT fk_record_tenant_editor
    FOREIGN KEY (tenant_id, updated_by_membership_id) REFERENCES tenant_memberships(tenant_id, id);

ALTER TABLE inspection_photos
  ADD CONSTRAINT fk_photo_tenant_order
    FOREIGN KEY (tenant_id, order_id) REFERENCES orders(tenant_id, id);

ALTER TABLE reviews
  ADD CONSTRAINT fk_review_tenant_order
    FOREIGN KEY (tenant_id, order_id) REFERENCES orders(tenant_id, id),
  ADD CONSTRAINT fk_review_tenant_reviewer
    FOREIGN KEY (tenant_id, reviewer_membership_id) REFERENCES tenant_memberships(tenant_id, id);

ALTER TABLE reports
  ADD CONSTRAINT fk_report_tenant_order
    FOREIGN KEY (tenant_id, order_id) REFERENCES orders(tenant_id, id);

ALTER TABLE report_versions
  ADD CONSTRAINT fk_report_version_tenant_report
    FOREIGN KEY (tenant_id, report_id) REFERENCES reports(tenant_id, id),
  ADD CONSTRAINT fk_report_version_tenant_approver
    FOREIGN KEY (tenant_id, approved_by_membership_id) REFERENCES tenant_memberships(tenant_id, id);

ALTER TABLE report_share_tokens
  ADD CONSTRAINT fk_share_tenant_report_version
    FOREIGN KEY (tenant_id, report_version_id) REFERENCES report_versions(tenant_id, id),
  ADD CONSTRAINT fk_share_tenant_creator
    FOREIGN KEY (tenant_id, created_by_membership_id) REFERENCES tenant_memberships(tenant_id, id);

ALTER TABLE audit_logs
  ADD CONSTRAINT fk_audit_tenant_actor
    FOREIGN KEY (tenant_id, actor_membership_id) REFERENCES tenant_memberships(tenant_id, id);
