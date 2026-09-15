import { redirect } from "next/navigation";
import Link from "next/link";
import { requireOpsUser } from "@/lib/ops-auth";
import { getServiceRoleClient } from "@/lib/supabase";

function formatUsd(cents: number): string {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export default async function OpsPurchaseOrdersPage() {
  const ops = await requireOpsUser();
  if (!ops) redirect("/login");

  const supabase = getServiceRoleClient();
  const { data: purchaseOrders } = await supabase
    .from("purchase_orders")
    .select("id, po_number, status, distributor_payout_cents, payout_terms, created_at, distributors(name)")
    .order("created_at", { ascending: false })
    .limit(50);

  type Row = {
    id: string;
    po_number: string;
    status: string;
    distributor_payout_cents: number;
    payout_terms: string;
    created_at: string;
    distributors: { name: string } | { name: string }[] | null;
  };

  const rows = (purchaseOrders ?? []) as Row[];

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-2xl font-semibold">Purchase Orders (Ops)</h1>
      <p className="mt-1 text-sm text-neutral-500">Signed in as {ops.email}</p>

      <table className="mt-6 w-full text-sm">
        <thead className="border-b border-neutral-200 text-left text-neutral-500">
          <tr>
            <th className="py-2">PO Number</th>
            <th className="py-2">Distributor</th>
            <th className="py-2">Status</th>
            <th className="py-2 text-right">Payout</th>
            <th className="py-2 text-right">Documents</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-100">
          {rows.map((po) => {
            const distributor = Array.isArray(po.distributors) ? po.distributors[0] : po.distributors;
            return (
              <tr key={po.id}>
                <td className="py-2">{po.po_number}</td>
                <td className="py-2">{distributor?.name ?? "—"}</td>
                <td className="py-2 capitalize">{po.status}</td>
                <td className="py-2 text-right">{formatUsd(po.distributor_payout_cents)}</td>
                <td className="py-2 text-right">
                  <Link href={`/ops/purchase-orders/${po.id}/po`} className="text-blue-600 hover:underline">
                    PO
                  </Link>
                  {" · "}
                  <Link
                    href={`/ops/purchase-orders/${po.id}/packing-slip`}
                    className="text-blue-600 hover:underline"
                  >
                    Packing slip
                  </Link>
                </td>
              </tr>
            );
          })}
          {rows.length === 0 && (
            <tr>
              <td colSpan={5} className="py-8 text-center text-neutral-400">
                No purchase orders yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </main>
  );
}
