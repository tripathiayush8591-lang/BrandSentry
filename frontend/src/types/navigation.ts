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
    status: 'upcoming',
    badge: 'Phase 3',
    description: 'Guidelines, approved facts & terminology rules',
  },
  {
    id: 'content-review',
    label: 'Content Review',
    href: '/review',
    status: 'upcoming',
    badge: 'Phase 3/4',
    description: 'Pre-publication validation & evidence analysis',
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
    status: 'upcoming',
    badge: 'Phase 5',
    description: 'Policy trigger frequencies & audit records',
  },
];
