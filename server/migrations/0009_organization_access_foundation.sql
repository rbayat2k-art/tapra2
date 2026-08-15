ALTER TABLE companies
  ADD COLUMN description text,
  ADD COLUMN is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE user_accounts
  ADD COLUMN requires_password_change boolean NOT NULL DEFAULT false,
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE memberships
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();

CREATE UNIQUE INDEX memberships_scope_person_unique_idx
  ON memberships(workspace_id, company_id, person_id) NULLS NOT DISTINCT;

ALTER TABLE roles
  ADD COLUMN description text,
  ADD COLUMN is_system boolean NOT NULL DEFAULT false,
  ADD COLUMN is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();

CREATE TABLE organization_units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  company_id uuid,
  parent_id uuid,
  unit_type text NOT NULL CHECK (unit_type IN ('BRANCH', 'DEPARTMENT', 'TEAM', 'SHARED_SERVICE')),
  code text NOT NULL CHECK (length(trim(code)) BETWEEN 1 AND 50),
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 200),
  description text,
  service_kind text CHECK (service_kind IS NULL OR service_kind IN ('HR', 'DATA', 'MIS', 'OTHER')),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, id),
  FOREIGN KEY (workspace_id, company_id) REFERENCES companies(workspace_id, id),
  FOREIGN KEY (workspace_id, parent_id) REFERENCES organization_units(workspace_id, id),
  CHECK (
    (unit_type = 'SHARED_SERVICE' AND company_id IS NULL AND service_kind IS NOT NULL)
    OR (unit_type <> 'SHARED_SERVICE' AND company_id IS NOT NULL AND service_kind IS NULL)
  )
);

CREATE UNIQUE INDEX organization_units_context_code_unique_idx
  ON organization_units(workspace_id, company_id, code) NULLS NOT DISTINCT;
CREATE INDEX organization_units_workspace_company_idx
  ON organization_units(workspace_id, company_id, unit_type, is_active);

ALTER TABLE role_assignments DROP CONSTRAINT role_assignments_pkey;
ALTER TABLE role_assignments
  ADD COLUMN id uuid DEFAULT gen_random_uuid(),
  ADD COLUMN scope_type text,
  ADD COLUMN company_id uuid,
  ADD COLUMN organization_unit_id uuid,
  ADD COLUMN assigned_by_user_account_id uuid REFERENCES user_accounts(id),
  ADD COLUMN valid_until timestamptz,
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();

UPDATE role_assignments assignment
SET scope_type = CASE WHEN membership.company_id IS NULL THEN 'WORKSPACE' ELSE 'COMPANY' END,
    company_id = membership.company_id
FROM memberships membership
WHERE membership.id = assignment.membership_id;

ALTER TABLE role_assignments
  ALTER COLUMN id SET NOT NULL,
  ALTER COLUMN scope_type SET NOT NULL,
  ADD CONSTRAINT role_assignments_pkey PRIMARY KEY (id),
  ADD CONSTRAINT role_assignments_scope_type_check CHECK (
    scope_type IN ('WORKSPACE', 'COMPANY', 'BRANCH', 'DEPARTMENT', 'TEAM', 'SELF')
  ),
  ADD CONSTRAINT role_assignments_company_fk
    FOREIGN KEY (workspace_id, company_id) REFERENCES companies(workspace_id, id),
  ADD CONSTRAINT role_assignments_unit_fk
    FOREIGN KEY (workspace_id, organization_unit_id) REFERENCES organization_units(workspace_id, id),
  ADD CONSTRAINT role_assignments_scope_target_check CHECK (
    (scope_type = 'WORKSPACE' AND company_id IS NULL AND organization_unit_id IS NULL)
    OR (scope_type = 'COMPANY' AND company_id IS NOT NULL AND organization_unit_id IS NULL)
    OR (scope_type IN ('BRANCH', 'DEPARTMENT', 'TEAM') AND company_id IS NOT NULL AND organization_unit_id IS NOT NULL)
    OR (scope_type = 'SELF' AND organization_unit_id IS NULL)
  );

CREATE UNIQUE INDEX role_assignments_scoped_unique_idx
  ON role_assignments(membership_id, role_id, scope_type, company_id, organization_unit_id)
  NULLS NOT DISTINCT;
CREATE INDEX role_assignments_context_idx
  ON role_assignments(workspace_id, company_id, organization_unit_id, scope_type);

CREATE FUNCTION infer_legacy_role_assignment_scope()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE membership_company_id uuid;
BEGIN
  IF NEW.scope_type IS NULL THEN
    SELECT company_id INTO membership_company_id FROM memberships WHERE id = NEW.membership_id;
    NEW.scope_type := CASE WHEN membership_company_id IS NULL THEN 'WORKSPACE' ELSE 'COMPANY' END;
    NEW.company_id := membership_company_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER role_assignments_legacy_scope_trigger
  BEFORE INSERT ON role_assignments
  FOR EACH ROW EXECUTE FUNCTION infer_legacy_role_assignment_scope();

ALTER TABLE sessions
  ADD COLUMN active_scope_type text CHECK (
    active_scope_type IS NULL OR active_scope_type IN ('WORKSPACE', 'COMPANY', 'BRANCH', 'DEPARTMENT', 'TEAM', 'SELF')
  ),
  ADD COLUMN active_scope_id uuid;

UPDATE sessions session
SET active_scope_type = CASE WHEN membership.company_id IS NULL THEN 'WORKSPACE' ELSE 'COMPANY' END,
    active_scope_id = COALESCE(membership.company_id, membership.workspace_id)
FROM memberships membership
WHERE membership.id = session.active_membership_id;

CREATE TABLE legacy_role_mappings (
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  legacy_role_code text NOT NULL,
  role_id uuid,
  migration_status text NOT NULL DEFAULT 'UNMAPPED'
    CHECK (migration_status IN ('UNMAPPED', 'PARTIAL', 'MAPPED', 'REVIEW_REQUIRED')),
  notes text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, legacy_role_code),
  FOREIGN KEY (workspace_id, role_id) REFERENCES roles(workspace_id, id)
);

INSERT INTO permissions(code, description) VALUES
  ('organization.read', 'Read the permitted Organization structure and access assignments'),
  ('organization.company.manage', 'Create and update Companies in the permitted scope'),
  ('organization.unit.manage', 'Create and update Branch, Department, Team and Shared Service units'),
  ('organization.user.manage', 'Create and activate or deactivate UserAccounts'),
  ('organization.membership.manage', 'Create and update Memberships'),
  ('organization.role.manage', 'Create Roles, configure permissions and assign scoped Roles'),
  ('organization.impersonate', 'Start a time-limited audited impersonation session')
ON CONFLICT (code) DO UPDATE SET description = EXCLUDED.description;

ALTER TABLE organization_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_units FORCE ROW LEVEL SECURITY;
CREATE POLICY organization_units_workspace_policy ON organization_units FOR ALL TO tapra2_app
  USING (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid)
  WITH CHECK (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE ON companies, persons, user_accounts, memberships, roles,
  role_permissions, role_assignments, organization_units, legacy_role_mappings TO tapra2_app;
