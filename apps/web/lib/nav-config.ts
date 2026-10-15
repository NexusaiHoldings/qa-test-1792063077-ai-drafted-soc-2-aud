/**
 * Navigation configuration consumed by the substrate's <TopNav /> to render
 * the sticky nav strip.
 *
 * Canonical exports (do not rename): NavLink, NavGroup, NavConfig, NAV_CONFIG.
 * NAV_CONFIG stays an object literal with `primary` + `groups` keys.
 *
 * Links marked `adminOnly` are operator-surface entries; they are part of the
 * config so the admin shell can render them, but public/customer nav
 * rendering must filter them out (see `navForViewer`).
 */

export interface NavLink {
  /** Absolute in-app path. */
  href: string;
  /** Human-readable label rendered in the nav strip. */
  label: string;
  /**
   * When true, the link is operator-only and must never render in the
   * public/customer nav.
   */
  adminOnly?: boolean;
}

export interface NavGroup {
  /** Group heading rendered for the dropdown/section. */
  label: string;
  /** Links inside the group. */
  links: NavLink[];
  /** When true, the entire group is operator-only. */
  adminOnly?: boolean;
}

export interface NavConfig {
  /** Top-level links rendered directly in the nav strip. */
  primary: NavLink[];
  /** Grouped links rendered as dropdowns/sections. */
  groups: NavGroup[];
}

export const NAV_CONFIG: NavConfig = {
  primary: [
    { href: '/scan', label: 'Free Gap Scan' },
    { href: '/gaps', label: 'Gap Report' },
    { href: '/policies', label: 'Policies' },
  ],
  groups: [
    {
      label: 'Workspace',
      links: [
        { href: '/connections', label: 'Connections' },
        { href: '/evidence', label: 'Evidence' },
        { href: '/controls', label: 'Controls' },
        { href: '/handoff', label: 'Auditor Handoff' },
      ],
    },
    {
      label: 'Admin',
      adminOnly: true,
      links: [
        { href: '/admin/controls', label: 'Control Library', adminOnly: true },
        { href: '/admin/acceptance', label: 'Auditor Acceptance', adminOnly: true },
        { href: '/admin/collectors', label: 'Collector Health', adminOnly: true },
      ],
    },
  ],
};

/**
 * Returns the subset of NAV_CONFIG a viewer is allowed to see. Non-operator
 * viewers never receive admin-only links or groups, so the operator surface
 * cannot leak into the public nav.
 */
export function navForViewer(viewer: { isOperator: boolean }): NavConfig {
  const includeAdmin = viewer.isOperator === true;

  const primary = NAV_CONFIG.primary.filter(
    (link: NavLink) => includeAdmin || link.adminOnly !== true,
  );

  const groups = NAV_CONFIG.groups
    .filter((group: NavGroup) => includeAdmin || group.adminOnly !== true)
    .map((group: NavGroup): NavGroup => ({
      ...group,
      links: group.links.filter(
        (link: NavLink) => includeAdmin || link.adminOnly !== true,
      ),
    }))
    .filter((group: NavGroup) => group.links.length > 0);

  return { primary, groups };
}
