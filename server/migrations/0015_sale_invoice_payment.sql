INSERT INTO permissions(code, description) VALUES
  ('sales.sale.create', 'Create a direct Sale and its Invoice in the active Company'),
  ('sales.sale.create_on_behalf', 'Create a paper-entry Sale for another seller in the active Company'),
  ('sales.invoice.read_own', 'Read Invoices attributed to the active Sales membership'),
  ('sales.invoice.read_all', 'Read all Sales Invoices in the active Company'),
  ('sales.invoice.supervisor_approve', 'Approve a Sales Invoice before financial review'),
  ('sales.payment.record', 'Record a Customer Payment declaration for a Sales Invoice'),
  ('sales.payment.review', 'Approve, reject or return an individual Sales Payment'),
  ('sales.invoice.edit_draft', 'Edit a draft Sales Invoice before approval'),
  ('sales.invoice.correct_returned', 'Correct a returned Sales Invoice with a new revision'),
  ('sales.invoice.amend', 'Amend an approved Sales Invoice with a new audited revision'),
  ('sales.payment.infrastructure.manage', 'Manage Company Financial Accounts and Payment Gateways')
ON CONFLICT (code) DO UPDATE SET description = EXCLUDED.description;

ALTER TABLE customer_timeline_events
  DROP CONSTRAINT customer_timeline_events_event_type_check,
  ADD CONSTRAINT customer_timeline_events_event_type_check CHECK (event_type IN (
    'customer_created', 'phone_added', 'address_added', 'source_linked',
    'customer_merged', 'customer_split', 'customer_imported', 'import_data_linked',
    'sales_lead_created', 'sales_call_logged', 'sales_marketing_linked',
    'sales_sale_created', 'sales_invoice_created', 'sales_payment_recorded', 'sales_payment_reviewed',
    'customer_identity_merged', 'customer_identity_split'
  ));

CREATE TABLE financial_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  company_id uuid NOT NULL,
  display_name text NOT NULL CHECK (length(trim(display_name)) BETWEEN 2 AND 200),
  bank_name text NOT NULL CHECK (length(trim(bank_name)) BETWEEN 2 AND 120),
  account_number text CHECK (account_number IS NULL OR length(trim(account_number)) BETWEEN 3 AND 40),
  iban text CHECK (iban IS NULL OR length(trim(iban)) BETWEEN 10 AND 40),
  card_number text CHECK (card_number IS NULL OR length(trim(card_number)) BETWEEN 4 AND 32),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, company_id, id),
  UNIQUE (workspace_id, company_id, display_name),
  FOREIGN KEY (workspace_id, company_id) REFERENCES companies(workspace_id, id),
  CHECK (account_number IS NOT NULL OR iban IS NOT NULL OR card_number IS NOT NULL)
);

CREATE TABLE payment_gateways (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  company_id uuid NOT NULL,
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 2 AND 200),
  provider_code text NOT NULL CHECK (provider_code = lower(provider_code) AND length(trim(provider_code)) BETWEEN 2 AND 80),
  settlement_account_id uuid NOT NULL,
  configuration_reference text NOT NULL CHECK (length(trim(configuration_reference)) BETWEEN 2 AND 200),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, company_id, id),
  UNIQUE (workspace_id, company_id, provider_code, name),
  FOREIGN KEY (workspace_id, company_id) REFERENCES companies(workspace_id, id),
  FOREIGN KEY (workspace_id, company_id, settlement_account_id)
    REFERENCES financial_accounts(workspace_id, company_id, id)
);

CREATE TABLE sales_payment_method_policies (
  workspace_id uuid NOT NULL,
  company_id uuid NOT NULL,
  payment_method text NOT NULL CHECK (payment_method IN (
    'card_to_card', 'bank_transfer', 'payment_gateway', 'cash', 'cheque', 'cod'
  )),
  is_enabled boolean NOT NULL,
  manual_review_required boolean NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, company_id, payment_method),
  FOREIGN KEY (workspace_id, company_id) REFERENCES companies(workspace_id, id),
  CHECK (payment_method <> 'payment_gateway' OR manual_review_required = false)
);

INSERT INTO sales_payment_method_policies(
  workspace_id, company_id, payment_method, is_enabled, manual_review_required
)
SELECT company.workspace_id, company.id, method.payment_method, method.is_enabled, method.manual_review_required
FROM companies company
CROSS JOIN (VALUES
  ('card_to_card', true, true),
  ('bank_transfer', true, true),
  ('payment_gateway', true, false),
  ('cash', false, true),
  ('cheque', false, true),
  ('cod', false, true)
) AS method(payment_method, is_enabled, manual_review_required)
ON CONFLICT DO NOTHING;

CREATE TABLE sales_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  company_id uuid NOT NULL,
  canonical_identity_id uuid NOT NULL,
  customer_id uuid NOT NULL,
  lead_id uuid,
  seller_membership_id uuid NOT NULL,
  actor_user_account_id uuid NOT NULL REFERENCES user_accounts(id),
  entry_mode text NOT NULL CHECK (entry_mode IN ('direct', 'paper_entry')),
  status text NOT NULL DEFAULT 'recorded' CHECK (status IN ('recorded', 'cancellation_requested', 'cancelled')),
  source_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(source_snapshot) = 'object'),
  idempotency_key uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  UNIQUE (workspace_id, company_id, id),
  UNIQUE (workspace_id, company_id, idempotency_key),
  FOREIGN KEY (workspace_id, company_id) REFERENCES companies(workspace_id, id),
  FOREIGN KEY (workspace_id, canonical_identity_id) REFERENCES customer_identities(workspace_id, id),
  FOREIGN KEY (workspace_id, company_id, customer_id) REFERENCES customers(workspace_id, company_id, id),
  FOREIGN KEY (workspace_id, company_id, lead_id) REFERENCES sales_leads(workspace_id, company_id, id),
  FOREIGN KEY (workspace_id, company_id, seller_membership_id)
    REFERENCES memberships(workspace_id, company_id, id)
);

CREATE TABLE sales_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  company_id uuid NOT NULL,
  sale_id uuid NOT NULL,
  invoice_code text NOT NULL CHECK (length(trim(invoice_code)) BETWEEN 6 AND 50),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  status text NOT NULL DEFAULT 'awaiting_supervisor_approval' CHECK (status IN (
    'awaiting_supervisor_approval', 'awaiting_payment', 'awaiting_financial_review',
    'partially_paid', 'payment_correction_required', 'overpayment_hold',
    'financially_approved', 'cancellation_requested', 'cancelled'
  )),
  payment_status text NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN (
    'unpaid', 'declared', 'partial', 'paid', 'overpaid', 'correction_required'
  )),
  currency text NOT NULL DEFAULT 'IRR' CHECK (currency = 'IRR'),
  subtotal_amount bigint NOT NULL CHECK (subtotal_amount >= 0),
  discount_amount bigint NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  final_amount bigint NOT NULL CHECK (final_amount > 0),
  supervisor_approved_by_user_account_id uuid REFERENCES user_accounts(id),
  supervisor_approved_at timestamptz,
  created_by_user_account_id uuid NOT NULL REFERENCES user_accounts(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  UNIQUE (workspace_id, company_id, id),
  UNIQUE (workspace_id, company_id, sale_id),
  UNIQUE (workspace_id, company_id, invoice_code),
  FOREIGN KEY (workspace_id, company_id, sale_id)
    REFERENCES sales_transactions(workspace_id, company_id, id),
  CHECK (final_amount = subtotal_amount - discount_amount),
  CHECK ((supervisor_approved_at IS NULL) = (supervisor_approved_by_user_account_id IS NULL))
);

CREATE TABLE sales_invoice_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  company_id uuid NOT NULL,
  invoice_id uuid NOT NULL,
  invoice_revision integer NOT NULL DEFAULT 1 CHECK (invoice_revision > 0),
  line_number integer NOT NULL CHECK (line_number > 0),
  item_type text NOT NULL CHECK (item_type IN ('goods', 'service')),
  catalog_reference text,
  item_name text NOT NULL CHECK (length(trim(item_name)) BETWEEN 2 AND 300),
  quantity integer NOT NULL CHECK (quantity > 0),
  unit_price bigint NOT NULL CHECK (unit_price >= 0),
  discount_amount bigint NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  line_total bigint NOT NULL CHECK (line_total >= 0),
  source_type text NOT NULL DEFAULT 'manual_addition' CHECK (source_type IN (
    'promotion_core', 'cross_sell', 'upsell', 'manual_addition'
  )),
  fulfillment_status text NOT NULL DEFAULT 'blocked_by_payment' CHECK (fulfillment_status IN (
    'blocked_by_payment', 'eligible', 'awaiting_stock', 'in_progress', 'completed',
    'cancellation_requested', 'cancelled', 'failed'
  )),
  item_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(item_snapshot) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, company_id, id),
  UNIQUE (workspace_id, company_id, invoice_id, invoice_revision, line_number),
  FOREIGN KEY (workspace_id, company_id, invoice_id)
    REFERENCES sales_invoices(workspace_id, company_id, id),
  CHECK (line_total = quantity * unit_price - discount_amount),
  CHECK (discount_amount <= quantity * unit_price)
);

CREATE TABLE sales_invoice_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  company_id uuid NOT NULL,
  invoice_id uuid NOT NULL,
  revision integer NOT NULL CHECK (revision > 0),
  content_snapshot jsonb NOT NULL CHECK (jsonb_typeof(content_snapshot) = 'object'),
  reason text,
  created_by_user_account_id uuid NOT NULL REFERENCES user_accounts(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, company_id, id),
  UNIQUE (workspace_id, company_id, invoice_id, revision),
  FOREIGN KEY (workspace_id, company_id, invoice_id)
    REFERENCES sales_invoices(workspace_id, company_id, id),
  CHECK (revision = 1 OR (reason IS NOT NULL AND length(trim(reason)) >= 3))
);

CREATE TABLE sales_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  company_id uuid NOT NULL,
  invoice_id uuid NOT NULL,
  amount bigint NOT NULL CHECK (amount > 0),
  payment_method text NOT NULL CHECK (payment_method IN (
    'card_to_card', 'bank_transfer', 'payment_gateway', 'cash', 'cheque', 'cod'
  )),
  occurred_at timestamptz NOT NULL,
  last_four_digits text CHECK (last_four_digits IS NULL OR last_four_digits ~ '^[0-9]{4}$'),
  destination_account_id uuid,
  gateway_id uuid,
  tracking_number text CHECK (tracking_number IS NULL OR length(trim(tracking_number)) BETWEEN 2 AND 200),
  receipt_reference text,
  status text NOT NULL DEFAULT 'declared' CHECK (status IN (
    'declared', 'approved', 'needs_correction', 'rejected', 'superseded', 'reversed'
  )),
  recorded_by_user_account_id uuid NOT NULL REFERENCES user_accounts(id),
  reviewed_by_user_account_id uuid REFERENCES user_accounts(id),
  reviewed_at timestamptz,
  review_reason text,
  corrects_payment_id uuid,
  superseded_by_payment_id uuid,
  idempotency_key uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  UNIQUE (workspace_id, company_id, id),
  UNIQUE (workspace_id, company_id, idempotency_key),
  FOREIGN KEY (workspace_id, company_id, invoice_id)
    REFERENCES sales_invoices(workspace_id, company_id, id),
  FOREIGN KEY (workspace_id, company_id, destination_account_id)
    REFERENCES financial_accounts(workspace_id, company_id, id),
  FOREIGN KEY (workspace_id, company_id, gateway_id)
    REFERENCES payment_gateways(workspace_id, company_id, id),
  FOREIGN KEY (workspace_id, company_id, corrects_payment_id)
    REFERENCES sales_payments(workspace_id, company_id, id),
  FOREIGN KEY (workspace_id, company_id, superseded_by_payment_id)
    REFERENCES sales_payments(workspace_id, company_id, id),
  CHECK (
    (payment_method = 'payment_gateway' AND gateway_id IS NOT NULL)
    OR (payment_method <> 'payment_gateway' AND gateway_id IS NULL)
  ),
  CHECK (
    (status IN ('needs_correction', 'rejected', 'reversed')
      AND review_reason IS NOT NULL
      AND length(trim(review_reason)) >= 3)
    OR status NOT IN ('needs_correction', 'rejected', 'reversed')
  ),
  CHECK ((reviewed_at IS NULL) = (reviewed_by_user_account_id IS NULL))
);

CREATE TABLE sales_invoice_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  company_id uuid NOT NULL,
  invoice_id uuid NOT NULL,
  actor_user_account_id uuid NOT NULL REFERENCES user_accounts(id),
  event_type text NOT NULL CHECK (length(trim(event_type)) BETWEEN 2 AND 100),
  previous_state jsonb,
  new_state jsonb,
  reason text,
  correlation_id text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (workspace_id, company_id, invoice_id)
    REFERENCES sales_invoices(workspace_id, company_id, id)
);

CREATE TABLE sales_payment_review_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  company_id uuid NOT NULL,
  invoice_id uuid NOT NULL,
  payment_id uuid NOT NULL,
  actor_user_account_id uuid NOT NULL REFERENCES user_accounts(id),
  decision text NOT NULL CHECK (decision IN ('approved', 'needs_correction', 'rejected', 'reversed')),
  reason text,
  previous_status text NOT NULL,
  new_status text NOT NULL,
  correlation_id text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (workspace_id, company_id, invoice_id)
    REFERENCES sales_invoices(workspace_id, company_id, id),
  FOREIGN KEY (workspace_id, company_id, payment_id)
    REFERENCES sales_payments(workspace_id, company_id, id),
  CHECK (decision = 'approved' OR (reason IS NOT NULL AND length(trim(reason)) >= 3))
);

CREATE INDEX sales_transactions_customer_idx
  ON sales_transactions(workspace_id, company_id, customer_id, created_at DESC);
CREATE INDEX sales_invoices_seller_status_idx
  ON sales_invoices(workspace_id, company_id, status, updated_at DESC);
CREATE INDEX sales_invoice_lines_invoice_idx
  ON sales_invoice_lines(workspace_id, company_id, invoice_id, invoice_revision, line_number);
CREATE INDEX sales_invoice_revisions_history_idx
  ON sales_invoice_revisions(workspace_id, company_id, invoice_id, revision DESC);
CREATE INDEX sales_payments_invoice_idx
  ON sales_payments(workspace_id, company_id, invoice_id, created_at, id);
CREATE INDEX sales_invoice_events_history_idx
  ON sales_invoice_events(workspace_id, company_id, invoice_id, occurred_at, id);
CREATE INDEX sales_payment_review_events_history_idx
  ON sales_payment_review_events(workspace_id, company_id, payment_id, occurred_at, id);

ALTER TABLE financial_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE financial_accounts FORCE ROW LEVEL SECURITY;
ALTER TABLE payment_gateways ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_gateways FORCE ROW LEVEL SECURITY;
ALTER TABLE sales_payment_method_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_payment_method_policies FORCE ROW LEVEL SECURITY;
ALTER TABLE sales_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_transactions FORCE ROW LEVEL SECURITY;
ALTER TABLE sales_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_invoices FORCE ROW LEVEL SECURITY;
ALTER TABLE sales_invoice_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_invoice_lines FORCE ROW LEVEL SECURITY;
ALTER TABLE sales_invoice_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_invoice_revisions FORCE ROW LEVEL SECURITY;
ALTER TABLE sales_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_payments FORCE ROW LEVEL SECURITY;
ALTER TABLE sales_invoice_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_invoice_events FORCE ROW LEVEL SECURITY;
ALTER TABLE sales_payment_review_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_payment_review_events FORCE ROW LEVEL SECURITY;

CREATE POLICY financial_accounts_context_policy ON financial_accounts FOR ALL TO tapra2_app
  USING (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid
    AND company_id = NULLIF(current_setting('app.company_id', true), '')::uuid)
  WITH CHECK (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid
    AND company_id = NULLIF(current_setting('app.company_id', true), '')::uuid);
CREATE POLICY payment_gateways_context_policy ON payment_gateways FOR ALL TO tapra2_app
  USING (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid
    AND company_id = NULLIF(current_setting('app.company_id', true), '')::uuid)
  WITH CHECK (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid
    AND company_id = NULLIF(current_setting('app.company_id', true), '')::uuid);
CREATE POLICY sales_payment_method_policies_context_policy ON sales_payment_method_policies FOR ALL TO tapra2_app
  USING (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid
    AND company_id = NULLIF(current_setting('app.company_id', true), '')::uuid)
  WITH CHECK (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid
    AND company_id = NULLIF(current_setting('app.company_id', true), '')::uuid);
CREATE POLICY sales_transactions_context_policy ON sales_transactions FOR ALL TO tapra2_app
  USING (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid
    AND company_id = NULLIF(current_setting('app.company_id', true), '')::uuid)
  WITH CHECK (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid
    AND company_id = NULLIF(current_setting('app.company_id', true), '')::uuid);
CREATE POLICY sales_invoices_context_policy ON sales_invoices FOR ALL TO tapra2_app
  USING (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid
    AND company_id = NULLIF(current_setting('app.company_id', true), '')::uuid)
  WITH CHECK (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid
    AND company_id = NULLIF(current_setting('app.company_id', true), '')::uuid);
CREATE POLICY sales_invoice_lines_context_policy ON sales_invoice_lines FOR ALL TO tapra2_app
  USING (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid
    AND company_id = NULLIF(current_setting('app.company_id', true), '')::uuid)
  WITH CHECK (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid
    AND company_id = NULLIF(current_setting('app.company_id', true), '')::uuid);
CREATE POLICY sales_invoice_revisions_context_policy ON sales_invoice_revisions FOR ALL TO tapra2_app
  USING (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid
    AND company_id = NULLIF(current_setting('app.company_id', true), '')::uuid)
  WITH CHECK (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid
    AND company_id = NULLIF(current_setting('app.company_id', true), '')::uuid);
CREATE POLICY sales_payments_context_policy ON sales_payments FOR ALL TO tapra2_app
  USING (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid
    AND company_id = NULLIF(current_setting('app.company_id', true), '')::uuid)
  WITH CHECK (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid
    AND company_id = NULLIF(current_setting('app.company_id', true), '')::uuid);
CREATE POLICY sales_invoice_events_context_policy ON sales_invoice_events FOR ALL TO tapra2_app
  USING (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid
    AND company_id = NULLIF(current_setting('app.company_id', true), '')::uuid)
  WITH CHECK (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid
    AND company_id = NULLIF(current_setting('app.company_id', true), '')::uuid);
CREATE POLICY sales_payment_review_events_context_policy ON sales_payment_review_events FOR ALL TO tapra2_app
  USING (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid
    AND company_id = NULLIF(current_setting('app.company_id', true), '')::uuid)
  WITH CHECK (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid
    AND company_id = NULLIF(current_setting('app.company_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE ON financial_accounts, payment_gateways, sales_payment_method_policies,
  sales_transactions, sales_invoices, sales_invoice_lines, sales_payments TO tapra2_app;
GRANT SELECT, INSERT ON sales_invoice_revisions, sales_invoice_events, sales_payment_review_events TO tapra2_app;
