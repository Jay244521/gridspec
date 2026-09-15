import { notFound, redirect } from "next/navigation";
import { requireOpsUser } from "@/lib/ops-auth";
import { getServiceRoleClient } from "@/lib/supabase";
import PrintButton from "@/components/PrintButton";

interface JobSiteAddress {
  line1: string;
  city: string;
  state: string;
  postal_code: string;
}

async function loadPackingSlip(id: string) {
  const supabase = getServiceRoleClient();

  const { data: po } = await supabase.from("purchase_orders").select("po_number, order_id, distributor_id").eq("id", id).single();
  if (!po) return null;

  const [{ data: order }, { data: lines }] = await Promise.all([
    supabase.from("orders").select("job_site_address, created_at").eq("id", po.order_id).single(),
    supabase
      .from("order_lines")
      .select("quantity, products(distributor_id, manufacturer, model_name)")
      .eq("order_id", po.order_id),
  ]);

  type LineRow = {
    quantity: number;
    products:
      | { distributor_id: string; manufacturer: string; model_name: string }
      | { distributor_id: string; manufacturer: string; model_name: string }[]
      | null;
  };

  // A single order can span multiple distributors (split fulfillment) — this
  // packing slip must only list the items THIS purchase order's distributor
  // is actually shipping, never the full order.
  const items = ((lines ?? []) as LineRow[])
    .map((l) => (Array.isArray(l.products) ? l.products[0] : l.products))
    .map((product, i) => ({ product, quantity: (lines![i] as LineRow).quantity }))
    .filter((l) => l.product?.distributor_id === po.distributor_id);

  return { po, order, items };
}

export default async function PackingSlipDocument({ params }: { params: Promise<{ id: string }> }) {
  const ops = await requireOpsUser();
  if (!ops) redirect("/login");

  const { id } = await params;
  const data = await loadPackingSlip(id);
  if (!data) notFound();

  const { po, order, items } = data;
  const address = order?.job_site_address as JobSiteAddress | undefined;

  return (
    <main className="mx-auto max-w-2xl px-8 py-10 print:px-0">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">GridSpec</h1>
          <p className="mt-1 text-sm text-neutral-500">Packing Slip — Ref. {po.po_number}</p>
        </div>
        <PrintButton />
      </div>

      <section className="mt-8 text-sm">
        <h2 className="font-medium text-neutral-500">Ship to</h2>
        {address ? (
          <p className="mt-1">
            {address.line1}
            <br />
            {address.city}, {address.state} {address.postal_code}
          </p>
        ) : (
          <p className="mt-1 text-neutral-400">No address on file</p>
        )}
      </section>

      <section className="mt-8">
        <table className="w-full text-sm">
          <thead className="border-b border-neutral-300 text-left">
            <tr>
              <th className="py-2">Item</th>
              <th className="py-2 text-right">Qty</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {items.map((l, i) => (
              <tr key={i}>
                <td className="py-2">
                  {l.product!.manufacturer} {l.product!.model_name}
                </td>
                <td className="py-2 text-right">{l.quantity}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <p className="mt-8 text-xs text-neutral-500">
        Shipped on behalf of GridSpec. Questions about this delivery? Contact support@gridspec.example.
      </p>
    </main>
  );
}
