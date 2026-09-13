import { notFound, redirect } from "next/navigation";
import { getServiceRoleClient } from "@/lib/supabase";
import { getAuthedContractor } from "@/lib/auth";
import type { Product } from "@/lib/types";

function formatUsd(cents: number): string {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

async function getProductWithOffers(id: string) {
  const supabase = getServiceRoleClient();

  const { data: product } = await supabase
    .from("products")
    .select("*")
    .eq("id", id)
    .single<Product>();

  if (!product) return null;

  const { data: offers } = await supabase
    .from("products")
    .select("*")
    .eq("canonical_key", product.canonical_key)
    .eq("is_active", true)
    .order("unit_price_cents", { ascending: true })
    .returns<Product[]>();

  return { product, offers: offers ?? [product] };
}

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const contractor = await getAuthedContractor();
  if (!contractor) redirect("/login");

  const { id } = await params;
  const data = await getProductWithOffers(id);
  if (!data) notFound();

  const { product, offers } = data;
  const totalStock = offers.reduce((sum, o) => sum + o.stock_qty, 0);
  const bestPrice = offers[0]?.unit_price_cents ?? product.unit_price_cents;

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <p className="text-sm uppercase tracking-wide text-neutral-500">{product.category.replace("_", " ")}</p>
      <h1 className="mt-1 text-2xl font-semibold">{product.manufacturer} {product.model_name}</h1>
      <p className="mt-2 text-3xl font-bold">{formatUsd(bestPrice)}</p>
      <p className="mt-1 text-sm text-neutral-500">
        {offers.length} distributor{offers.length > 1 ? "s" : ""} · {totalStock} units in stock (blended landed cost shown)
      </p>

      {product.description && <p className="mt-6 text-neutral-700">{product.description}</p>}

      <section className="mt-8">
        <h2 className="text-lg font-medium">Specifications</h2>
        <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
          {Object.entries(product.specs ?? {}).map(([key, value]) => (
            <div key={key} className="contents">
              <dt className="text-neutral-500">{key.replace(/_/g, " ")}</dt>
              <dd>{Array.isArray(value) ? value.join(", ") : String(value)}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-medium">Technical Vault</h2>
        <ul className="mt-3 space-y-1 text-sm">
          {product.cad_step_url && (
            <li><a className="text-blue-600 hover:underline" href={product.cad_step_url}>Download .STEP CAD file</a></li>
          )}
          {product.schematic_url && (
            <li><a className="text-blue-600 hover:underline" href={product.schematic_url}>Wiring schematic</a></li>
          )}
          {product.datasheet_url && (
            <li><a className="text-blue-600 hover:underline" href={product.datasheet_url}>Manufacturer datasheet</a></li>
          )}
          {!product.cad_step_url && !product.schematic_url && !product.datasheet_url && (
            <li className="text-neutral-400">No technical documents uploaded yet for this SKU.</li>
          )}
        </ul>
      </section>

      <button className="mt-10 rounded bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white">
        Add to BOM
      </button>
    </main>
  );
}
