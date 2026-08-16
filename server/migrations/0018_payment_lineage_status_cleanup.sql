ALTER TABLE sales_payments NO FORCE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM sales_payments original
    LEFT JOIN sales_payments correction
      ON correction.id = original.superseded_by_payment_id
      AND correction.workspace_id = original.workspace_id
      AND correction.company_id = original.company_id
      AND correction.invoice_id = original.invoice_id
    WHERE original.status = 'superseded'
      AND (
        original.superseded_by_payment_id IS NULL
        OR original.review_reason IS NULL
        OR original.reviewed_at IS NULL
        OR original.reviewed_by_user_account_id IS NULL
        OR correction.id IS NULL
        OR correction.corrects_payment_id IS DISTINCT FROM original.id
      )
  ) THEN
    RAISE EXCEPTION 'Superseded Payment lineage is incomplete; manual integrity review is required.';
  END IF;
END $$;

UPDATE sales_payments
SET status = 'needs_correction',
    updated_at = now(),
    version = version + 1
WHERE status = 'superseded';

ALTER TABLE sales_payments
  DROP CONSTRAINT sales_payments_status_check,
  ADD CONSTRAINT sales_payments_status_check CHECK (status IN (
    'submitted', 'approved', 'needs_correction'
  ));

UPDATE permissions
SET description = 'Approve or return an individual Sales Payment for correction'
WHERE code = 'sales.payment.review';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM permissions
    WHERE code = 'sales.payment.review'
      AND lower(description) NOT LIKE '%reject%'
  ) THEN
    RAISE EXCEPTION 'Canonical Sales Payment review permission description is missing.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM sales_payments
    WHERE status NOT IN ('submitted', 'approved', 'needs_correction')
  ) THEN
    RAISE EXCEPTION 'Non-canonical Sales Payment status remains after migration.';
  END IF;
END $$;

ALTER TABLE sales_payments FORCE ROW LEVEL SECURITY;
