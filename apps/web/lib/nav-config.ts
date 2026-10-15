/**
 * Top Navigation Configuration — substrate-topnav-001 (2026-05-24).
 *
 * Substrate ships with one nav entry (Home). Each portfolio company's
 * coding pipeline extends this file via F1-001 (per CTO mvp_scope —
 * cto-prompt-nav-requirement-001) to add links to the company's
 * specific feature pages.
 *
 * The substrate's TopNav component reads PRIMARY_NAV_LINKS and renders
 * them in the order declared.
 *
 * Convention:
 *   - Always keep Home as the first entry.
 *   - Group related pages with NavGroup (admin, account, etc.).
 *   - Use relative paths (Next.js route group parens collapse out of
 *     the URL — e.g. apps/web/app/(domain)/configure/page.tsx serves
 *     at /configure).
 *   - Server-only data; no client JS bundled from this file.
 */

export type NavLink = {
  /** URL path (without route-group parens). */
  href: string;
  /** Visible label. */
  label: string;
  /** Operator/admin route — TopNav shows it only to admins. */
  adminOnly?: boolean;
};

export type NavGroup = {
  /** Group label (e.g. "Account", "Admin"). */
  label: string;
  /** Child links shown inline (flat) inside the group. */
  links: NavLink[];
};

export type NavConfig = {
  primary: NavLink[];
  groups: NavGroup[];
};

/**
 * Default substrate configuration: just Home. Agents extending this
 * file should preserve Home as the first entry and append the
 * company-specific paths AFTER it.
 *
 * Example extension by F1-001:
 *   primary: [
 *     { href: "/", label: "Home" },
 *     { href: "/configure", label: "Configure" },
 *     { href: "/shop", label: "Shop" },
 *   ],
 *   groups: [
 *     { label: "Account", links: [
 *       { href: "/account/tier", label: "Tier" },
 *       { href: "/account/reorders", label: "Reorders" },
 *     ]},
 *   ],
 */
export const NAV_CONFIG: NavConfig = {
  primary: [
    { href: "/", label: "Home" },
  ],
  groups: [],
};
