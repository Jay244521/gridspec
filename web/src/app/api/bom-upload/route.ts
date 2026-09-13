import { NextRequest, NextResponse } from "next/server";
import Papa from "papaparse";
import ExcelJS from "exceljs";
import { getServiceRoleClient } from "@/lib/supabase";
import { getAuthedContractor, unauthorized } from "@/lib/auth";
import type { BlendedMatch, BomLineMatch, Product } from "@/lib/types";

interface RawBomLine {
  line_no: number;
  description: string;
  quantity: number;
}

/**
 * POST /api/bom-upload — multipart form with a `file` field (CSV or XLSX).
 *
 * Expects a description-like column (description/item/part) and a quantity
 * column (qty/quantity). Each line is matched against the catalog by naive
 * token overlap against manufacturer/model_name — this is a heuristic first
 * pass, not exact SKU resolution; low-confidence lines come back unmatched
 * for the contractor to resolve manually.
 *
 * Gated behind auth, same as /api/search — instant BOM quoting is a paid
 * SaaS feature, not a public catalog scrape.
 */
export async function POST(req: NextRequest) {
  const contractor = await getAuthedContractor();
  if (!contractor) return unauthorized();

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing `file` in form data" }, { status: 400 });
  }

  let rows: Record<string, string>[];
  try {
    rows = file.name.toLowerCase().endsWith(".csv")
      ? await parseCsv(file)
      : await parseXlsx(file);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to parse file" },
      { status: 400 },
    );
  }

  const bomLines = extractBomLines(rows);
  if (bomLines.length === 0) {
    return NextResponse.json(
      { error: "Could not find description/quantity columns in the uploaded file" },
      { status: 400 },
    );
  }

  const supabase = getServiceRoleClient();
  const { data: catalog, error } = await supabase
    .from("products")
    .select("*")
    .eq("is_active", true)
    .returns<Product[]>();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const matches: BomLineMatch[] = bomLines.map((line) => ({
    line_no: line.line_no,
    raw_description: line.description,
    quantity: line.quantity,
    match: bestMatch(line.description, catalog ?? []),
  }));

  return NextResponse.json({ lines: matches });
}

async function parseCsv(file: File): Promise<Record<string, string>[]> {
  const text = await file.text();
  const parsed = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true });
  return parsed.data;
}

async function parseXlsx(file: File): Promise<Record<string, string>[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());
  const sheet = workbook.worksheets[0];
  if (!sheet) return [];

  const headerRow = sheet.getRow(1).values as (string | undefined)[];
  const headers = headerRow.slice(1).map((h) => (h ?? "").toString());

  const rows: Record<string, string>[] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const values = row.values as (string | number | undefined)[];
    const record: Record<string, string> = {};
    headers.forEach((header, i) => {
      record[header] = (values[i + 1] ?? "").toString();
    });
    rows.push(record);
  });
  return rows;
}

const DESCRIPTION_HEADERS = ["description", "desc", "item", "part", "part description"];
const QUANTITY_HEADERS = ["qty", "quantity", "count"];

function extractBomLines(rows: Record<string, string>[]): RawBomLine[] {
  if (rows.length === 0) return [];

  const headers = Object.keys(rows[0]);
  const descHeader = headers.find((h) => DESCRIPTION_HEADERS.includes(h.trim().toLowerCase()));
  const qtyHeader = headers.find((h) => QUANTITY_HEADERS.includes(h.trim().toLowerCase()));
  if (!descHeader || !qtyHeader) return [];

  return rows
    .map((row, i) => ({
      line_no: i + 1,
      description: (row[descHeader] ?? "").trim(),
      quantity: parseInt(row[qtyHeader] ?? "0", 10) || 0,
    }))
    .filter((line) => line.description && line.quantity > 0);
}

function bestMatch(description: string, catalog: Product[]): BlendedMatch | null {
  const tokens = description.toLowerCase().split(/\W+/).filter((t) => t.length > 1);
  if (tokens.length === 0) return null;

  let bestProduct: Product | null = null;
  let bestScore = 0;

  for (const product of catalog) {
    const haystack = `${product.manufacturer} ${product.model_name}`.toLowerCase();
    const score = tokens.filter((t) => haystack.includes(t)).length;
    if (score > bestScore) {
      bestScore = score;
      bestProduct = product;
    }
  }

  // Require at least two matching tokens to avoid noisy single-word matches.
  if (!bestProduct || bestScore < 2) return null;

  const offers = catalog.filter((p) => p.canonical_key === bestProduct!.canonical_key);
  const inStock = offers.filter((o) => o.stock_qty > 0);
  const pool = inStock.length > 0 ? inStock : offers;
  const best = pool.reduce((a, b) => (b.unit_price_cents < a.unit_price_cents ? b : a));

  return {
    canonical_key: best.canonical_key,
    manufacturer: best.manufacturer,
    model_name: best.model_name,
    best_unit_price_cents: best.unit_price_cents,
    total_stock_qty: offers.reduce((sum, o) => sum + o.stock_qty, 0),
    offer_count: offers.length,
    representative_product: best,
  };
}
