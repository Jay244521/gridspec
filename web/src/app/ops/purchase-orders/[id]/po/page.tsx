import { notFound, redirect } from "next/navigation";
import { requireOpsUser } from "@/lib/ops-auth";
import { getServiceRoleClient } from "@/lib/supabase";
import PrintButton from "@/components/PrintButton";

function formatUsd(cents: number): string {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

interface JobSiteAddress {
  line1: string;
  city: string;
  state: string;
  postal_code: string;
}

async function loadPo(id: string) {
  const supabase = getServiceRoleClient();

  const { data: po } = await supabase.from("purchase_orders").select("*").eq("id", id).single();
  if (!po) return null;

  const [{ data: distributor }, { data: order }, { data: lines }] = await Promise.all([
    supabase.from("distributors").select("name, contact_email").eq("id", po.distributor_id).single(),
    supabase.from("orders").select("job_site_address, created_at").eq("id", po.order_id).single(),
    supabase
      .from("order_lines")
      .select("quantity, unit_price_cents, products(distributor_sku, manufacturer, model_name)")
      .eq("order_id", po.order_id),
  ]);

  type LineRow = {
    quantity: number;
    unit_price_cents: number;
    products: { distributor_sku: string; manufacturer: string; model_name: string } | { distributor_sku: string; manufacturer: string; model_name: string }[] | null;
  };

  const distributorLines = ((lines ?? []) as LineRow[])
    .map((l) => ({
      ...l,
      product: Array.isArray(l.products) ? l.products[0] : l.products,
    }))
    .filter((l) => l.product != null);

  return { po, distributor, order, lines: distributorLines };
}

export default async function PurchaseOrderDocument({ params }: { params: Promise<{ id: string }> }) {
  const ops = await requireOpsUser();
  if (!ops) redirect("/login");

  const { id } = await params;
  const data = await loadPo(id);
  if (!data) notFound();

  const { po, distributor, order, lines } = data;
  const address = order?.job_site_address as JobSiteAddress | undefined;

  return (
    <main className="mx-auto max-w-2xl px-8 py-10 print:px-0">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Purchase Order</h1>
          <p className="mt-1 text-sm text-neutral-500">{po.po_number}</p>
        </div>
        <PrintButton />
      </div>

      <section className="mt-8 grid grid-cols-2 gap-6 text-sm">
        <div>
          <h2 className="font-medium text-neutral-500">Bill to / Buyer</h2>
          <p className="mt-1">GridSpec, Inc.</p>
        </div>
        <div>
          <h2 className="font-medium text-neutral-500">Vendor</h2>
          <p className="mt-1">{distributor?.name}</p>
          <p className="text-neutral-500">{distributor?.contact_email}</p>
        </div>
        <div>
          <h2 className="font-medium text-neutral-500">Ship to (job site)</h2>
          {address ? (
            <p className="mt-1">
              {address.line1}
              <br />
              {address.city}, {address.state} {address.postal_code}
            </p>
          ) : (
            <p className="mt-1 text-neutral-400">No address on file</p>
          )}
        </div>
        <div>
          <h2 className="font-medium text-neutral-500">Terms</h2>
          <p className="mt-1 capitalize">{po.payout_terms.replace("_", "-")}</p>
          {po.payout_due_at && (
            <p className="text-neutral-500">
              Payout due {new Date(po.payout_due_at).toLocaleDateString()}
            </p>
          )}
        </div>
      </section>

      <section className="mt-8">
        <table className="w-full text-sm">
          <thead className="border-b border-neutral-300 text-left">
            <tr>
              <th className="py-2">SKU</th>
              <th className="py-2">Item</th>
              <th className="py-2 text-right">Qty</th>
              <th className="py-2 text-right">Unit price</th>
              <th className="py-2 text-right">Line total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {lines.map((l, i) => (
              <tr key={i}>
                <td className="py-2">{l.product!.distributor_sku}</td>
                <td className="py-2">
                  {l.product!.manufacturer} {l.product!.model_name}
                </td>
                <td className="py-2 text-right">{l.quantity}</td>
                <td className="py-2 text-right">{formatUsd(l.unit_price_cents)}</td>
                <td className="py-2 text-right">{formatUsd(l.unit_price_cents * l.quantity)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-4 flex justify-end gap-8 border-t border-neutral-300 pt-4 text-sm">
          <span className="font-medium">Total payout owed</span>
          <span className="font-semibold">{formatUsd(po.distributor_payout_cents)}</span>
        </div>
      </section>

      <p className="mt-8 text-xs text-neutral-500">
        Please ship using the enclosed blind packing slip in place of your own invoice or packing
        documentation — the job site should not see distributor identity or pricing.
      </p>
    </main>
  );
}
