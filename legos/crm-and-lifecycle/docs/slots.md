# CRM & Lifecycle — Slots

## `lead_capture_form` (react-component)
Embeddable lead-capture form for marketing pages. Fill with
`<LeadCaptureForm apiBase="" source="pricing_page" />`. Posts to
`/api/crm/leads`; the agent scores + (optionally) drafts first-touch on arrival.

## `contact_sidebar` (react-component)
Contact detail sidebar with the agent's proposed next action. Fill with
`<ContactSidebar apiBase="" contactId={id} nextAction={agentProposal} />`.

## `after_lead_captured_hook` (server-hook)
Server hook fired on new lead capture — triggers agent scoring + optional
outreach draft. No-op when unconfigured. Receives `{ contact_id, source }`.

## Slots this lego FILLS in other legos
None.
