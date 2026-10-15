"use client";
/* Checkout form — POSTs to /api/billing/checkout, redirects to Stripe.

Uses lego config's tier_ladder. Calls slot `checkout_extra_fields` for
customization. Renders one button per tier; clicking starts checkout.
*/
import React, { useState } from "react";

export interface CheckoutFormProps {
  tiers: Array<{ name: string; amount: number; interval: "month" | "year"; price_id: string }>;
  defaultCurrency?: string;
  successUrl: string;
  cancelUrl: string;
  userEmail: string;
  /** Slot — extra form fields injected ABOVE the tier-select. */
  slotCheckoutExtraFields?: React.ReactNode;
}

export function CheckoutForm({
  tiers,
  defaultCurrency = "usd",
  successUrl,
  cancelUrl,
  userEmail,
  slotCheckoutExtraFields,
}: CheckoutFormProps) {
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const symbol = defaultCurrency === "usd" ? "$" : defaultCurrency.toUpperCase() + " ";

  async function startCheckout(tierName: string) {
    setLoading(tierName);
    setError(null);
    try {
      const resp = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier_name: tierName, success_url: successUrl, cancel_url: cancelUrl, user_email: userEmail }),
      });
      if (!resp.ok) {
        setError(`Checkout failed: ${await resp.text()}`);
        setLoading(null);
        return;
      }
      const { url } = await resp.json();
      window.location.href = url;
    } catch (exc) {
      setError(`Network error: ${(exc as Error).message}`);
      setLoading(null);
    }
  }

  return (
    <div className="checkout-form">
      {slotCheckoutExtraFields}
      {error && <div role="alert" className="checkout-error">{error}</div>}
      <div className="tier-grid">
        {tiers.map((tier) => (
          <div key={tier.name} className="tier-card">
            <h3>{tier.name}</h3>
            <div className="tier-price">
              {symbol}{(tier.amount / 100).toFixed(0)} <span>/ {tier.interval}</span>
            </div>
            <button
              type="button"
              onClick={() => startCheckout(tier.name)}
              disabled={loading !== null}
              aria-label={`Subscribe to ${tier.name}`}
            >
              {loading === tier.name ? "Redirecting..." : `Choose ${tier.name}`}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
