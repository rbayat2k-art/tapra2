ALTER TABLE user_accounts
    DROP CONSTRAINT user_accounts_identity_provider_external_subject_key;

CREATE UNIQUE INDEX user_accounts_external_identity_unique_idx
    ON user_accounts(identity_provider, external_subject)
    WHERE external_subject IS NOT NULL;
