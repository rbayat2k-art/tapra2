import { describe, expect, it } from 'vitest';
import { limitContextToActor } from '../src/modules/organization/context-service.js';
import type { MembershipContext, OrganizationScopeType } from '../src/modules/identity/types.js';

type Scenario = {
  id: string;
  role: string;
  description: string;
  actor: MembershipContext;
  target: MembershipContext;
  allowed: boolean;
  expectedPermissions?: string[];
};

const ids = {
  workspaceAlpha: '10000000-0000-4000-8000-000000000001',
  workspaceBeta: '10000000-0000-4000-8000-000000000002',
  companyAlpha: '20000000-0000-4000-8000-000000000001',
  companyBeta: '20000000-0000-4000-8000-000000000002',
  branchAlphaOne: '30000000-0000-4000-8000-000000000001',
  branchAlphaTwo: '30000000-0000-4000-8000-000000000002',
  departmentAlpha: '40000000-0000-4000-8000-000000000001',
  teamAlphaOne: '50000000-0000-4000-8000-000000000001',
  teamAlphaTwo: '50000000-0000-4000-8000-000000000002',
  personAlpha: '60000000-0000-4000-8000-000000000001',
};

const organizationAll = [
  'organization.read',
  'organization.company.manage',
  'organization.unit.manage',
  'organization.user.manage',
  'organization.membership.manage',
  'organization.role.manage',
  'organization.impersonate',
];
const customerData = [
  'customer.read',
  'customer.identity.reconcile',
  'customer.import.read',
  'customer.import.create',
  'customer.import.review',
  'customer.import.approve',
];
const salesManager = [
  'customer.read',
  'sales.queue.read',
  'sales.call.create',
  'sales.lead.read_all',
  'sales.lead.assign',
  'sales.lead.reassign',
];
const salesperson = ['customer.read', 'sales.queue.read', 'sales.call.create'];

function context(input: {
  key: string;
  workspaceId?: string;
  companyId?: string | null;
  scopeType: OrganizationScopeType;
  scopeId: string;
  permissions?: string[];
}): MembershipContext {
  const workspaceId = input.workspaceId ?? ids.workspaceAlpha;
  const companyId = input.companyId === undefined ? ids.companyAlpha : input.companyId;
  const unitType = ['BRANCH', 'DEPARTMENT', 'TEAM'].includes(input.scopeType)
    ? input.scopeType as 'BRANCH' | 'DEPARTMENT' | 'TEAM'
    : null;
  return {
    contextKey: input.key,
    membershipId: `membership-${input.key}`,
    workspace: { id: workspaceId, name: workspaceId === ids.workspaceAlpha ? 'Alpha Workspace' : 'Beta Workspace', slug: input.key },
    company: companyId ? { id: companyId, name: companyId === ids.companyAlpha ? 'Alpha' : 'Beta', code: input.key } : null,
    organizationUnit: unitType
      ? { id: input.scopeId, type: unitType, name: input.key, code: input.key }
      : null,
    scope: { type: input.scopeType, id: input.scopeId },
    roles: [{ id: `role-${input.key}`, code: input.key, name: input.key }],
    permissions: input.permissions ?? [],
  };
}

const scenarios: Scenario[] = [
  {
    id: 'A01', role: 'Super Admin', description: 'Workspace actor can enter Alpha Company without gaining target-only permissions',
    actor: context({ key: 'super-admin', scopeType: 'WORKSPACE', scopeId: ids.workspaceAlpha, companyId: null, permissions: [...organizationAll, ...customerData] }),
    target: context({ key: 'alpha-manager', scopeType: 'COMPANY', scopeId: ids.companyAlpha, permissions: ['organization.read', 'customer.read', 'sales.lead.assign'] }),
    allowed: true, expectedPermissions: ['organization.read', 'customer.read'],
  },
  {
    id: 'A02', role: 'Super Admin', description: 'Workspace actor can enter another Company in the same Workspace',
    actor: context({ key: 'super-admin-beta', scopeType: 'WORKSPACE', scopeId: ids.workspaceAlpha, companyId: null, permissions: organizationAll }),
    target: context({ key: 'beta-company', scopeType: 'COMPANY', scopeId: ids.companyBeta, companyId: ids.companyBeta, permissions: ['organization.read', 'organization.user.manage'] }),
    allowed: true, expectedPermissions: ['organization.read', 'organization.user.manage'],
  },
  {
    id: 'A03', role: 'Super Admin', description: 'Workspace actor cannot cross the Alpha/Beta Workspace tenant boundary',
    actor: context({ key: 'alpha-super-admin', scopeType: 'WORKSPACE', scopeId: ids.workspaceAlpha, companyId: null, permissions: organizationAll }),
    target: context({ key: 'other-workspace', workspaceId: ids.workspaceBeta, scopeType: 'WORKSPACE', scopeId: ids.workspaceBeta, companyId: null, permissions: ['organization.read'] }),
    allowed: false,
  },
  {
    id: 'A04', role: 'Workspace Manager', description: 'Workspace manager can use the Workspace-level context used for Shared Services',
    actor: context({ key: 'workspace-manager', scopeType: 'WORKSPACE', scopeId: ids.workspaceAlpha, companyId: null, permissions: ['organization.read', 'organization.unit.manage', 'organization.impersonate'] }),
    target: context({ key: 'shared-service-user', scopeType: 'WORKSPACE', scopeId: ids.workspaceAlpha, companyId: null, permissions: ['organization.read'] }),
    allowed: true, expectedPermissions: ['organization.read'],
  },
  {
    id: 'A05', role: 'Workspace Manager', description: 'Workspace manager can view a Company context when both sides grant organization.read',
    actor: context({ key: 'workspace-viewer', scopeType: 'WORKSPACE', scopeId: ids.workspaceAlpha, companyId: null, permissions: ['organization.read'] }),
    target: context({ key: 'company-viewer', scopeType: 'COMPANY', scopeId: ids.companyAlpha, permissions: ['organization.read'] }),
    allowed: true, expectedPermissions: ['organization.read'],
  },
  {
    id: 'A06', role: 'Workspace Manager', description: 'Unauthorized Company mutation permission is removed during impersonation',
    actor: context({ key: 'workspace-read-only', scopeType: 'WORKSPACE', scopeId: ids.workspaceAlpha, companyId: null, permissions: ['organization.read'] }),
    target: context({ key: 'company-admin-target', scopeType: 'COMPANY', scopeId: ids.companyAlpha, permissions: ['organization.read', 'organization.company.manage'] }),
    allowed: true, expectedPermissions: ['organization.read'],
  },
  {
    id: 'A07', role: 'Data Manager', description: 'Workspace Data Manager can retain Customer read in Alpha',
    actor: context({ key: 'data-manager-alpha', scopeType: 'WORKSPACE', scopeId: ids.workspaceAlpha, companyId: null, permissions: customerData }),
    target: context({ key: 'data-target-alpha', scopeType: 'COMPANY', scopeId: ids.companyAlpha, permissions: ['customer.read'] }),
    allowed: true, expectedPermissions: ['customer.read'],
  },
  {
    id: 'A08', role: 'Data Manager', description: 'Workspace Data Manager can retain Import read in Beta Company of the same Workspace',
    actor: context({ key: 'data-manager-beta', scopeType: 'WORKSPACE', scopeId: ids.workspaceAlpha, companyId: null, permissions: customerData }),
    target: context({ key: 'data-target-beta', scopeType: 'COMPANY', scopeId: ids.companyBeta, companyId: ids.companyBeta, permissions: ['customer.import.read'] }),
    allowed: true, expectedPermissions: ['customer.import.read'],
  },
  {
    id: 'A09', role: 'Data Manager', description: 'Data permissions cannot become Sales assignment permission',
    actor: context({ key: 'data-no-sales', scopeType: 'WORKSPACE', scopeId: ids.workspaceAlpha, companyId: null, permissions: customerData }),
    target: context({ key: 'sales-target', scopeType: 'COMPANY', scopeId: ids.companyAlpha, permissions: ['customer.read', 'sales.lead.assign'] }),
    allowed: true, expectedPermissions: ['customer.read'],
  },
  {
    id: 'A10', role: 'MIS', description: 'Workspace MIS view can retain organization.read in Alpha',
    actor: context({ key: 'mis-alpha', scopeType: 'WORKSPACE', scopeId: ids.workspaceAlpha, companyId: null, permissions: ['organization.read'] }),
    target: context({ key: 'mis-target-alpha', scopeType: 'COMPANY', scopeId: ids.companyAlpha, permissions: ['organization.read'] }),
    allowed: true, expectedPermissions: ['organization.read'],
  },
  {
    id: 'A11', role: 'MIS', description: 'Workspace MIS view can retain organization.read in Beta Company of the same Workspace',
    actor: context({ key: 'mis-beta', scopeType: 'WORKSPACE', scopeId: ids.workspaceAlpha, companyId: null, permissions: ['organization.read'] }),
    target: context({ key: 'mis-target-beta', scopeType: 'COMPANY', scopeId: ids.companyBeta, companyId: ids.companyBeta, permissions: ['organization.read'] }),
    allowed: true, expectedPermissions: ['organization.read'],
  },
  {
    id: 'A12', role: 'MIS', description: 'MIS read context cannot gain Customer mutation rights',
    actor: context({ key: 'mis-read-only', scopeType: 'WORKSPACE', scopeId: ids.workspaceAlpha, companyId: null, permissions: ['organization.read'] }),
    target: context({ key: 'customer-writer', scopeType: 'COMPANY', scopeId: ids.companyAlpha, permissions: ['organization.read', 'customer.create'] }),
    allowed: true, expectedPermissions: ['organization.read'],
  },
  {
    id: 'A13', role: 'Sales Manager', description: 'Alpha Company manager can enter an Alpha salesperson SELF context',
    actor: context({ key: 'sales-manager-alpha', scopeType: 'COMPANY', scopeId: ids.companyAlpha, permissions: salesManager }),
    target: context({ key: 'salesperson-alpha-self', scopeType: 'SELF', scopeId: ids.personAlpha, permissions: salesperson }),
    allowed: true, expectedPermissions: salesperson,
  },
  {
    id: 'A14', role: 'Sales Manager', description: 'Alpha Company manager cannot enter Beta Company context',
    actor: context({ key: 'sales-manager-alpha-cross-company', scopeType: 'COMPANY', scopeId: ids.companyAlpha, permissions: salesManager }),
    target: context({ key: 'salesperson-beta', scopeType: 'COMPANY', scopeId: ids.companyBeta, companyId: ids.companyBeta, permissions: salesperson }),
    allowed: false,
  },
  {
    id: 'A15', role: 'Sales Manager', description: 'Company manager cannot enter a Workspace-wide target context',
    actor: context({ key: 'sales-manager-no-workspace', scopeType: 'COMPANY', scopeId: ids.companyAlpha, permissions: salesManager }),
    target: context({ key: 'workspace-target', scopeType: 'WORKSPACE', scopeId: ids.workspaceAlpha, companyId: null, permissions: ['organization.read'] }),
    allowed: false,
  },
  {
    id: 'A16', role: 'Sales Manager', description: 'Sales manager cannot inherit Organization administration from the target',
    actor: context({ key: 'sales-manager-capped', scopeType: 'COMPANY', scopeId: ids.companyAlpha, permissions: salesManager }),
    target: context({ key: 'sales-org-admin-target', scopeType: 'COMPANY', scopeId: ids.companyAlpha, permissions: ['sales.queue.read', 'organization.user.manage'] }),
    allowed: true, expectedPermissions: ['sales.queue.read'],
  },
  {
    id: 'A17', role: 'Supervisor', description: 'Branch supervisor can enter the exact same Branch scope',
    actor: context({ key: 'branch-supervisor', scopeType: 'BRANCH', scopeId: ids.branchAlphaOne, permissions: salesManager }),
    target: context({ key: 'branch-member', scopeType: 'BRANCH', scopeId: ids.branchAlphaOne, permissions: salesperson }),
    allowed: true, expectedPermissions: salesperson,
  },
  {
    id: 'A18', role: 'Supervisor', description: 'Branch supervisor cannot enter another Branch',
    actor: context({ key: 'branch-supervisor-cross', scopeType: 'BRANCH', scopeId: ids.branchAlphaOne, permissions: salesManager }),
    target: context({ key: 'other-branch', scopeType: 'BRANCH', scopeId: ids.branchAlphaTwo, permissions: salesperson }),
    allowed: false,
  },
  {
    id: 'A19', role: 'Supervisor', description: 'Branch supervisor cannot expand to the whole Company',
    actor: context({ key: 'branch-supervisor-company', scopeType: 'BRANCH', scopeId: ids.branchAlphaOne, permissions: salesManager }),
    target: context({ key: 'company-target-for-branch', scopeType: 'COMPANY', scopeId: ids.companyAlpha, permissions: salesperson }),
    allowed: false,
  },
  {
    id: 'A20', role: 'Supervisor', description: 'Team supervisor can enter the exact same Team scope',
    actor: context({ key: 'team-supervisor', scopeType: 'TEAM', scopeId: ids.teamAlphaOne, permissions: salesManager }),
    target: context({ key: 'team-member', scopeType: 'TEAM', scopeId: ids.teamAlphaOne, permissions: salesperson }),
    allowed: true, expectedPermissions: salesperson,
  },
  {
    id: 'A21', role: 'Supervisor', description: 'Team supervisor cannot enter another Team',
    actor: context({ key: 'team-supervisor-cross', scopeType: 'TEAM', scopeId: ids.teamAlphaOne, permissions: salesManager }),
    target: context({ key: 'other-team', scopeType: 'TEAM', scopeId: ids.teamAlphaTwo, permissions: salesperson }),
    allowed: false,
  },
  {
    id: 'A22', role: 'Supervisor', description: 'Team supervisor cannot expand to Department scope',
    actor: context({ key: 'team-supervisor-department', scopeType: 'TEAM', scopeId: ids.teamAlphaOne, permissions: salesManager }),
    target: context({ key: 'department-target', scopeType: 'DEPARTMENT', scopeId: ids.departmentAlpha, permissions: salesperson }),
    allowed: false,
  },
  {
    id: 'A23', role: 'Salesperson', description: 'SELF scope can never impersonate another UserAccount',
    actor: context({ key: 'salesperson-self-actor', scopeType: 'SELF', scopeId: ids.personAlpha, permissions: salesperson }),
    target: context({ key: 'another-salesperson', scopeType: 'SELF', scopeId: '60000000-0000-4000-8000-000000000002', permissions: salesperson }),
    allowed: false,
  },
  {
    id: 'A24', role: 'Salesperson', description: 'A narrow Company actor cannot gain manager permissions from the target',
    actor: context({ key: 'salesperson-company-actor', scopeType: 'COMPANY', scopeId: ids.companyAlpha, permissions: salesperson }),
    target: context({ key: 'manager-target', scopeType: 'COMPANY', scopeId: ids.companyAlpha, permissions: salesManager }),
    allowed: true, expectedPermissions: salesperson,
  },
  {
    id: 'A25', role: 'Sales Manager', description: 'Company manager can target SELF only when it belongs to the same Company',
    actor: context({ key: 'company-manager-self', scopeType: 'COMPANY', scopeId: ids.companyAlpha, permissions: salesManager }),
    target: context({ key: 'same-company-self', scopeType: 'SELF', scopeId: ids.personAlpha, permissions: ['sales.queue.read'] }),
    allowed: true, expectedPermissions: ['sales.queue.read'],
  },
  {
    id: 'A26', role: 'Sales Manager', description: 'Company manager cannot target a Workspace-level SELF context without Company',
    actor: context({ key: 'company-manager-null-company', scopeType: 'COMPANY', scopeId: ids.companyAlpha, permissions: salesManager }),
    target: context({ key: 'workspace-self', scopeType: 'SELF', scopeId: ids.personAlpha, companyId: null, permissions: ['sales.queue.read'] }),
    allowed: false,
  },
  {
    id: 'A27', role: 'Workspace Manager', description: 'Workspace actor can target SELF in the same Workspace and still applies permission intersection',
    actor: context({ key: 'workspace-to-self', scopeType: 'WORKSPACE', scopeId: ids.workspaceAlpha, companyId: null, permissions: ['customer.read'] }),
    target: context({ key: 'self-customer-target', scopeType: 'SELF', scopeId: ids.personAlpha, permissions: ['customer.read', 'customer.create'] }),
    allowed: true, expectedPermissions: ['customer.read'],
  },
  {
    id: 'A28', role: 'Data Manager', description: 'Import review and approval remain absent when actor has only Import read',
    actor: context({ key: 'import-read-actor', scopeType: 'WORKSPACE', scopeId: ids.workspaceAlpha, companyId: null, permissions: ['customer.import.read'] }),
    target: context({ key: 'import-review-target', scopeType: 'COMPANY', scopeId: ids.companyAlpha, permissions: ['customer.import.read', 'customer.import.review', 'customer.import.approve'] }),
    allowed: true, expectedPermissions: ['customer.import.read'],
  },
  {
    id: 'A29', role: 'Finance User', description: 'Prototype-only Finance role cannot leak any permission into the server context',
    actor: context({ key: 'finance-prototype', scopeType: 'COMPANY', scopeId: ids.companyAlpha, permissions: [] }),
    target: context({ key: 'finance-target', scopeType: 'COMPANY', scopeId: ids.companyAlpha, permissions: ['organization.read', 'customer.read'] }),
    allowed: true, expectedPermissions: [],
  },
  {
    id: 'A30', role: 'Support User', description: 'Prototype-only Support role cannot leak any permission into the server context',
    actor: context({ key: 'support-prototype', scopeType: 'COMPANY', scopeId: ids.companyAlpha, permissions: [] }),
    target: context({ key: 'support-target', scopeType: 'COMPANY', scopeId: ids.companyAlpha, permissions: ['organization.read', 'customer.read'] }),
    allowed: true, expectedPermissions: [],
  },
];

describe('Role, Permission and Scope verification matrix', () => {
  it('contains exactly 30 explicit scenarios with stable IDs', () => {
    expect(scenarios).toHaveLength(30);
    expect(new Set(scenarios.map((scenario) => scenario.id)).size).toBe(30);
  });

  it.each(scenarios)('$id — $role — $description', (scenario) => {
    if (!scenario.allowed) {
      expect(() => limitContextToActor(scenario.target, scenario.actor)).toThrowError(
        expect.objectContaining({ status: 403, code: 'impersonation_scope_forbidden' }),
      );
      return;
    }

    const result = limitContextToActor(scenario.target, scenario.actor);
    expect(result.workspace.id).toBe(scenario.target.workspace.id);
    expect(result.scope).toEqual(scenario.target.scope);
    expect(result.permissions).toEqual(scenario.expectedPermissions ?? []);
  });
});
