# Profile & Account — Slots

## `profile_settings_panel` (react-component)
Profile editor. Fill with `<ProfileSettingsPanel apiBase="" userId={id} />`.

## `connected_accounts_panel` (react-component)
Connected providers list with connect/disconnect. (UI ships ProfileSettingsPanel
+ AccountExportButton in v1; a dedicated connected-accounts panel can extend.)

## `account_export_button` (react-component)
GDPR "download my data". Fill with `<AccountExportButton apiBase="" userId={id} />`.

## Slots this lego FILLS in other legos
None.
