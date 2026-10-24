export interface NavItem {
  id: string;
  label: string;
  href: string;
  status: 'active' | 'upcoming';
  badge?: string;
  description?: string;
}

export const NAVIGATION_ITEMS: NavItem[] = [
  {
    id: 'overview',
    label: 'Overview',
    href: '/',
    status: 'active',
    description: 'System connectivity & platform summary',
  },
  {
    id: 'brand-vault',
    label: 'Brand Vault',
    href: '/vault',
    status: 'active',
    description: 'Guidelines, approved facts & terminology rules',
  },
  {
    id: 'content-studio',
    label: 'Content Studio',
    href: '/studio',
    status: 'active',
    description: 'Draft, revise & validate brand communications',
  },
  {
    id: 'validation-runs',
    label: 'Validation Runs',
    href: '/runs',
    status: 'active',
    description: 'Run history, findings analysis & evidence snapshots',
  },
  {
    id: 'approvals',
    label: 'Approvals',
    href: '/approvals',
    status: 'upcoming',
    badge: 'Phase 5',
    description: 'Human governance & sign-off workflow',
  },
  {
    id: 'insights',
    label: 'Insights',
    href: '/insights',
    status: 'active',
    description: 'Recorded validation findings & human review counts',
  },
];
