# CRM & Lifecycle — Configuration

`config_schema` (manifest.yaml) controls the pipeline, outreach approval, and
lead scoring.

## `pipeline`
| Key | Type | Default | Meaning |
|-----|------|---------|---------|
| `stages` | string[] | new/contacted/qualified/proposal/won/lost | Ordered pipeline stages. |
| `auto_advance` | boolean | `false` | Whether the agent may advance stage without approval (default: no — advance_contact_stage is confirm-gated). |

## `outreach`
| Key | Type | Default | Meaning |
|-----|------|---------|---------|
| `require_approval` | boolean | `true` | Agent-drafted outreach must be approved before sending. |
| `daily_send_cap` | integer | `50` | Max agent-initiated sends/day (0 = unlimited). |

## `scoring`
| Key | Type | Default | Meaning |
|-----|------|---------|---------|
| `hot_lead_threshold` | number 0–100 | `70` | score_lead value above which a lead is flagged hot. |

## Agent autonomy
See `agent/policies.yaml`. All tools at `notify` except `advance_contact_stage`
(`confirm` — salesperson approves pipeline moves).
