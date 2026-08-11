ALTER TABLE customers ADD COLUMN idempotency_key text;

CREATE UNIQUE INDEX customers_context_idempotency_idx
    ON customers(workspace_id, company_id, idempotency_key)
    WHERE idempotency_key IS NOT NULL;
