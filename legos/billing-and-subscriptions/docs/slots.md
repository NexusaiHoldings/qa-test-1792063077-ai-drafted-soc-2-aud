# Billing & Subscriptions — Slot Reference

Per spec §4.5, this lego exposes 3 slots for portfolio-company customization without forking.

## `checkout_extra_fields` (react-component)

Injected into the checkout flow above the "Subscribe" button. Use for promo codes, referral attribution, custom metadata.

```tsx
import { CheckoutForm } from "@nexus/billing-and-subscriptions";
import { PromoCodeInput } from "./company-extensions";

<CheckoutForm slot_checkout_extra_fields={<PromoCodeInput onChange={setPromoCode} />} />
```

## `post_subscription_redirect` (server-hook)

Runs server-side after successful subscription creation. Use for onboarding redirects, analytics fires, internal notifications.

Signature: `(user_id: string, subscription: Subscription) => Promise<{ redirect_url?: string }>`. Return `redirect_url` to override the default.

## `subscription_extra_metadata` (react-component)

Injected into the customer-portal subscription detail view. Use for company-specific metadata fields surfaced to the user (e.g., team-size selector for a per-seat plan).
