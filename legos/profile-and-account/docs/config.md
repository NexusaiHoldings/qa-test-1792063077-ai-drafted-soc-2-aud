# Profile & Account — Configuration

`config_schema` (manifest.yaml) controls profile completion, data export, and
stale-account detection.

## `profile`
| Key | Type | Default | Meaning |
|-----|------|---------|---------|
| `required_fields` | string[] | display_name/avatar_url/timezone | Fields counted toward the completion score. |

## `export`
| Key | Type | Default | Meaning |
|-----|------|---------|---------|
| `enabled` | boolean | `true` | Whether GDPR data export is available. |
| `format` | json\|csv | `json` | Export format. |
| `retention_days` | integer | `7` | How long an export download link stays valid. |

## `stale_account`
| Key | Type | Default | Meaning |
|-----|------|---------|---------|
| `inactive_days_threshold` | integer | `90` | Days of inactivity before detect_stale_account flags an account. |

## Agent autonomy
See `agent/policies.yaml`. All tools at `notify` except `request_account_export`
(`confirm` — the user authorizes the data export).
