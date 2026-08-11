ALTER TABLE customer_import_records
  ADD COLUMN purchased_item text;

ALTER TABLE customer_import_jobs
  ADD COLUMN approved_rows integer NOT NULL DEFAULT 0 CHECK (approved_rows >= 0),
  ADD COLUMN rejected_rows integer NOT NULL DEFAULT 0 CHECK (rejected_rows >= 0),
  ADD COLUMN completed_at timestamptz;
