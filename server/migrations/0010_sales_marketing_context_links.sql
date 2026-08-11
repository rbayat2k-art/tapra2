INSERT INTO permissions(code, description) VALUES
  ('sales.marketing.link', 'Link Campaign or Promotion context to a Sales Lead and Company relationship')
ON CONFLICT (code) DO UPDATE SET description = EXCLUDED.description;

ALTER TABLE customer_timeline_events
  DROP CONSTRAINT customer_timeline_events_event_type_check,
  ADD CONSTRAINT customer_timeline_events_event_type_check CHECK (event_type IN (
    'customer_created', 'phone_added', 'address_added', 'source_linked',
    'customer_merged', 'customer_split', 'customer_imported', 'import_data_linked',
    'sales_lead_created', 'sales_call_logged', 'sales_marketing_linked'
  ));

ALTER TABLE sales_customer_relationship_events
  DROP CONSTRAINT sales_customer_relationship_events_event_type_check,
  ADD CONSTRAINT sales_customer_relationship_events_event_type_check CHECK (event_type IN (
    'relationship_created', 'lock_acquired', 'lock_refreshed', 'lock_reassigned',
    'marketing_context_linked'
  ));

ALTER TABLE sales_leads
  ADD COLUMN promotion_reference text
    CHECK (promotion_reference IS NULL OR length(trim(promotion_reference)) BETWEEN 1 AND 200);

ALTER TABLE sales_call_logs
  ADD COLUMN marketing_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(marketing_snapshot) = 'array');

CREATE TABLE sales_lead_marketing_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  company_id uuid NOT NULL,
  lead_id uuid NOT NULL,
  relationship_id uuid,
  link_type text NOT NULL CHECK (link_type IN ('campaign', 'promotion')),
  reference_code text NOT NULL CHECK (length(trim(reference_code)) BETWEEN 1 AND 200),
  display_name text CHECK (display_name IS NULL OR length(trim(display_name)) BETWEEN 1 AND 300),
  context_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(context_snapshot) = 'object'),
  linked_by_user_account_id uuid NOT NULL REFERENCES user_accounts(id),
  idempotency_key uuid NOT NULL DEFAULT gen_random_uuid(),
  linked_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, company_id, id),
  UNIQUE (workspace_id, company_id, idempotency_key),
  FOREIGN KEY (workspace_id, company_id, lead_id)
    REFERENCES sales_leads(workspace_id, company_id, id),
  FOREIGN KEY (workspace_id, company_id, relationship_id)
    REFERENCES sales_customer_relationships(workspace_id, company_id, id)
);

CREATE UNIQUE INDEX sales_lead_marketing_links_natural_key
  ON sales_lead_marketing_links(workspace_id, company_id, lead_id, link_type, lower(trim(reference_code)));
CREATE INDEX sales_lead_marketing_links_relationship_history_idx
  ON sales_lead_marketing_links(workspace_id, company_id, relationship_id, linked_at, id);

INSERT INTO sales_lead_marketing_links(
  workspace_id, company_id, lead_id, relationship_id, link_type, reference_code,
  context_snapshot, linked_by_user_account_id, linked_at
)
SELECT lead.workspace_id, lead.company_id, lead.id, relationship.id, 'campaign',
  lead.campaign_reference, jsonb_build_object('source', 'sales_leads.campaign_reference'),
  lead.created_by_user_account_id, lead.created_at
FROM sales_leads lead
LEFT JOIN sales_customer_relationships relationship
  ON relationship.workspace_id = lead.workspace_id
  AND relationship.company_id = lead.company_id
  AND relationship.customer_id = lead.customer_id
WHERE lead.campaign_reference IS NOT NULL
ON CONFLICT DO NOTHING;

ALTER TABLE sales_lead_marketing_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_lead_marketing_links FORCE ROW LEVEL SECURITY;

CREATE POLICY sales_lead_marketing_links_context_policy ON sales_lead_marketing_links FOR ALL TO tapra2_app
  USING (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid
    AND company_id = NULLIF(current_setting('app.company_id', true), '')::uuid)
  WITH CHECK (workspace_id = NULLIF(current_setting('app.workspace_id', true), '')::uuid
    AND company_id = NULLIF(current_setting('app.company_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE ON sales_lead_marketing_links TO tapra2_app;
