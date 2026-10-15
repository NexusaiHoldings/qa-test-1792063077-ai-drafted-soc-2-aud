# Config Reference — identity-and-access

## `providers` (required, string[])
Auth providers to enable. Only `"email"` is supported in v0.1. OAuth lands in 2.3.

## `password_policy` (required, object)
| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `min_length` | int | 8 | Minimum character count |
| `require_uppercase` | bool | false | Require A–Z |
| `require_digit` | bool | false | Require 0–9 |
| `require_special` | bool | false | Require non-alphanumeric |

## `mfa` (optional, object)
Config accepted by schema; no effect until 2.2 wires TOTP.
`enabled: bool` · `enforcement: optional | required_for_admin | required_for_all`

## Full example
```yaml
identity-and-access:
  providers: [email]
  password_policy:
    min_length: 10
    require_uppercase: true
    require_digit: true
  mfa:
    enabled: false
    enforcement: optional
```
