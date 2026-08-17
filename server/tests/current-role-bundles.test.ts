import { describe, expect, it } from 'vitest';
import { CURRENT_ROLE_BUNDLES, getCurrentRoleBundle } from '../src/modules/access/current-role-bundles.js';

const permissions = (code: Parameters<typeof getCurrentRoleBundle>[0]) =>
  new Set(getCurrentRoleBundle(code).permissions);

describe('CURRENT server role bundles', () => {
  it('keeps Workspace Admin limited to Organization administration', () => {
    const workspaceAdmin = getCurrentRoleBundle('workspace_admin');
    expect(workspaceAdmin.defaultScope).toBe('WORKSPACE');
    expect(workspaceAdmin.permissions).toHaveLength(7);
    expect(workspaceAdmin.permissions.every((permission) => permission.startsWith('organization.'))).toBe(true);
  });

  it('keeps Seller, Supervisor, Manager and PAPER_ENTRY as distinct convenience bundles', () => {
    expect(permissions('sales_seller')).toContain('sales.sale.create');
    expect(permissions('sales_seller')).not.toContain('sales.invoice.supervisor_approve');
    expect(permissions('sales_supervisor')).toContain('sales.invoice.supervisor_approve');
    expect(permissions('sales_supervisor')).not.toContain('sales.sale.create_on_behalf');
    expect(permissions('sales_manager')).toContain('sales.marketing.link');
    expect(permissions('sales_manager')).not.toContain('sales.payment.review');
    expect(permissions('paper_entry_operator')).toContain('sales.sale.create_on_behalf');
    expect(permissions('paper_entry_operator')).not.toContain('sales.sale.create');
  });

  it('keeps payment recording and financial review separated', () => {
    expect(permissions('payment_recorder')).toContain('sales.payment.record');
    expect(permissions('payment_recorder')).not.toContain('sales.payment.review');
    expect(permissions('financial_reviewer')).toContain('sales.payment.review');
    expect(permissions('financial_reviewer')).not.toContain('sales.payment.record');
  });

  it('keeps inventory maker and approver separated', () => {
    expect(permissions('inventory_maker')).toEqual(new Set([
      'warehouse.read', 'warehouse.adjustment.create', 'warehouse.count.create',
    ]));
    expect(permissions('inventory_approver')).toEqual(new Set([
      'warehouse.read', 'warehouse.adjustment.approve', 'warehouse.count.approve',
    ]));
  });

  it('does not create Senior Supervisor, Sales Deputy or Prototype-domain bundles', () => {
    const codes = CURRENT_ROLE_BUNDLES.map((bundle) => bundle.code);
    expect(codes).not.toContain('senior_sales_supervisor');
    expect(codes).not.toContain('sales_deputy');
    for (const prototypePrefix of ['treasury_', 'support_', 'chat_', 'campaign_', 'coordination_', 'fulfillment_']) {
      expect(codes.some((code) => code.startsWith(prototypePrefix))).toBe(false);
    }
  });

  it('contains unique codes and duplicate-free permission lists', () => {
    expect(new Set(CURRENT_ROLE_BUNDLES.map((bundle) => bundle.code)).size).toBe(CURRENT_ROLE_BUNDLES.length);
    for (const bundle of CURRENT_ROLE_BUNDLES) {
      expect(new Set(bundle.permissions).size, bundle.code).toBe(bundle.permissions.length);
    }
  });
});
