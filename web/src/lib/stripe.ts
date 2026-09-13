import Stripe from "stripe";

/** Platform fee on forwarded orders — 3-5% per the current revenue model; kept at the low
 *  end while validating whether contractors accept it over calling distributors direct. */
export const PLATFORM_FEE_PCT = 0.04;

export function getStripeClient(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY not configured");
  return new Stripe(key);
}

export function computePlatformFeeCents(subtotalCents: number): number {
  return Math.round(subtotalCents * PLATFORM_FEE_PCT);
}

export function payoutDueDate(terms: "net_30" | "net_60", from: Date = new Date()): Date {
  const days = terms === "net_60" ? 60 : 30;
  const due = new Date(from);
  due.setDate(due.getDate() + days);
  return due;
}
