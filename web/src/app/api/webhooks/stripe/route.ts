import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getServiceRoleClient } from "@/lib/supabase";
import { getStripeClient, payoutDueDate } from "@/lib/stripe";

/**
 * POST /api/webhooks/stripe
 *
 * On payment_intent.succeeded: marks the order paid and performs Automated
 * PO Dispatch — fans the order's lines out into one purchase_order per
 * distributor (split fulfillment) with a blind packing slip, then leaves
 * distributor payout on Net-30 terms per the working-capital-float model.
 * PO generation only happens here, never at checkout time, so an abandoned
 * or failed payment never reaches a distributor.
 */
export async function POST(req: NextRequest) {
  const signature = req.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!signature || !webhookSecret) {
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
  }

  const rawBody = await req.text();
  const stripe = getStripeClient();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    return NextResponse.json(
      { error: `Invalid signature: ${err instanceof Error ? err.message : "unknown"}` },
      { status: 400 },
    );
  }

  if (event.type === "payment_intent.succeeded") {
    const paymentIntent = event.data.object as Stripe.PaymentIntent;
    await dispatchPurchaseOrders(paymentIntent.id);
  }

  return NextResponse.json({ received: true });
}

async function dispatchPurchaseOrders(paymentIntentId: string) {
  const supabase = getServiceRoleClient();

  const { data: order } = await supabase
    .from("orders")
    .select("*")
    .eq("stripe_payment_intent_id", paymentIntentId)
    .single();
  if (!order || order.status !== "pending") return; // already processed or unknown

  await supabase.from("orders").update({ status: "paid" }).eq("id", order.id);

  const { data: lines } = await supabase
    .from("order_lines")
    .select("quantity, unit_price_cents, products(distributor_id)")
    .eq("order_id", order.id);

  type LineWithDistributor = {
    quantity: number;
    unit_price_cents: number;
    products: { distributor_id: string } | { distributor_id: string }[] | null;
  };

  const payoutByDistributor = new Map<string, number>();
  for (const line of (lines ?? []) as LineWithDistributor[]) {
    const productRel = Array.isArray(line.products) ? line.products[0] : line.products;
    const distributorId = productRel?.distributor_id;
    if (!distributorId) continue;
    const lineTotal = line.unit_price_cents * line.quantity;
    payoutByDistributor.set(distributorId, (payoutByDistributor.get(distributorId) ?? 0) + lineTotal);
  }

  const purchaseOrders = Array.from(payoutByDistributor.entries()).map(([distributorId, payoutCents], i) => ({
    order_id: order.id,
    distributor_id: distributorId,
    po_number: `PO-${order.id.slice(0, 8).toUpperCase()}-${i + 1}`,
    status: "dispatched" as const,
    distributor_payout_cents: payoutCents,
    payout_terms: "net_30" as const,
    payout_due_at: payoutDueDate("net_30").toISOString(),
    packing_slip_blind: true,
  }));

  if (purchaseOrders.length > 0) {
    await supabase.from("purchase_orders").insert(purchaseOrders);
  }
}
