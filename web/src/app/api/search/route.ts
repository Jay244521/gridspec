import { NextRequest, NextResponse } from "next/server";
import { getServiceRoleClient } from "@/lib/supabase";
import { getAuthedContractor, unauthorized } from "@/lib/auth";
import type { BlendedMatch, Product } from "@/lib/types";

/**
 * GET /api/search?category=battery_pack&manufacturer=EcoVolt&specs={"chemistry":"LiFePO4"}
 *
 * Filters products by category/manufacturer and by exact JSONB spec match
 * (via the `specs` param, matched with a `@>` containment query against
 * idx_products_specs_gin for sub-second lookups). Results are blended across
 * distributors by canonical_key so the client only ever sees a single
 * best-landed-cost row per product — never a per-distributor bidding view.
 *
 * Gated behind auth: "priority search access" is part of the paid SaaS tier,
 * not a public feature.
 */
export async function GET(req: NextRequest) {
  const contractor = await getAuthedContractor();
  if (!contractor) return unauthorized();

  const { searchParams } = new URL(req.url);
  const category = searchParams.get("category");
  const manufacturer = searchParams.get("manufacturer");
  const specsParam = searchParams.get("specs");

  let specsFilter: Record<string, unknown> | null = null;
  if (specsParam) {
    try {
      specsFilter = JSON.parse(specsParam);
    } catch {
      return NextResponse.json({ error: "specs must be valid JSON" }, { status: 400 });
    }
  }

  const supabase = getServiceRoleClient();
  let query = supabase.from("products").select("*").eq("is_active", true);

  if (category) query = query.eq("category", category);
  if (manufacturer) query = query.ilike("manufacturer", manufacturer);
  if (specsFilter) query = query.contains("specs", specsFilter);

  const { data, error } = await query.limit(500);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const products = (data ?? []) as Product[];
  const results = blendByCanonicalKey(products);

  return NextResponse.json({ results });
}

function blendByCanonicalKey(products: Product[]): BlendedMatch[] {
  const groups = new Map<string, Product[]>();
  for (const product of products) {
    const group = groups.get(product.canonical_key) ?? [];
    group.push(product);
    groups.set(product.canonical_key, group);
  }

  const blended: BlendedMatch[] = [];
  for (const [canonicalKey, offers] of groups) {
    const inStock = offers.filter((o) => o.stock_qty > 0);
    const pool = inStock.length > 0 ? inStock : offers;
    const best = pool.reduce((a, b) => (b.unit_price_cents < a.unit_price_cents ? b : a));

    blended.push({
      canonical_key: canonicalKey,
      manufacturer: best.manufacturer,
      model_name: best.model_name,
      best_unit_price_cents: best.unit_price_cents,
      total_stock_qty: offers.reduce((sum, o) => sum + o.stock_qty, 0),
      offer_count: offers.length,
      representative_product: best,
    });
  }

  return blended.sort((a, b) => a.best_unit_price_cents - b.best_unit_price_cents);
}
