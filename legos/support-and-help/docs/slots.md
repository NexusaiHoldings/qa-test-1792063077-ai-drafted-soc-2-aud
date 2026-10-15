# Support & Help — Slots

Slots are extension points the substrate (or other legos) fill. Declared in
`manifest.yaml`.

## `support_widget_launcher` (react-component)

A floating launcher injected into the substrate app shell. Renders the
`SupportWidget` (KB search → AI deflection, new-ticket form, confirmation).
Fill with `<SupportWidget apiBase="" userId={currentUserId} />`.

## `help_center_link` (react-component)

A nav/footer link to the company's help-center / KB index. Should render
nothing when the company has no published KB articles (check
`GET /api/support/kb` count).

## `after_ticket_resolved_hook` (server-hook)

A server hook executed when a ticket transitions to `resolved`. Intended to
trigger a CSAT feedback request through the notifications lego. No-op when
unconfigured. Receives `{ ticket_id, user_id }`.

## Slots this lego FILLS in other legos

None currently. (Identity's `signup_legal_acknowledgment` is filled by
legal-and-compliance; support-and-help is a leaf consumer of identity +
notifications.)
