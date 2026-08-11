# Synthetic Customer Import Fixture

> Status: CURRENT
> Source of truth: This file for the Sprint 3 synthetic import fixture
> Owner: Engineering
> Last validated: 2026-08-11

`customer-import-synthetic-v1.csv` contains 50 entirely fictional rows. It is safe for local development and automated/manual validation; it contains no production or personal data.

Coverage includes valid complete rows, incomplete and invalid rows, an exact match to the deterministic seed phone, repeated historical purchases, an in-file possible duplicate, Persian digits, Arabic-to-Persian character normalization, and RFC 4180 quoted content.

The file uses the `customer-import-v1` schema and UTF-8 encoding. Import it through Customer 360; staging must not mutate master Customer records until all rows have explicit final decisions and an authorized reviewer approves the job.
