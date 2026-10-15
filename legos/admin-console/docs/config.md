# Admin Console Config Reference

All three keys are required at install time.

## `default_permissions` (array of strings)

Roles that have access to the admin console. Sections also declare their own
`permissions`; the shell hides sections the user lacks access to.

```json
["admin", "owner"]
```

## `enable_impersonation` (boolean, default: `false`)

Show the "Impersonate user" button in the admin shell top bar.
In v0.1.0 the button shows an informational alert; actual session-switching
is deferred to the security-review sprint. Set `false` to hide the button.

## `enable_feature_flags` (boolean, default: `true`)

Enable the Feature Flags admin section. When `false`, `/admin/flags` returns 404
and the sidebar entry is hidden.

## Full example

```yaml
config:
  default_permissions: [admin, owner]
  enable_impersonation: false
  enable_feature_flags: true
```
