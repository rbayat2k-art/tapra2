ALTER TABLE sales_invoice_lines
  ADD COLUMN inventory_item_id uuid;

UPDATE sales_invoice_lines line
SET inventory_item_id = item.id
FROM inventory_items item
WHERE line.workspace_id = item.workspace_id
  AND line.catalog_reference = item.catalog_reference
  AND line.item_type = 'goods'
  AND item.is_active = true
  AND line.inventory_item_id IS NULL;

ALTER TABLE sales_invoice_lines
  ADD CONSTRAINT sales_invoice_lines_inventory_item_fk
    FOREIGN KEY (workspace_id, inventory_item_id) REFERENCES inventory_items(workspace_id, id),
  ADD CONSTRAINT sales_invoice_lines_inventory_item_goods_check
    CHECK (inventory_item_id IS NULL OR item_type = 'goods');

CREATE INDEX sales_invoice_lines_inventory_item_idx
  ON sales_invoice_lines(workspace_id, company_id, inventory_item_id)
  WHERE inventory_item_id IS NOT NULL;
