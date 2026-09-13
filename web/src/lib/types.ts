export type ProductSpecs = Record<string, string | number | boolean | string[]>;

export interface Product {
  id: string;
  distributor_id: string;
  distributor_sku: string;
  canonical_key: string;
  manufacturer: string;
  model_name: string;
  category: string;
  description: string | null;
  specs: ProductSpecs;
  unit_price_cents: number;
  currency: string;
  stock_qty: number;
  lead_time_days: number | null;
  cad_step_url: string | null;
  schematic_url: string | null;
  datasheet_url: string | null;
}

/** One canonical_key's worth of equivalent SKUs, blended into a single
 *  landed-cost figure for display — never a distributor-by-distributor
 *  leaderboard (see Anti-Disintermediation Mechanics). */
export interface BlendedMatch {
  canonical_key: string;
  manufacturer: string;
  model_name: string;
  best_unit_price_cents: number;
  total_stock_qty: number;
  offer_count: number;
  representative_product: Product;
}

export interface BomLineMatch {
  line_no: number;
  raw_description: string;
  quantity: number;
  match: BlendedMatch | null;
}
