/**
 * Stripe API helper — minimal form-encoded POST, no third-party stripe SDK.
 *
 * Why form-encoded: Stripe's API is form, NOT JSON (known footgun).
 * Why no SDK: minimizes dependencies + matches Python implementation.
 */

const STRIPE_API = "https://api.stripe.com/v1";

export interface StripeResponse {
  readonly status: number;
  readonly body: Record<string, unknown>;
}

function stripeApiVersion(): string {
  return process.env.STRIPE_API_VERSION || "2024-06-20";
}

/**
 * Flatten a nested object into form-encoded keys (Stripe's convention).
 * Example: {line_items: [{price: "x", quantity: 1}]}
 *   → line_items[0][price]=x&line_items[0][quantity]=1
 */
export function flattenForm(
  obj: Record<string, unknown>,
  prefix = "",
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}[${key}]` : key;
    if (value === null || value === undefined) continue;
    if (Array.isArray(value)) {
      value.forEach((item, i) => {
        const itemKey = `${fullKey}[${i}]`;
        if (typeof item === "object" && item !== null) {
          Object.assign(out, flattenForm(item as Record<string, unknown>, itemKey));
        } else {
          out[itemKey] = String(item);
        }
      });
    } else if (typeof value === "object") {
      Object.assign(out, flattenForm(value as Record<string, unknown>, fullKey));
    } else {
      out[fullKey] = String(value);
    }
  }
  return out;
}

export async function stripePost(
  endpoint: string,
  formData: Record<string, unknown>,
  secretKey: string,
): Promise<StripeResponse> {
  const flat = flattenForm(formData);
  const body = new URLSearchParams(flat).toString();
  const resp = await fetch(`${STRIPE_API}/${endpoint}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "Stripe-Version": stripeApiVersion(),
    },
    body,
    signal: AbortSignal.timeout(15_000),
  });
  return { status: resp.status, body: (await resp.json()) as Record<string, unknown> };
}

export async function stripeGet(
  endpoint: string,
  secretKey: string,
): Promise<StripeResponse> {
  const resp = await fetch(`${STRIPE_API}/${endpoint}`, {
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Stripe-Version": stripeApiVersion(),
    },
    signal: AbortSignal.timeout(15_000),
  });
  return { status: resp.status, body: (await resp.json()) as Record<string, unknown> };
}
