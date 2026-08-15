INSERT INTO permissions(code, description) VALUES
  ('sales.payment.infrastructure.manage', 'Manage Company collection accounts and Sales approval policy')
ON CONFLICT (code) DO UPDATE SET description = EXCLUDED.description;

ALTER TABLE financial_accounts
  ADD COLUMN masked_reference text
    CHECK (masked_reference IS NULL OR length(trim(masked_reference)) BETWEEN 4 AND 80),
  DROP CONSTRAINT financial_accounts_check,
  ADD CONSTRAINT financial_accounts_identifier_check CHECK (
    account_number IS NOT NULL OR iban IS NOT NULL OR card_number IS NOT NULL OR masked_reference IS NOT NULL
  );

CREATE TABLE sales_invoice_policies (
  workspace_id uuid NOT NULL,
  company_id uuid NOT NULL,
  supervisor_approval_required boolean NOT NULL DEFAULT true,
  updated_by_user_account_id uuid REFERENCES user_accounts(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, company_id),
  FOREIGN KEY (workspace_id, company_id) REFERENCES companies(workspace_id, id)
);

INSERT INTO sales_invoice_policies(workspace_id, company_id)
SELECT workspace_id, id FROM companies
ON CONFLICT (workspace_id, company_id) DO NOTHING;

ALTER TABLE sales_invoices
  ADD COLUMN sales_approval_required boolean NOT NULL DEFAULT true;

ALTER TABLE sales_invoice_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_invoice_policies FORCE ROW LEVEL SECURITY;

CREATE POLICY sales_invoice_policies_context_policy ON sales_invoice_policies FOR ALL TO tapra2_app
  USING (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid
    AND company_id = NULLIF(current_setting('app.company_id', true), '')::uuid)
  WITH CHECK (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid
    AND company_id = NULLIF(current_setting('app.company_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE ON sales_invoice_policies TO tapra2_app;
