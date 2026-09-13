import { NextRequest, NextResponse } from "next/server";
import { getServiceRoleClient } from "@/lib/supabase";
import { getStripeClient, computePlatformFeeCents } from "@/lib/stripe";
import { getAuthedContractor, unauthorized } from "@/lib/auth";
import type { Product } from "@/lib/types";

interface CheckoutLineInput {
  product_id: string;
  quantity: number;
}

interface CheckoutRequestBody {
  bom_id?: string;
  job_site_address: {
    line1: string;
    city: string;
    state: string;
    postal_code: string;
  };
  lines: CheckoutLineInput[];
}

/**
 * POST /api/checkout
 *
 * Creates a pending order priced entirely from server-side catalog data
 * (never trusts client-submitted prices) and opens a Stripe PaymentIntent
 * for the full contractor-facing total (subtotal + platform fee). GridSpec
 * is the merchant of record here — distributors are paid out separately on
 * Net-30/60 terms once the order lands, so no Stripe Connect transfer_data
 * happens on this charge. Purchase orders are only generated after payment
 * actually succeeds (see /api/webhooks/stripe), not at checkout time.
 *
 * contractor_id is derived from the session, never from the request body —
 * otherwise any caller could place orders (and see order history) under an
 * arbitrary contractor_id.
 */
export async function POST(req: NextRequest) {
  const contractor = await getAuthedContractor();
  if (!contractor) return unauthorized();

  const body: CheckoutRequestBody = await req.json();

  if (!body.job_site_address || !body.lines?.length) {
    return NextResponse.json(
      { error: "job_site_address and at least one line are required" },
      { status: 400 },
    );
  }

  const supabase = getServiceRoleClient();

  if (body.bom_id) {
    const { data: bom } = await supabase
      .from("boms")
      .select("id")
      .eq("id", body.bom_id)
      .eq("contractor_id", contractor.contractorId)
      .single();
    if (!bom) {
      return NextResponse.json({ error: "bom_id does not belong to this contractor" }, { status: 403 });
    }
  }

  const productIds = body.lines.map((l) => l.product_id);

  const { data: products, error: productsError } = await supabase
    .from("products")
    .select("*")
    .in("id", productIds)
    .eq("is_active", true)
    .returns<Product[]>();

  if (productsError) {
    return NextResponse.json({ error: productsError.message }, { status: 500 });
  }

  const productsById = new Map((products ?? []).map((p) => [p.id, p]));
  const missing = productIds.filter((id) => !productsById.has(id));
  if (missing.length > 0) {
    return NextResponse.json({ error: `Unknown or inactive product ids: ${missing.join(", ")}` }, { status: 400 });
  }

  const priced = body.lines.map((line) => {
    const product = productsById.get(line.product_id)!;
    return { product, quantity: line.quantity, unit_price_cents: product.unit_price_cents };
  });

  const subtotalCents = priced.reduce((sum, l) => sum + l.unit_price_cents * l.quantity, 0);
  const platformFeeCents = computePlatformFeeCents(subtotalCents);
  const totalChargedCents = subtotalCents + platformFeeCents;

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .insert({
      contractor_id: contractor.contractorId,
      bom_id: body.bom_id ?? null,
      status: "pending",
      subtotal_cents: subtotalCents,
      platform_fee_cents: platformFeeCents,
      total_charged_cents: totalChargedCents,
      job_site_address: body.job_site_address,
    })
    .select()
    .single();

  if (orderError || !order) {
    return NextResponse.json({ error: orderError?.message ?? "Failed to create order" }, { status: 500 });
  }

  const { error: linesError } = await supabase.from("order_lines").insert(
    priced.map((l) => ({
      order_id: order.id,
      product_id: l.product.id,
      quantity: l.quantity,
      unit_price_cents: l.unit_price_cents,
    })),
  );

  if (linesError) {
    return NextResponse.json({ error: linesError.message }, { status: 500 });
  }

  const stripe = getStripeClient();
  const paymentIntent = await stripe.paymentIntents.create({
    amount: totalChargedCents,
    currency: "usd",
    metadata: { order_id: order.id },
    payment_method_types: ["card", "us_bank_account"],
  });

  await supabase
    .from("orders")
    .update({ stripe_payment_intent_id: paymentIntent.id })
    .eq("id", order.id);

  return NextResponse.json({
    order_id: order.id,
    client_secret: paymentIntent.client_secret,
    subtotal_cents: subtotalCents,
    platform_fee_cents: platformFeeCents,
    total_charged_cents: totalChargedCents,
  });
}
