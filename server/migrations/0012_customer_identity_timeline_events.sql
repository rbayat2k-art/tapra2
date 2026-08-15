ALTER TABLE customer_timeline_events
  DROP CONSTRAINT customer_timeline_events_event_type_check;

ALTER TABLE customer_timeline_events
  ADD CONSTRAINT customer_timeline_events_event_type_check CHECK (event_type IN (
    'customer_created', 'phone_added', 'address_added', 'source_linked',
    'customer_merged', 'customer_split', 'customer_imported', 'import_data_linked',
    'sales_lead_created', 'sales_call_logged', 'sales_marketing_linked',
    'customer_identity_merged', 'customer_identity_split'
  ));
