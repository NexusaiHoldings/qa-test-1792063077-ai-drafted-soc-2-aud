# 0001 — Organizations & Teams lego

## Context
organizations-and-teams was a 16-LOC stub. Per §11 #3 it's the multi-tenancy
pillar. Built last in the crm→profile→orgs value order.

## Decision
1. **Self-contained tenancy model.** organizations / org_members / org_invitations
   / org_audit_log. depends_on: [identity-and-access (users), notifications
   (invite emails)].
2. **Four read-only agent tools + one confirm mutation.** recommend_role_for_member
   / detect_unused_seats / summarize_org_activity / flag_permission_anomaly are
   read-only; change_member_role is the genuine access-control mutation (confirm).
3. **Last-owner protection.** handleChangeRole refuses to demote the last owner
   (409) — a structural guard independent of the agent.
4. **Seat enforcement at invite time.** handleInviteMember counts members +
   pending invitations against seat_limit when config.seats.enforce is true.

## Consequences
- Every portfolio company ships multi-tenant orgs: create org, invite/accept,
  RBAC, seat limits, an audit log, and an agent that recommends roles + flags
  permission anomalies + spots unused seats.
- change_member_role's runtime→company-app execution rides the cross-boundary
  mutation bridge. The 4 read-only tools are fully live.
