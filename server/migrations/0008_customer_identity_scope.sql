CREATE TABLE customer_identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  normalized_primary_phone text NOT NULL CHECK (length(normalized_primary_phone) BETWEEN 7 AND 20),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, id),
  UNIQUE (workspace_id, normalized_primary_phone)
);

-- Migration runs as the table owner. Earlier migrations intentionally FORCE RLS, which
-- also filters the owner when no tenant context is set. Temporarily lift FORCE only for
-- the owner so every pre-existing tenant row is backfilled in this transaction; RLS
-- remains enabled for application roles and FORCE is restored before commit.
ALTER TABLE customers NO FORCE ROW LEVEL SECURITY;
ALTER TABLE customer_phones NO FORCE ROW LEVEL SECURITY;

INSERT INTO customer_identities(workspace_id, normalized_primary_phone, created_at)
SELECT workspace_id, normalize_customer_phone(phone_primary), min(created_at)
FROM customers
GROUP BY workspace_id, normalize_customer_phone(phone_primary);

ALTER TABLE customers ADD COLUMN identity_id uuid;

UPDATE customers customer
SET identity_id = identity.id
FROM customer_identities identity
WHERE identity.workspace_id = customer.workspace_id
  AND identity.normalized_primary_phone = normalize_customer_phone(customer.phone_primary);

ALTER TABLE customers
  ALTER COLUMN identity_id SET NOT NULL,
  ADD CONSTRAINT customers_workspace_identity_fk
    FOREIGN KEY (workspace_id, identity_id) REFERENCES customer_identities(workspace_id, id);

CREATE UNIQUE INDEX customers_company_identity_unique_idx
  ON customers(workspace_id, company_id, identity_id);

CREATE TABLE customer_identity_phones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  identity_id uuid NOT NULL,
  normalized_value text NOT NULL CHECK (length(normalized_value) BETWEEN 7 AND 20),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, normalized_value),
  UNIQUE (workspace_id, identity_id, normalized_value),
  FOREIGN KEY (workspace_id, identity_id) REFERENCES customer_identities(workspace_id, id)
);

INSERT INTO customer_identity_phones(workspace_id, identity_id, normalized_value, created_at)
SELECT phone.workspace_id, customer.identity_id, phone.normalized_value, min(phone.created_at)
FROM customer_phones phone
JOIN customers customer
  ON customer.workspace_id = phone.workspace_id
  AND customer.company_id = phone.company_id
  AND customer.id = phone.customer_id
GROUP BY phone.workspace_id, customer.identity_id, phone.normalized_value;

ALTER TABLE customer_phones ADD COLUMN identity_id uuid;

UPDATE customer_phones phone
SET identity_id = customer.identity_id
FROM customers customer
WHERE customer.workspace_id = phone.workspace_id
  AND customer.company_id = phone.company_id
  AND customer.id = phone.customer_id;

ALTER TABLE customer_phones
  ALTER COLUMN identity_id SET NOT NULL,
  ADD CONSTRAINT customer_phones_workspace_identity_fk
    FOREIGN KEY (workspace_id, identity_id) REFERENCES customer_identities(workspace_id, id),
  ADD CONSTRAINT customer_phones_identity_value_fk
    FOREIGN KEY (workspace_id, identity_id, normalized_value)
    REFERENCES customer_identity_phones(workspace_id, identity_id, normalized_value);

DROP INDEX customer_phones_workspace_normalized_unique_idx;

CREATE UNIQUE INDEX customer_phones_relationship_normalized_unique_idx
  ON customer_phones(workspace_id, company_id, customer_id, normalized_value);

ALTER TABLE customers FORCE ROW LEVEL SECURITY;
ALTER TABLE customer_phones FORCE ROW LEVEL SECURITY;

ALTER TABLE customer_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_identities FORCE ROW LEVEL SECURITY;
ALTER TABLE customer_identity_phones ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_identity_phones FORCE ROW LEVEL SECURITY;

CREATE POLICY customer_identities_workspace_policy ON customer_identities FOR ALL TO tapra2_app
  USING (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid)
  WITH CHECK (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid);

CREATE POLICY customer_identity_phones_workspace_policy ON customer_identity_phones FOR ALL TO tapra2_app
  USING (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid)
  WITH CHECK (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid);

GRANT SELECT, INSERT ON customer_identities, customer_identity_phones TO tapra2_app;
