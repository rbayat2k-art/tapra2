CREATE TABLE session_impersonations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid REFERENCES sessions(id) ON DELETE SET NULL,
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  actor_user_account_id uuid NOT NULL REFERENCES user_accounts(id),
  actor_membership_id uuid NOT NULL,
  actor_scope_type text NOT NULL CHECK (actor_scope_type IN ('WORKSPACE', 'COMPANY', 'BRANCH', 'DEPARTMENT', 'TEAM', 'SELF')),
  actor_scope_id uuid NOT NULL,
  target_user_account_id uuid NOT NULL REFERENCES user_accounts(id),
  target_membership_id uuid NOT NULL,
  target_scope_type text NOT NULL CHECK (target_scope_type IN ('WORKSPACE', 'COMPANY', 'BRANCH', 'DEPARTMENT', 'TEAM', 'SELF')),
  target_scope_id uuid NOT NULL,
  reason text NOT NULL CHECK (length(trim(reason)) BETWEEN 3 AND 500),
  started_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  ended_at timestamptz,
  ended_by_user_account_id uuid REFERENCES user_accounts(id),
  end_reason text,
  FOREIGN KEY (workspace_id, actor_membership_id) REFERENCES memberships(workspace_id, id),
  FOREIGN KEY (workspace_id, target_membership_id) REFERENCES memberships(workspace_id, id),
  CHECK (actor_user_account_id <> target_user_account_id),
  CHECK (expires_at > started_at),
  CHECK ((ended_at IS NULL AND ended_by_user_account_id IS NULL)
    OR (ended_at IS NOT NULL AND ended_by_user_account_id IS NOT NULL))
);

CREATE UNIQUE INDEX session_impersonations_one_active_idx
  ON session_impersonations(session_id) WHERE ended_at IS NULL;
CREATE INDEX session_impersonations_actor_history_idx
  ON session_impersonations(workspace_id, actor_user_account_id, started_at DESC);

ALTER TABLE audit_entries
  ADD COLUMN effective_user_account_id uuid REFERENCES user_accounts(id),
  ADD COLUMN impersonation_id uuid REFERENCES session_impersonations(id);

GRANT SELECT, INSERT, UPDATE ON session_impersonations TO tapra2_app;
