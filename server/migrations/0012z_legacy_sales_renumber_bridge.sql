-- Compatibility bridge for installations that applied the Sales migrations before
-- Organization/Identity work moved them from 0009/0010 to 0013/0014.
-- Fresh installations do not enter either branch and apply 0013/0014 normally.
DO $$
DECLARE
  legacy_lead_checksum text;
  legacy_marketing_checksum text;
  expected_legacy_lead_checksum constant text := '5dc3fd8406316ad6ef7baea4bfa0bd204302134afeb7a6b55bcf5e0aebbecb4d';
  expected_legacy_marketing_checksum constant text := 'f0da64e7ba372345b3af1e18f70dffaa4461363447f72208d897159af85b865f';
  canonical_lead_checksum constant text := '0c717fe6566cbf7d64d38cc1b246cc152dba66cae891fd11526625dd47a32dd3';
  canonical_marketing_checksum constant text := '0ff58b8d51f650fded3a30752d7156052ec72658dc3773c6ac6a4836cbe60a7e';
  target_table text;
BEGIN
  SELECT trim(checksum) INTO legacy_lead_checksum
  FROM schema_migrations WHERE name = '0009_sales_lead_queue.sql';

  IF legacy_lead_checksum IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM schema_migrations WHERE name = '0013_sales_lead_queue.sql') THEN
    IF legacy_lead_checksum <> expected_legacy_lead_checksum THEN
      RAISE EXCEPTION 'Legacy Sales Lead migration checksum is not recognized; manual integrity review is required.';
    END IF;

    FOREACH target_table IN ARRAY ARRAY['sales_leads', 'sales_call_logs', 'sales_customer_relationships'] LOOP
      IF to_regclass('public.' || target_table) IS NULL THEN
        RAISE EXCEPTION 'Legacy Sales table % is missing; migration cannot be bridged safely.', target_table;
      END IF;
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = target_table AND column_name = 'customer_identity_id'
      ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = target_table AND column_name = 'canonical_identity_id'
      ) THEN
        EXECUTE format('ALTER TABLE %I RENAME COLUMN customer_identity_id TO canonical_identity_id', target_table);
      ELSIF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = target_table AND column_name = 'canonical_identity_id'
      ) THEN
        RAISE EXCEPTION 'Legacy Sales table % has neither recognized Identity column.', target_table;
      END IF;
    END LOOP;

    GRANT UPDATE(canonical_identity_id) ON sales_call_logs TO tapra2_app;
    INSERT INTO schema_migrations(name, checksum)
    VALUES ('0013_sales_lead_queue.sql', canonical_lead_checksum);
  END IF;

  SELECT trim(checksum) INTO legacy_marketing_checksum
  FROM schema_migrations WHERE name = '0010_sales_marketing_context_links.sql';

  IF legacy_marketing_checksum IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM schema_migrations WHERE name = '0014_sales_marketing_context_links.sql') THEN
    IF legacy_marketing_checksum <> expected_legacy_marketing_checksum THEN
      RAISE EXCEPTION 'Legacy Sales Marketing migration checksum is not recognized; manual integrity review is required.';
    END IF;
    IF to_regclass('public.sales_lead_marketing_links') IS NULL THEN
      RAISE EXCEPTION 'Legacy Sales Marketing table is missing; migration cannot be bridged safely.';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM schema_migrations WHERE name = '0013_sales_lead_queue.sql') THEN
      RAISE EXCEPTION 'Canonical Sales Lead migration must be reconciled before Sales Marketing.';
    END IF;
    INSERT INTO schema_migrations(name, checksum)
    VALUES ('0014_sales_marketing_context_links.sql', canonical_marketing_checksum);
  END IF;
END $$;
