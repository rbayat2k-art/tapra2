ALTER TABLE customer_sources
  ADD COLUMN metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE customer_timeline_events
  DROP CONSTRAINT customer_timeline_events_event_type_check,
  ADD CONSTRAINT customer_timeline_events_event_type_check CHECK (event_type IN (
    'customer_created', 'phone_added', 'address_added', 'source_linked',
    'customer_merged', 'customer_split', 'customer_imported', 'import_data_linked'
  ));

CREATE TABLE customer_import_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  company_id uuid NOT NULL,
  file_name text NOT NULL CHECK (length(trim(file_name)) BETWEEN 1 AND 255),
  source_name text NOT NULL CHECK (length(trim(source_name)) BETWEEN 1 AND 200),
  file_sha256 char(64) NOT NULL,
  schema_version text NOT NULL DEFAULT 'customer-import-v1',
  status text NOT NULL DEFAULT 'staged' CHECK (status IN ('staged', 'in_review', 'approved', 'failed')),
  total_rows integer NOT NULL CHECK (total_rows BETWEEN 1 AND 500),
  valid_rows integer NOT NULL DEFAULT 0 CHECK (valid_rows >= 0),
  invalid_rows integer NOT NULL DEFAULT 0 CHECK (invalid_rows >= 0),
  exact_match_rows integer NOT NULL DEFAULT 0 CHECK (exact_match_rows >= 0),
  possible_duplicate_rows integer NOT NULL DEFAULT 0 CHECK (possible_duplicate_rows >= 0),
  review_required_rows integer NOT NULL DEFAULT 0 CHECK (review_required_rows >= 0),
  created_by_user_account_id uuid NOT NULL REFERENCES user_accounts(id),
  approved_by_user_account_id uuid REFERENCES user_accounts(id),
  idempotency_key uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz,
  UNIQUE (workspace_id, company_id, idempotency_key),
  FOREIGN KEY (workspace_id, company_id) REFERENCES companies(workspace_id, id)
);

CREATE INDEX customer_import_jobs_context_created_idx
  ON customer_import_jobs(workspace_id, company_id, created_at DESC, id DESC);

CREATE TABLE customer_import_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  company_id uuid NOT NULL,
  import_job_id uuid NOT NULL REFERENCES customer_import_jobs(id) ON DELETE CASCADE,
  row_number integer NOT NULL CHECK (row_number > 1),
  raw_data jsonb NOT NULL,
  full_name text,
  normalized_full_name text,
  phone text,
  normalized_phone text,
  phone_secondary text,
  address_text text,
  province text,
  city text,
  postal_code text,
  purchase_reference text,
  purchase_date date,
  purchase_amount numeric(18, 2),
  source_reference text,
  classification text NOT NULL CHECK (classification IN (
    'VALID', 'INVALID', 'EXACT_MATCH', 'POSSIBLE_DUPLICATE', 'REVIEW_REQUIRED'
  )),
  reasons text[] NOT NULL DEFAULT '{}',
  candidate_customer_ids uuid[] NOT NULL DEFAULT '{}',
  duplicate_of_record_id uuid REFERENCES customer_import_records(id),
  proposed_action text NOT NULL CHECK (proposed_action IN (
    'CREATE_NEW', 'LINK_TO_EXISTING', 'LINK_TO_STAGED', 'REJECT', 'KEEP_FOR_REVIEW'
  )),
  decided_action text CHECK (decided_action IN (
    'CREATE_NEW', 'LINK_TO_EXISTING', 'LINK_TO_STAGED', 'REJECT', 'KEEP_FOR_REVIEW'
  )),
  target_customer_id uuid,
  target_record_id uuid REFERENCES customer_import_records(id),
  applied_customer_id uuid,
  reviewed_by_user_account_id uuid REFERENCES user_accounts(id),
  reviewed_at timestamptz,
  applied_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (import_job_id, row_number),
  FOREIGN KEY (workspace_id, company_id, target_customer_id)
    REFERENCES customers(workspace_id, company_id, id),
  FOREIGN KEY (workspace_id, company_id, applied_customer_id)
    REFERENCES customers(workspace_id, company_id, id),
  CHECK ((decided_action IS NULL AND reviewed_at IS NULL AND reviewed_by_user_account_id IS NULL)
    OR (decided_action IS NOT NULL AND reviewed_at IS NOT NULL AND reviewed_by_user_account_id IS NOT NULL)),
  CHECK (decided_action <> 'LINK_TO_EXISTING' OR target_customer_id IS NOT NULL),
  CHECK (decided_action <> 'LINK_TO_STAGED' OR target_record_id IS NOT NULL),
  CHECK (purchase_amount IS NULL OR purchase_amount >= 0)
);

CREATE INDEX customer_import_records_job_row_idx
  ON customer_import_records(workspace_id, company_id, import_job_id, row_number);
CREATE INDEX customer_import_records_normalized_phone_idx
  ON customer_import_records(workspace_id, company_id, normalized_phone)
  WHERE normalized_phone IS NOT NULL;

ALTER TABLE customer_import_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_import_jobs FORCE ROW LEVEL SECURITY;
ALTER TABLE customer_import_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_import_records FORCE ROW LEVEL SECURITY;

CREATE POLICY customer_import_jobs_context_policy ON customer_import_jobs FOR ALL TO tapra2_app
  USING (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid
    AND company_id = NULLIF(current_setting('app.company_id', true), '')::uuid)
  WITH CHECK (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid
    AND company_id = NULLIF(current_setting('app.company_id', true), '')::uuid);

CREATE POLICY customer_import_records_context_policy ON customer_import_records FOR ALL TO tapra2_app
  USING (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid
    AND company_id = NULLIF(current_setting('app.company_id', true), '')::uuid)
  WITH CHECK (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid
    AND company_id = NULLIF(current_setting('app.company_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE ON customer_import_jobs, customer_import_records TO tapra2_app;

INSERT INTO permissions(code, description) VALUES
  ('customer.import.create', 'Create a staged Customer CSV import in the active context'),
  ('customer.import.review', 'Review and reconcile staged Customer import records'),
  ('customer.import.approve', 'Approve a reconciled Customer import into Customer 360')
ON CONFLICT (code) DO UPDATE SET description = EXCLUDED.description;

INSERT INTO role_permissions(role_id, permission_code)
SELECT role.id, permission.code
FROM roles role
CROSS JOIN (VALUES
  ('customer.import.create'), ('customer.import.review'), ('customer.import.approve')
) AS permission(code)
WHERE role.code = 'customer_manager'
ON CONFLICT DO NOTHING;
