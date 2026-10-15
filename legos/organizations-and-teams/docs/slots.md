# Organizations & Teams — Slots

## `org_switcher` (react-component)
Org dropdown for the app shell (renders nothing when ≤1 org). Fill with
`<OrgSwitcher orgs={orgs} currentOrgId={id} onSwitch={fn} />`.

## `members_table` (react-component)
Members management table. Fill with `<MembersTable apiBase="" orgId={id} />`.

## `after_member_joined_hook` (server-hook)
Server hook fired when a member accepts an invitation — onboarding + seat
accounting. No-op when unconfigured. Receives `{ org_id, user_id, role }`.

## Slots this lego FILLS in other legos
None.
