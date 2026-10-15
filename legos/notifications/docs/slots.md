# Notifications — Slot Reference

## `email_layout_header` (react-component)
HTML rendered above every transactional email body. Use for logos, brand banners, navigation.

## `email_layout_footer` (react-component)
HTML rendered below every transactional email body. Use for legal footer, unsubscribe link, contact info.

## `in_app_inbox_extra_actions` (react-component)
Per-row buttons in the in-app inbox. Receives `(item)` callback with the inbox item.

## Composition example
```tsx
import { InAppInbox } from "@nexus/notifications";
<InAppInbox slotInAppInboxExtraActions={(item) => <button>Pin</button>} />
```
