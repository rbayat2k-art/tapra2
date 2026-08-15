INSERT INTO permissions(code, description) VALUES
  ('sales.queue.read', 'Read the active seller queue in the current Company context'),
  ('sales.lead.create', 'Create a Sales Lead for a Customer relationship in the current Company'),
  ('sales.lead.read_all', 'Read all Sales Leads in the current Company context'),
  ('sales.lead.assign', 'Assign an unowned Sales Lead in the current Company'),
  ('sales.lead.reassign', 'Reassign an owned Sales Lead with a reason in the current Company'),
  ('sales.call.create', 'Record a Call Log for an assigned Sales Lead')
ON CONFLICT (code) DO UPDATE SET description = EXCLUDED.description;

ALTER TABLE customer_timeline_events
  DROP CONSTRAINT customer_timeline_events_event_type_check,
  ADD CONSTRAINT customer_timeline_events_event_type_check CHECK (event_type IN (
    'customer_created', 'phone_added', 'address_added', 'source_linked',
    'customer_merged', 'customer_split', 'customer_imported', 'import_data_linked',
    'sales_lead_created', 'sales_call_logged', 'sales_marketing_linked',
    'customer_identity_merged', 'customer_identity_split'
  ));

ALTER TABLE memberships
  ADD CONSTRAINT memberships_workspace_company_id_key UNIQUE (workspace_id, company_id, id);

CREATE TABLE sales_policies (
  workspace_id uuid NOT NULL,
  company_id uuid NOT NULL,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  effective_call_outcomes text[] NOT NULL DEFAULT ARRAY['real_conversation', 'interested', 'ready_for_invoice']::text[],
  relationship_lock_mode text NOT NULL DEFAULT 'until_reassigned'
    CHECK (relationship_lock_mode IN ('none', 'until_reassigned', 'duration')),
  relationship_lock_duration_minutes integer,
  failed_call_releases_assignment boolean NOT NULL DEFAULT false,
  shift_end_releases_assignment boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, company_id),
  FOREIGN KEY (workspace_id, company_id) REFERENCES companies(workspace_id, id),
  CHECK (cardinality(effective_call_outcomes) > 0),
  CHECK (
    (relationship_lock_mode = 'duration' AND relationship_lock_duration_minutes > 0)
    OR (relationship_lock_mode <> 'duration' AND relationship_lock_duration_minutes IS NULL)
  )
);

INSERT INTO sales_policies(workspace_id, company_id)
SELECT workspace_id, id FROM companies
ON CONFLICT (workspace_id, company_id) DO NOTHING;

CREATE TABLE sales_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  company_id uuid NOT NULL,
  canonical_identity_id uuid NOT NULL,
  customer_id uuid NOT NULL,
  tracking_code text NOT NULL CHECK (length(trim(tracking_code)) BETWEEN 3 AND 40),
  source text NOT NULL CHECK (length(trim(source)) BETWEEN 1 AND 200),
  declared_interest text NOT NULL CHECK (length(trim(declared_interest)) BETWEEN 2 AND 500),
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high')),
  status text NOT NULL DEFAULT 'new' CHECK (status IN (
    'new', 'pending_action', 'callback_scheduled', 'overdue', 'in_negotiation',
    'ready_for_invoice', 'closed_won', 'closed_lost', 'wrong_number', 'complaint_blocked'
  )),
  campaign_reference text CHECK (campaign_reference IS NULL OR length(trim(campaign_reference)) BETWEEN 1 AND 200),
  context_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(context_snapshot) = 'object'),
  current_assignee_membership_id uuid,
  first_attempt_at timestamptz,
  first_effective_contact_at timestamptz,
  last_call_outcome text,
  action_deadline timestamptz,
  created_by_user_account_id uuid NOT NULL REFERENCES user_accounts(id),
  idempotency_key uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  UNIQUE (workspace_id, company_id, id),
  UNIQUE (workspace_id, company_id, tracking_code),
  UNIQUE (workspace_id, company_id, idempotency_key),
  FOREIGN KEY (workspace_id, company_id) REFERENCES companies(workspace_id, id),
  FOREIGN KEY (workspace_id, canonical_identity_id) REFERENCES customer_identities(workspace_id, id),
  FOREIGN KEY (workspace_id, company_id, customer_id) REFERENCES customers(workspace_id, company_id, id),
  FOREIGN KEY (workspace_id, company_id, current_assignee_membership_id)
    REFERENCES memberships(workspace_id, company_id, id)
);

CREATE INDEX sales_leads_queue_idx
  ON sales_leads(workspace_id, company_id, current_assignee_membership_id, status, updated_at DESC);
CREATE INDEX sales_leads_customer_idx
  ON sales_leads(workspace_id, company_id, customer_id, created_at DESC);

CREATE TABLE sales_lead_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  company_id uuid NOT NULL,
  lead_id uuid NOT NULL,
  previous_assignee_membership_id uuid,
  assignee_membership_id uuid NOT NULL,
  assigned_by_user_account_id uuid NOT NULL REFERENCES user_accounts(id),
  assignment_type text NOT NULL CHECK (assignment_type IN ('assigned', 'reassigned')),
  reason text,
  idempotency_key uuid NOT NULL,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, company_id, id),
  UNIQUE (workspace_id, company_id, idempotency_key),
  FOREIGN KEY (workspace_id, company_id, lead_id) REFERENCES sales_leads(workspace_id, company_id, id),
  FOREIGN KEY (workspace_id, company_id, previous_assignee_membership_id)
    REFERENCES memberships(workspace_id, company_id, id),
  FOREIGN KEY (workspace_id, company_id, assignee_membership_id)
    REFERENCES memberships(workspace_id, company_id, id),
  CHECK (
    (assignment_type = 'assigned' AND previous_assignee_membership_id IS NULL)
    OR (assignment_type = 'reassigned' AND previous_assignee_membership_id IS NOT NULL AND length(trim(reason)) >= 3)
  )
);

CREATE INDEX sales_lead_assignments_history_idx
  ON sales_lead_assignments(workspace_id, company_id, lead_id, assigned_at DESC);

CREATE TABLE sales_lead_timeline_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  company_id uuid NOT NULL,
  lead_id uuid NOT NULL,
  actor_user_account_id uuid NOT NULL REFERENCES user_accounts(id),
  event_type text NOT NULL CHECK (length(trim(event_type)) BETWEEN 1 AND 100),
  summary text NOT NULL CHECK (length(trim(summary)) BETWEEN 1 AND 500),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, company_id, id),
  FOREIGN KEY (workspace_id, company_id, lead_id) REFERENCES sales_leads(workspace_id, company_id, id)
);

CREATE INDEX sales_lead_timeline_history_idx
  ON sales_lead_timeline_events(workspace_id, company_id, lead_id, occurred_at DESC);

CREATE TABLE sales_call_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  company_id uuid NOT NULL,
  lead_id uuid NOT NULL,
  canonical_identity_id uuid NOT NULL,
  customer_id uuid NOT NULL,
  salesperson_membership_id uuid NOT NULL,
  actor_user_account_id uuid NOT NULL REFERENCES user_accounts(id),
  campaign_reference text,
  context_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(context_snapshot) = 'object'),
  started_at timestamptz NOT NULL,
  ended_at timestamptz NOT NULL DEFAULT now(),
  outcome text NOT NULL CHECK (outcome IN (
    'not_dialed', 'could_not_connect', 'switched_off', 'no_answer', 'wrong_number',
    'connected_no_time', 'real_conversation', 'callback_requested', 'interested',
    'ready_for_invoice', 'cancelled', 'complaint'
  )),
  effective boolean NOT NULL,
  note text,
  callback_at timestamptz,
  idempotency_key uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, company_id, id),
  UNIQUE (workspace_id, company_id, idempotency_key),
  FOREIGN KEY (workspace_id, company_id, lead_id) REFERENCES sales_leads(workspace_id, company_id, id),
  FOREIGN KEY (workspace_id, canonical_identity_id) REFERENCES customer_identities(workspace_id, id),
  FOREIGN KEY (workspace_id, company_id, customer_id) REFERENCES customers(workspace_id, company_id, id),
  FOREIGN KEY (workspace_id, company_id, salesperson_membership_id)
    REFERENCES memberships(workspace_id, company_id, id),
  CHECK (ended_at >= started_at),
  CHECK (outcome <> 'callback_requested' OR callback_at IS NOT NULL)
);

CREATE INDEX sales_call_logs_lead_history_idx
  ON sales_call_logs(workspace_id, company_id, lead_id, created_at DESC);
CREATE INDEX sales_call_logs_customer_history_idx
  ON sales_call_logs(workspace_id, company_id, customer_id, created_at DESC);

CREATE TABLE sales_customer_relationships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  company_id uuid NOT NULL,
  canonical_identity_id uuid NOT NULL,
  customer_id uuid NOT NULL,
  owner_membership_id uuid,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'released')),
  lock_mode text NOT NULL CHECK (lock_mode IN ('none', 'until_reassigned', 'duration')),
  lock_acquired_at timestamptz,
  lock_expires_at timestamptz,
  latest_effective_call_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  UNIQUE (workspace_id, company_id, id),
  UNIQUE (workspace_id, company_id, customer_id),
  FOREIGN KEY (workspace_id, company_id) REFERENCES companies(workspace_id, id),
  FOREIGN KEY (workspace_id, canonical_identity_id) REFERENCES customer_identities(workspace_id, id),
  FOREIGN KEY (workspace_id, company_id, customer_id) REFERENCES customers(workspace_id, company_id, id),
  FOREIGN KEY (workspace_id, company_id, owner_membership_id)
    REFERENCES memberships(workspace_id, company_id, id),
  FOREIGN KEY (workspace_id, company_id, latest_effective_call_id)
    REFERENCES sales_call_logs(workspace_id, company_id, id),
  CHECK (
    (lock_mode = 'none' AND owner_membership_id IS NULL AND lock_acquired_at IS NULL AND lock_expires_at IS NULL)
    OR (lock_mode = 'until_reassigned' AND owner_membership_id IS NOT NULL AND lock_acquired_at IS NOT NULL AND lock_expires_at IS NULL)
    OR (lock_mode = 'duration' AND owner_membership_id IS NOT NULL AND lock_acquired_at IS NOT NULL AND lock_expires_at IS NOT NULL)
  )
);

CREATE INDEX sales_customer_relationship_owner_idx
  ON sales_customer_relationships(workspace_id, company_id, owner_membership_id, updated_at DESC);

CREATE TABLE sales_customer_relationship_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  company_id uuid NOT NULL,
  relationship_id uuid NOT NULL,
  lead_id uuid NOT NULL,
  call_log_id uuid,
  actor_user_account_id uuid NOT NULL REFERENCES user_accounts(id),
  event_type text NOT NULL CHECK (event_type IN ('relationship_created', 'lock_acquired', 'lock_refreshed', 'lock_reassigned')),
  previous_owner_membership_id uuid,
  new_owner_membership_id uuid,
  reason text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (workspace_id, company_id, relationship_id)
    REFERENCES sales_customer_relationships(workspace_id, company_id, id),
  FOREIGN KEY (workspace_id, company_id, lead_id) REFERENCES sales_leads(workspace_id, company_id, id),
  FOREIGN KEY (workspace_id, company_id, call_log_id) REFERENCES sales_call_logs(workspace_id, company_id, id),
  FOREIGN KEY (workspace_id, company_id, previous_owner_membership_id)
    REFERENCES memberships(workspace_id, company_id, id),
  FOREIGN KEY (workspace_id, company_id, new_owner_membership_id)
    REFERENCES memberships(workspace_id, company_id, id)
);

CREATE INDEX sales_customer_relationship_events_history_idx
  ON sales_customer_relationship_events(workspace_id, company_id, relationship_id, occurred_at DESC);

ALTER TABLE sales_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_policies FORCE ROW LEVEL SECURITY;
ALTER TABLE sales_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_leads FORCE ROW LEVEL SECURITY;
ALTER TABLE sales_lead_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_lead_assignments FORCE ROW LEVEL SECURITY;
ALTER TABLE sales_lead_timeline_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_lead_timeline_events FORCE ROW LEVEL SECURITY;
ALTER TABLE sales_call_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_call_logs FORCE ROW LEVEL SECURITY;
ALTER TABLE sales_customer_relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_customer_relationships FORCE ROW LEVEL SECURITY;
ALTER TABLE sales_customer_relationship_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_customer_relationship_events FORCE ROW LEVEL SECURITY;

CREATE POLICY sales_policies_context_policy ON sales_policies FOR ALL TO tapra2_app
  USING (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid
    AND company_id = NULLIF(current_setting('app.company_id', true), '')::uuid)
  WITH CHECK (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid
    AND company_id = NULLIF(current_setting('app.company_id', true), '')::uuid);
CREATE POLICY sales_leads_context_policy ON sales_leads FOR ALL TO tapra2_app
  USING (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid
    AND company_id = NULLIF(current_setting('app.company_id', true), '')::uuid)
  WITH CHECK (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid
    AND company_id = NULLIF(current_setting('app.company_id', true), '')::uuid);
CREATE POLICY sales_lead_assignments_context_policy ON sales_lead_assignments FOR ALL TO tapra2_app
  USING (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid
    AND company_id = NULLIF(current_setting('app.company_id', true), '')::uuid)
  WITH CHECK (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid
    AND company_id = NULLIF(current_setting('app.company_id', true), '')::uuid);
CREATE POLICY sales_lead_timeline_context_policy ON sales_lead_timeline_events FOR ALL TO tapra2_app
  USING (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid
    AND company_id = NULLIF(current_setting('app.company_id', true), '')::uuid)
  WITH CHECK (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid
    AND company_id = NULLIF(current_setting('app.company_id', true), '')::uuid);
CREATE POLICY sales_call_logs_context_policy ON sales_call_logs FOR ALL TO tapra2_app
  USING (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid
    AND company_id = NULLIF(current_setting('app.company_id', true), '')::uuid)
  WITH CHECK (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid
    AND company_id = NULLIF(current_setting('app.company_id', true), '')::uuid);
CREATE POLICY sales_customer_relationships_context_policy ON sales_customer_relationships FOR ALL TO tapra2_app
  USING (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid
    AND company_id = NULLIF(current_setting('app.company_id', true), '')::uuid)
  WITH CHECK (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid
    AND company_id = NULLIF(current_setting('app.company_id', true), '')::uuid);
CREATE POLICY sales_customer_relationship_events_context_policy ON sales_customer_relationship_events FOR ALL TO tapra2_app
  USING (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid
    AND company_id = NULLIF(current_setting('app.company_id', true), '')::uuid)
  WITH CHECK (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid
    AND company_id = NULLIF(current_setting('app.company_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE ON sales_policies TO tapra2_app;
GRANT SELECT, INSERT, UPDATE ON sales_leads TO tapra2_app;
GRANT SELECT, INSERT ON sales_lead_assignments, sales_lead_timeline_events, sales_call_logs,
  sales_customer_relationship_events TO tapra2_app;
GRANT UPDATE(canonical_identity_id) ON sales_call_logs TO tapra2_app;
GRANT SELECT, INSERT, UPDATE ON sales_customer_relationships TO tapra2_app;
