ALTER TABLE customer_identities
  ADD COLUMN status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'merged')),
  ADD COLUMN merged_into_identity_id uuid,
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now(),
  ADD CONSTRAINT customer_identities_merged_into_fk
    FOREIGN KEY (workspace_id, merged_into_identity_id)
    REFERENCES customer_identities(workspace_id, id),
  ADD CONSTRAINT customer_identities_merge_state_check CHECK (
    (status = 'active' AND merged_into_identity_id IS NULL)
    OR (status = 'merged' AND merged_into_identity_id IS NOT NULL AND merged_into_identity_id <> id)
  );

CREATE INDEX customer_identities_canonical_lookup_idx
  ON customer_identities(workspace_id, merged_into_identity_id)
  WHERE status = 'merged';

-- The migration owner needs to backfill every tenant row without an application
-- context. Runtime access remains protected because the migration is transactional
-- and FORCE RLS is restored before commit.
ALTER TABLE customers NO FORCE ROW LEVEL SECURITY;
ALTER TABLE customer_identities NO FORCE ROW LEVEL SECURITY;

ALTER TABLE customers ADD COLUMN canonical_identity_id uuid;

UPDATE customers SET canonical_identity_id = identity_id;

ALTER TABLE customers
  ALTER COLUMN canonical_identity_id SET NOT NULL,
  ADD CONSTRAINT customers_workspace_canonical_identity_fk
    FOREIGN KEY (workspace_id, canonical_identity_id)
    REFERENCES customer_identities(workspace_id, id);

DROP INDEX customers_company_identity_unique_idx;

CREATE UNIQUE INDEX customers_company_canonical_identity_active_idx
  ON customers(workspace_id, company_id, canonical_identity_id)
  WHERE status = 'active';

CREATE INDEX customers_workspace_canonical_identity_idx
  ON customers(workspace_id, canonical_identity_id, status);

ALTER TABLE customers FORCE ROW LEVEL SECURITY;
ALTER TABLE customer_identities FORCE ROW LEVEL SECURITY;

CREATE TABLE customer_identity_merge_operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  canonical_identity_id uuid NOT NULL,
  merged_identity_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'reversed')),
  reason text NOT NULL CHECK (length(trim(reason)) BETWEEN 3 AND 500),
  merged_by_user_account_id uuid NOT NULL REFERENCES user_accounts(id),
  merged_at timestamptz NOT NULL DEFAULT now(),
  reversed_by_user_account_id uuid REFERENCES user_accounts(id),
  reversed_at timestamptz,
  reversal_reason text,
  idempotency_key uuid NOT NULL,
  lineage_snapshot jsonb NOT NULL,
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, idempotency_key),
  FOREIGN KEY (workspace_id, canonical_identity_id)
    REFERENCES customer_identities(workspace_id, id),
  FOREIGN KEY (workspace_id, merged_identity_id)
    REFERENCES customer_identities(workspace_id, id),
  CHECK (canonical_identity_id <> merged_identity_id),
  CHECK (
    (status = 'active' AND reversed_by_user_account_id IS NULL AND reversed_at IS NULL AND reversal_reason IS NULL)
    OR (
      status = 'reversed'
      AND reversed_by_user_account_id IS NOT NULL
      AND reversed_at IS NOT NULL
      AND length(trim(reversal_reason)) BETWEEN 3 AND 500
    )
  )
);

CREATE UNIQUE INDEX customer_identity_merge_one_active_source_idx
  ON customer_identity_merge_operations(workspace_id, merged_identity_id)
  WHERE status = 'active';

CREATE INDEX customer_identity_merge_canonical_history_idx
  ON customer_identity_merge_operations(workspace_id, canonical_identity_id, merged_at DESC);

ALTER TABLE customer_identity_merge_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_identity_merge_operations FORCE ROW LEVEL SECURITY;

CREATE POLICY customer_identity_merge_workspace_policy
  ON customer_identity_merge_operations FOR ALL TO tapra2_app
  USING (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid)
  WITH CHECK (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid);

INSERT INTO permissions(code, description) VALUES
  ('customer.identity.reconcile', 'Merge and reverse Workspace Customer identities with lineage and audit')
ON CONFLICT (code) DO UPDATE SET description = EXCLUDED.description;

GRANT SELECT, INSERT, UPDATE ON customer_identities, customer_identity_merge_operations TO tapra2_app;
GRANT SELECT, UPDATE ON customers TO tapra2_app;
