CREATE OR REPLACE FUNCTION normalize_customer_phone(value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
PARALLEL SAFE
AS $$
  SELECT CASE
    WHEN digits LIKE '0098%' THEN '0' || substring(digits FROM 5)
    WHEN digits LIKE '98%' THEN '0' || substring(digits FROM 3)
    WHEN digits LIKE '9%' AND length(digits) = 10 THEN '0' || digits
    ELSE digits
  END
  FROM (SELECT regexp_replace(value, '[^0-9]', '', 'g') AS digits) normalized;
$$;

ALTER TABLE customers
  ADD COLUMN status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'merged')),
  ADD COLUMN merged_into_customer_id uuid,
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now(),
  ADD CONSTRAINT customers_workspace_company_id_key UNIQUE (workspace_id, company_id, id),
  ADD CONSTRAINT customers_merged_target_fk
    FOREIGN KEY (workspace_id, company_id, merged_into_customer_id)
    REFERENCES customers(workspace_id, company_id, id),
  ADD CONSTRAINT customers_merge_state_check CHECK (
    (status = 'active' AND merged_into_customer_id IS NULL)
    OR (status = 'merged' AND merged_into_customer_id IS NOT NULL AND merged_into_customer_id <> id)
  );

CREATE INDEX customers_context_status_created_idx
  ON customers(workspace_id, company_id, status, created_at DESC);

CREATE TABLE customer_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  company_id uuid NOT NULL,
  customer_id uuid NOT NULL,
  source_type text NOT NULL CHECK (source_type IN (
    'manual', 'foundation_migration', 'legacy_crm', 'excel', 'call_center',
    'website', 'campaign', 'external_company', 'api_integration'
  )),
  source_name text NOT NULL CHECK (length(trim(source_name)) > 0),
  source_reference text,
  import_reference text,
  observed_at timestamptz,
  ingested_at timestamptz NOT NULL DEFAULT now(),
  raw_source_reference text,
  confidence numeric(4, 3) CHECK (confidence IS NULL OR confidence BETWEEN 0 AND 1),
  verification_status text NOT NULL DEFAULT 'unverified'
    CHECK (verification_status IN ('unverified', 'verified', 'rejected')),
  created_by_user_account_id uuid NOT NULL REFERENCES user_accounts(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (workspace_id, company_id, customer_id)
    REFERENCES customers(workspace_id, company_id, id)
);

CREATE INDEX customer_sources_customer_idx
  ON customer_sources(workspace_id, company_id, customer_id, created_at);

CREATE TABLE customer_phones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  company_id uuid NOT NULL,
  customer_id uuid NOT NULL,
  source_id uuid,
  value text NOT NULL CHECK (length(trim(value)) BETWEEN 7 AND 32),
  normalized_value text NOT NULL CHECK (
    length(normalized_value) BETWEEN 7 AND 20
    AND normalized_value = normalize_customer_phone(value)
  ),
  label text NOT NULL DEFAULT 'mobile' CHECK (length(trim(label)) > 0),
  is_primary boolean NOT NULL DEFAULT false,
  verification_status text NOT NULL DEFAULT 'unverified'
    CHECK (verification_status IN ('unverified', 'verified', 'rejected')),
  idempotency_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (workspace_id, company_id, customer_id)
    REFERENCES customers(workspace_id, company_id, id),
  FOREIGN KEY (source_id) REFERENCES customer_sources(id)
);

CREATE UNIQUE INDEX customer_phones_workspace_normalized_unique_idx
  ON customer_phones(workspace_id, normalized_value);
CREATE UNIQUE INDEX customer_phones_one_primary_idx
  ON customer_phones(workspace_id, company_id, customer_id)
  WHERE is_primary;
CREATE UNIQUE INDEX customer_phones_context_idempotency_idx
  ON customer_phones(workspace_id, company_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
CREATE INDEX customer_phones_customer_idx
  ON customer_phones(workspace_id, company_id, customer_id, created_at);

CREATE TABLE customer_addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  company_id uuid NOT NULL,
  customer_id uuid NOT NULL,
  source_id uuid,
  province text,
  city text,
  address_text text NOT NULL CHECK (length(trim(address_text)) > 0),
  postal_code text,
  label text NOT NULL DEFAULT 'other' CHECK (length(trim(label)) > 0),
  is_primary boolean NOT NULL DEFAULT false,
  normalized_search_text text NOT NULL,
  idempotency_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (workspace_id, company_id, customer_id)
    REFERENCES customers(workspace_id, company_id, id),
  FOREIGN KEY (source_id) REFERENCES customer_sources(id)
);

CREATE UNIQUE INDEX customer_addresses_one_primary_idx
  ON customer_addresses(workspace_id, company_id, customer_id)
  WHERE is_primary;
CREATE UNIQUE INDEX customer_addresses_context_idempotency_idx
  ON customer_addresses(workspace_id, company_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
CREATE INDEX customer_addresses_customer_idx
  ON customer_addresses(workspace_id, company_id, customer_id, created_at);

CREATE TABLE customer_timeline_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  company_id uuid NOT NULL,
  customer_id uuid NOT NULL,
  actor_user_account_id uuid NOT NULL REFERENCES user_accounts(id),
  event_type text NOT NULL CHECK (event_type IN (
    'customer_created', 'phone_added', 'address_added', 'source_linked',
    'customer_merged', 'customer_split'
  )),
  summary text NOT NULL CHECK (length(trim(summary)) > 0),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (workspace_id, company_id, customer_id)
    REFERENCES customers(workspace_id, company_id, id)
);

CREATE INDEX customer_timeline_customer_order_idx
  ON customer_timeline_events(workspace_id, company_id, customer_id, occurred_at DESC, id DESC);

CREATE TABLE customer_merge_operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  company_id uuid NOT NULL,
  canonical_customer_id uuid NOT NULL,
  merged_customer_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'reversed')),
  reason text NOT NULL CHECK (length(trim(reason)) >= 3),
  merged_by_user_account_id uuid NOT NULL REFERENCES user_accounts(id),
  merged_at timestamptz NOT NULL DEFAULT now(),
  reversed_by_user_account_id uuid REFERENCES user_accounts(id),
  reversed_at timestamptz,
  reversal_reason text,
  idempotency_key text,
  lineage_snapshot jsonb NOT NULL,
  CHECK (canonical_customer_id <> merged_customer_id),
  CHECK (
    (status = 'active' AND reversed_by_user_account_id IS NULL AND reversed_at IS NULL AND reversal_reason IS NULL)
    OR (status = 'reversed' AND reversed_by_user_account_id IS NOT NULL AND reversed_at IS NOT NULL AND length(trim(reversal_reason)) >= 3)
  ),
  FOREIGN KEY (workspace_id, company_id, canonical_customer_id)
    REFERENCES customers(workspace_id, company_id, id),
  FOREIGN KEY (workspace_id, company_id, merged_customer_id)
    REFERENCES customers(workspace_id, company_id, id)
);

CREATE UNIQUE INDEX customer_merge_active_merged_unique_idx
  ON customer_merge_operations(workspace_id, merged_customer_id)
  WHERE status = 'active';
CREATE UNIQUE INDEX customer_merge_context_idempotency_idx
  ON customer_merge_operations(workspace_id, company_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
CREATE INDEX customer_merge_canonical_idx
  ON customer_merge_operations(workspace_id, company_id, canonical_customer_id, merged_at DESC);

ALTER TABLE customer_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_sources FORCE ROW LEVEL SECURITY;
ALTER TABLE customer_phones ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_phones FORCE ROW LEVEL SECURITY;
ALTER TABLE customer_addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_addresses FORCE ROW LEVEL SECURITY;
ALTER TABLE customer_timeline_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_timeline_events FORCE ROW LEVEL SECURITY;
ALTER TABLE customer_merge_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_merge_operations FORCE ROW LEVEL SECURITY;

CREATE POLICY customer_sources_context_policy ON customer_sources FOR ALL TO tapra2_app
  USING (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid
    AND company_id = NULLIF(current_setting('app.company_id', true), '')::uuid)
  WITH CHECK (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid
    AND company_id = NULLIF(current_setting('app.company_id', true), '')::uuid);
CREATE POLICY customer_phones_context_policy ON customer_phones FOR ALL TO tapra2_app
  USING (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid
    AND company_id = NULLIF(current_setting('app.company_id', true), '')::uuid)
  WITH CHECK (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid
    AND company_id = NULLIF(current_setting('app.company_id', true), '')::uuid);
CREATE POLICY customer_addresses_context_policy ON customer_addresses FOR ALL TO tapra2_app
  USING (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid
    AND company_id = NULLIF(current_setting('app.company_id', true), '')::uuid)
  WITH CHECK (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid
    AND company_id = NULLIF(current_setting('app.company_id', true), '')::uuid);
CREATE POLICY customer_timeline_context_policy ON customer_timeline_events FOR ALL TO tapra2_app
  USING (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid
    AND company_id = NULLIF(current_setting('app.company_id', true), '')::uuid)
  WITH CHECK (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid
    AND company_id = NULLIF(current_setting('app.company_id', true), '')::uuid);
CREATE POLICY customer_merge_context_policy ON customer_merge_operations FOR ALL TO tapra2_app
  USING (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid
    AND company_id = NULLIF(current_setting('app.company_id', true), '')::uuid)
  WITH CHECK (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid
    AND company_id = NULLIF(current_setting('app.company_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE ON customers TO tapra2_app;
GRANT SELECT, INSERT, UPDATE ON customer_sources, customer_phones, customer_addresses,
  customer_timeline_events, customer_merge_operations TO tapra2_app;

INSERT INTO customer_sources(
  workspace_id, company_id, customer_id, source_type, source_name, source_reference,
  observed_at, confidence, verification_status, created_by_user_account_id, created_at, updated_at
)
SELECT workspace_id, company_id, id, 'foundation_migration', 'Foundation Sprint 1', id::text,
  created_at, 1, 'verified', created_by_user_account_id, created_at, created_at
FROM customers;

INSERT INTO customer_phones(
  workspace_id, company_id, customer_id, source_id, value, normalized_value, label,
  is_primary, verification_status, created_at, updated_at
)
SELECT c.workspace_id, c.company_id, c.id, s.id, phone.value,
  normalize_customer_phone(phone.value), phone.label, phone.is_primary, 'unverified', c.created_at, c.created_at
FROM customers c
JOIN customer_sources s ON s.workspace_id = c.workspace_id AND s.company_id = c.company_id
  AND s.customer_id = c.id AND s.source_type = 'foundation_migration'
CROSS JOIN LATERAL (
  VALUES (c.phone_primary, 'primary', true), (c.phone_secondary, 'secondary', false)
) AS phone(value, label, is_primary)
WHERE phone.value IS NOT NULL AND trim(phone.value) <> '';

INSERT INTO customer_addresses(
  workspace_id, company_id, customer_id, source_id, province, city, address_text,
  postal_code, label, is_primary, normalized_search_text, created_at, updated_at
)
SELECT c.workspace_id, c.company_id, c.id, s.id, c.province, c.city,
  COALESCE(NULLIF(trim(c.address), ''), concat_ws('، ', NULLIF(trim(c.city), ''), NULLIF(trim(c.province), ''))),
  c.postal_code, 'legacy', true,
  lower(trim(concat_ws(' ', c.province, c.city, c.address, c.postal_code))), c.created_at, c.created_at
FROM customers c
JOIN customer_sources s ON s.workspace_id = c.workspace_id AND s.company_id = c.company_id
  AND s.customer_id = c.id AND s.source_type = 'foundation_migration'
WHERE NULLIF(trim(concat_ws('', c.province, c.city, c.address, c.postal_code)), '') IS NOT NULL;

INSERT INTO customer_timeline_events(
  workspace_id, company_id, customer_id, actor_user_account_id,
  event_type, summary, metadata, occurred_at
)
SELECT workspace_id, company_id, id, created_by_user_account_id,
  'customer_created', 'پروفایل مشتری ایجاد شد.',
  jsonb_build_object('source', 'foundation_sprint_1_migration'), created_at
FROM customers;
