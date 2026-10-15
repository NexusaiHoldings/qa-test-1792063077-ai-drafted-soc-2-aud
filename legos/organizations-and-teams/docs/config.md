# Organizations & Teams — Configuration

`config_schema` (manifest.yaml) controls roles, seats, and invitations.

## `roles`
Ordered RBAC roles (most-privileged first). Default: owner/admin/member/viewer.

## `seats`
| Key | Type | Default | Meaning |
|-----|------|---------|---------|
| `default_limit` | integer | `5` | Default seat limit for a new org (0 = unlimited). |
| `enforce` | boolean | `true` | Block invitations beyond the seat limit. |

## `invitations`
| Key | Type | Default | Meaning |
|-----|------|---------|---------|
| `expiry_days` | integer | `14` | Invitation token validity. |

## Agent autonomy
See `agent/policies.yaml`. All tools at `notify` except `change_member_role`
(`confirm` — an org admin approves access-control changes).
