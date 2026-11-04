-- Grant report publication and sharing capabilities to existing institution administrators.
INSERT IGNORE INTO permissions (code, name, description)
VALUES
  ('tenant:reports:publish', '报告发布管理', '发布或撤销机构已审核通过的检测报告'),
  ('tenant:reports:share', '报告分享管理', '创建和撤销客户免登录报告分享链接');

INSERT IGNORE INTO role_permissions (tenant_id, role_id, permission_code)
SELECT r.tenant_id, r.id, p.code
FROM roles r
JOIN permissions p ON p.code IN ('tenant:reports:publish', 'tenant:reports:share')
WHERE r.code = 'tenant_admin';
