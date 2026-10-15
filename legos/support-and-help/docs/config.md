# Support & Help — Configuration

The `config_schema` in `manifest.yaml` controls AI deflection, escalation, and
KB visibility. The substrate's `legos.config.ts` generator surfaces these; the
company's activation config supplies values.

## `deflection`

| Key | Type | Default | Meaning |
|-----|------|---------|---------|
| `enabled` | boolean | `true` | Whether the agent attempts a KB-grounded answer before opening a ticket. |
| `min_kb_confidence` | number 0–1 | `0.7` | Minimum `suggest_kb_article` top relevance before the agent auto-deflects (answers from the KB) instead of opening a ticket. |

## `escalation`

| Key | Type | Default | Meaning |
|-----|------|---------|---------|
| `auto_escalate_priorities` | string[] | `[high, urgent]` | Priorities the agent never auto-resolves — always `escalate_to_human`. |
| `escalation_channel` | string | — | Where escalations land (Slack channel / email alias). Substrate-resolved. |

## `kb`

| Key | Type | Default | Meaning |
|-----|------|---------|---------|
| `public` | boolean | `true` | Whether the KB index is publicly browsable (vs auth-gated). |

## Agent autonomy

Tool autonomy floors live in `agent/policies.yaml`. By default every tool is at
the `notify` floor except `escalate_to_human`, which is `confirm` (operator
approves the hand-off). The chairman can elevate floors post-merge.
