# Organizations & Teams — Agent Skills

Each H2 corresponds to a tool in tools.yaml.

## recommend_role_for_member
Recommend the least-privilege RBAC role for a member from activity + the org's
role distribution. Read-only. **Output:** `{ recommended_role, rationale }`

## detect_unused_seats
Identify inactive members (seat-reclamation candidates) + a reclaimable count.
Read-only. **Output:** `{ unused_seats[], reclaimable }`

## summarize_org_activity
Summarize the audit log into an admin brief + items to review. Read-only.
**Output:** `{ summary, items_to_review[] }`

## flag_permission_anomaly
Detect RBAC anomalies (too many owners, viewer doing admin actions, dormant
admins) + risk level. Read-only. **Output:** `{ anomalies[], risk_level }`

## change_member_role
Change a member's role. GENUINE access-control MUTATION — gated behind
**confirm** (an org admin approves). Writes the role + an audit entry. Never
silently grant/revoke privileges. **Output:** `{ org_id, user_id, role }`
