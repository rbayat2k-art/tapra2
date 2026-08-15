DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM sales_payments WHERE status = 'rejected')
    OR EXISTS (SELECT 1 FROM sales_payment_review_events WHERE decision = 'rejected') THEN
    RAISE EXCEPTION 'Unauthorized rejected Payment state exists; manual integrity review is required.';
  END IF;
END $$;

UPDATE sales_payments SET status = 'submitted' WHERE status = 'declared';
UPDATE sales_invoices SET payment_status = 'submitted' WHERE payment_status = 'declared';

ALTER TABLE sales_payments
  DROP CONSTRAINT sales_payments_status_check,
  ALTER COLUMN status SET DEFAULT 'submitted',
  ADD CONSTRAINT sales_payments_status_check CHECK (status IN (
    'submitted', 'approved', 'needs_correction', 'superseded'
  )),
  ADD COLUMN creator_actor_user_account_id uuid REFERENCES user_accounts(id),
  ADD COLUMN creator_effective_user_account_id uuid REFERENCES user_accounts(id);

UPDATE sales_payments
SET creator_actor_user_account_id = recorded_by_user_account_id,
    creator_effective_user_account_id = recorded_by_user_account_id;

ALTER TABLE sales_payments
  ALTER COLUMN creator_actor_user_account_id SET NOT NULL,
  ALTER COLUMN creator_effective_user_account_id SET NOT NULL;

ALTER TABLE sales_payment_review_events
  DROP CONSTRAINT sales_payment_review_events_decision_check,
  ADD CONSTRAINT sales_payment_review_events_decision_check CHECK (
    decision IN ('approved', 'needs_correction')
  );

ALTER TABLE sales_invoices
  DROP CONSTRAINT sales_invoices_payment_status_check,
  ADD CONSTRAINT sales_invoices_payment_status_check CHECK (payment_status IN (
    'unpaid', 'submitted', 'partial', 'paid', 'overpaid', 'correction_required'
  ));
