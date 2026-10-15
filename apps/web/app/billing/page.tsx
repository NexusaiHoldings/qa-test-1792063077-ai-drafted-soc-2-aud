import type { JSX } from "react";
import { CheckoutForm } from "@nexus/billing-and-subscriptions/ui/CheckoutForm";
import { SubscriptionCard } from "@nexus/billing-and-subscriptions/ui/SubscriptionCard";
import { UsageWidget } from "@nexus/billing-and-subscriptions/ui/UsageWidget";
import { getSessionUser } from "@/lib/admin-auth";
import { getLegoConfig } from "@/lib/lego-config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Tier = { name: string; amount: number; interval: "month" | "year"; price_id: string };

export default async function BillingPage(): Promise<JSX.Element> {
  const user = await getSessionUser();
  const cfg = getLegoConfig("billing-and-subscriptions");
  const tiers = (cfg.tier_ladder as Tier[] | undefined) ?? [];
  const defaultCurrency = (cfg.default_currency as string | undefined) ?? "usd";

  return (
    <main className="mx-auto max-w-3xl space-y-8 px-4 py-8">
      <h1 className="text-2xl font-semibold text-gray-900">Billing</h1>
      <SubscriptionCard portalReturnUrl="/billing" />
      <UsageWidget />
      {tiers.length > 0 ? (
        <section>
          <h2 className="mb-3 text-lg font-medium text-gray-900">Plans</h2>
          <CheckoutForm
            tiers={tiers}
            defaultCurrency={defaultCurrency}
            successUrl="/billing?status=success"
            cancelUrl="/billing"
            userEmail={user?.email ?? ""}
          />
        </section>
      ) : (
        <p className="text-sm text-gray-500">No plans are configured yet.</p>
      )}
    </main>
  );
}
