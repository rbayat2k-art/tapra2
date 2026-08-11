CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE workspaces (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    slug text NOT NULL UNIQUE CHECK (slug = lower(slug)),
    name text NOT NULL CHECK (length(trim(name)) > 0),
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE companies (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL REFERENCES workspaces(id),
    code text NOT NULL,
    name text NOT NULL CHECK (length(trim(name)) > 0),
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (workspace_id, id),
    UNIQUE (workspace_id, code)
);

CREATE TABLE persons (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name text NOT NULL CHECK (length(trim(full_name)) > 0),
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE user_accounts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    person_id uuid NOT NULL UNIQUE REFERENCES persons(id),
    email text NOT NULL CHECK (email = lower(email)),
    password_hash text NOT NULL,
    identity_provider text NOT NULL DEFAULT 'local',
    external_subject text,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (email),
    UNIQUE NULLS NOT DISTINCT (identity_provider, external_subject)
);

CREATE TABLE memberships (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL REFERENCES workspaces(id),
    company_id uuid,
    person_id uuid NOT NULL REFERENCES persons(id),
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'ended')),
    valid_from timestamptz NOT NULL DEFAULT now(),
    valid_until timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (workspace_id, id),
    UNIQUE (workspace_id, company_id, person_id),
    FOREIGN KEY (workspace_id, company_id) REFERENCES companies(workspace_id, id)
);

CREATE TABLE permissions (
    code text PRIMARY KEY,
    description text NOT NULL
);

CREATE TABLE roles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL REFERENCES workspaces(id),
    code text NOT NULL,
    name text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (workspace_id, id),
    UNIQUE (workspace_id, code)
);

CREATE TABLE role_permissions (
    role_id uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission_code text NOT NULL REFERENCES permissions(code) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_code)
);

CREATE TABLE role_assignments (
    workspace_id uuid NOT NULL,
    membership_id uuid NOT NULL,
    role_id uuid NOT NULL,
    assigned_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (membership_id, role_id),
    FOREIGN KEY (workspace_id, membership_id) REFERENCES memberships(workspace_id, id) ON DELETE CASCADE,
    FOREIGN KEY (workspace_id, role_id) REFERENCES roles(workspace_id, id) ON DELETE CASCADE
);

CREATE TABLE sessions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    token_hash char(64) NOT NULL UNIQUE,
    csrf_token char(64) NOT NULL,
    user_account_id uuid NOT NULL REFERENCES user_accounts(id) ON DELETE CASCADE,
    active_membership_id uuid REFERENCES memberships(id),
    expires_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    last_seen_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX sessions_token_hash_idx ON sessions(token_hash);
CREATE INDEX memberships_person_idx ON memberships(person_id) WHERE status = 'active';

CREATE TABLE customers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL,
    company_id uuid NOT NULL,
    full_name text NOT NULL CHECK (length(trim(full_name)) > 0),
    phone_primary text NOT NULL CHECK (length(trim(phone_primary)) > 0),
    phone_secondary text,
    address text,
    province text,
    city text,
    postal_code text,
    created_by_user_account_id uuid NOT NULL REFERENCES user_accounts(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (workspace_id, id),
    UNIQUE (workspace_id, company_id, phone_primary),
    FOREIGN KEY (workspace_id, company_id) REFERENCES companies(workspace_id, id)
);

CREATE INDEX customers_context_created_idx ON customers(workspace_id, company_id, created_at DESC);

CREATE TABLE audit_entries (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id uuid NOT NULL,
    company_id uuid,
    actor_user_account_id uuid NOT NULL REFERENCES user_accounts(id),
    action text NOT NULL,
    resource_type text NOT NULL,
    resource_id uuid NOT NULL,
    result text NOT NULL CHECK (result IN ('success', 'failure')),
    reason text,
    previous_state jsonb,
    new_state jsonb,
    correlation_id text NOT NULL,
    occurred_at timestamptz NOT NULL DEFAULT now(),
    FOREIGN KEY (workspace_id, company_id) REFERENCES companies(workspace_id, id)
);

CREATE INDEX audit_entries_resource_idx ON audit_entries(workspace_id, resource_type, resource_id, occurred_at DESC);

ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers FORCE ROW LEVEL SECURITY;
CREATE POLICY customers_context_policy ON customers
    FOR ALL TO tapra2_app
    USING (
        workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid
        AND company_id = NULLIF(current_setting('app.company_id', true), '')::uuid
    )
    WITH CHECK (
        workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid
        AND company_id = NULLIF(current_setting('app.company_id', true), '')::uuid
    );

ALTER TABLE audit_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_entries FORCE ROW LEVEL SECURITY;
CREATE POLICY audit_entries_context_policy ON audit_entries
    FOR ALL TO tapra2_app
    USING (
        workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid
        AND (company_id IS NULL OR company_id = NULLIF(current_setting('app.company_id', true), '')::uuid)
    )
    WITH CHECK (
        workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid
        AND (company_id IS NULL OR company_id = NULLIF(current_setting('app.company_id', true), '')::uuid)
    );

REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO tapra2_app;
GRANT SELECT ON workspaces, companies, persons, user_accounts, memberships, permissions, roles, role_permissions, role_assignments TO tapra2_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON sessions TO tapra2_app;
GRANT SELECT, INSERT ON customers TO tapra2_app;
GRANT SELECT, INSERT ON audit_entries TO tapra2_app;

ALTER DEFAULT PRIVILEGES FOR ROLE tapra2_owner IN SCHEMA public GRANT SELECT ON TABLES TO tapra2_app;
