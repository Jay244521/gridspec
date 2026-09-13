"use client";

import { useState } from "react";
import type { BomLineMatch } from "@/lib/types";
import CheckoutForm from "@/components/CheckoutForm";

function formatUsd(cents: number): string {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

interface CheckoutTotals {
  client_secret: string;
  subtotal_cents: number;
  platform_fee_cents: number;
  total_charged_cents: number;
}

export default function BomUploadPage() {
  const [lines, setLines] = useState<BomLineMatch[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [showAddressForm, setShowAddressForm] = useState(false);
  const [address, setAddress] = useState({ line1: "", city: "", state: "", postal_code: "" });
  const [checkout, setCheckout] = useState<CheckoutTotals | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [placingOrder, setPlacingOrder] = useState(false);
  const [orderComplete, setOrderComplete] = useState(false);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setError(null);
    setLines(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/bom-upload", { method: "POST", body: form });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Upload failed");
      setLines(body.lines);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setLoading(false);
      e.target.value = "";
    }
  }

  const matchedCount = lines?.filter((l) => l.match).length ?? 0;
  const total = lines?.reduce(
    (sum, l) => sum + (l.match ? l.match.best_unit_price_cents * l.quantity : 0),
    0,
  ) ?? 0;

  async function handlePlaceOrder(e: React.FormEvent) {
    e.preventDefault();
    if (!lines) return;

    setPlacingOrder(true);
    setCheckoutError(null);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job_site_address: address,
          lines: lines
            .filter((l) => l.match)
            .map((l) => ({
              product_id: l.match!.representative_product.id,
              quantity: l.quantity,
            })),
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Checkout failed");
      setCheckout(body);
    } catch (err) {
      setCheckoutError(err instanceof Error ? err.message : "Checkout failed");
    } finally {
      setPlacingOrder(false);
    }
  }

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <h1 className="text-2xl font-semibold">BOM Quoting</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Upload a Bill of Materials (CSV or XLSX with description + quantity columns) to auto-match
        SKUs against live distributor inventory.
      </p>

      <label className="mt-6 flex w-fit cursor-pointer items-center gap-2 rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white">
        {loading ? "Matching…" : "Upload BOM file"}
        <input type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleFile} disabled={loading} />
      </label>

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      {lines && (
        <>
          <p className="mt-6 text-sm text-neutral-500">
            Matched {matchedCount} of {lines.length} lines
          </p>
          <table className="mt-3 w-full text-sm">
            <thead className="border-b border-neutral-200 text-left text-neutral-500">
              <tr>
                <th className="py-2">Line item</th>
                <th className="py-2 text-right">Qty</th>
                <th className="py-2 text-right">Matched SKU</th>
                <th className="py-2 text-right">Unit price</th>
                <th className="py-2 text-right">Line total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {lines.map((line) => (
                <tr key={line.line_no}>
                  <td className="py-2">{line.raw_description}</td>
                  <td className="py-2 text-right">{line.quantity}</td>
                  <td className="py-2 text-right">
                    {line.match ? (
                      `${line.match.manufacturer} ${line.match.model_name}`
                    ) : (
                      <span className="text-amber-600">needs manual match</span>
                    )}
                  </td>
                  <td className="py-2 text-right">
                    {line.match ? formatUsd(line.match.best_unit_price_cents) : "—"}
                  </td>
                  <td className="py-2 text-right">
                    {line.match ? formatUsd(line.match.best_unit_price_cents * line.quantity) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mt-6 flex justify-end gap-8 border-t border-neutral-200 pt-4">
            <span className="text-neutral-500">Blended subtotal (matched lines)</span>
            <span className="text-lg font-semibold">{formatUsd(total)}</span>
          </div>

          {orderComplete ? (
            <p className="mt-8 rounded bg-green-50 p-4 text-sm text-green-800">
              Payment succeeded — the order is marked paid, and Automated PO Dispatch will split it
              across distributors once the webhook lands.
            </p>
          ) : matchedCount > 0 && !checkout ? (
            <div className="mt-8 border-t border-neutral-200 pt-6">
              {!showAddressForm ? (
                <button
                  onClick={() => setShowAddressForm(true)}
                  className="rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white"
                >
                  Proceed to checkout
                </button>
              ) : (
                <form onSubmit={handlePlaceOrder} className="flex max-w-sm flex-col gap-3">
                  <h2 className="text-lg font-medium">Job site address</h2>
                  <input
                    required
                    placeholder="Street address"
                    className="rounded border border-neutral-300 px-3 py-2 text-sm"
                    value={address.line1}
                    onChange={(e) => setAddress({ ...address, line1: e.target.value })}
                  />
                  <input
                    required
                    placeholder="City"
                    className="rounded border border-neutral-300 px-3 py-2 text-sm"
                    value={address.city}
                    onChange={(e) => setAddress({ ...address, city: e.target.value })}
                  />
                  <div className="flex gap-3">
                    <input
                      required
                      placeholder="State"
                      className="w-1/2 rounded border border-neutral-300 px-3 py-2 text-sm"
                      value={address.state}
                      onChange={(e) => setAddress({ ...address, state: e.target.value })}
                    />
                    <input
                      required
                      placeholder="ZIP"
                      className="w-1/2 rounded border border-neutral-300 px-3 py-2 text-sm"
                      value={address.postal_code}
                      onChange={(e) => setAddress({ ...address, postal_code: e.target.value })}
                    />
                  </div>
                  {checkoutError && <p className="text-sm text-red-600">{checkoutError}</p>}
                  <button
                    type="submit"
                    disabled={placingOrder}
                    className="rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                  >
                    {placingOrder ? "Creating order…" : "Continue to payment"}
                  </button>
                </form>
              )}
            </div>
          ) : null}

          {checkout && !orderComplete && (
            <div className="mt-8 max-w-sm border-t border-neutral-200 pt-6">
              <dl className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <dt className="text-neutral-500">Subtotal</dt>
                  <dd>{formatUsd(checkout.subtotal_cents)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-neutral-500">Platform fee</dt>
                  <dd>{formatUsd(checkout.platform_fee_cents)}</dd>
                </div>
                <div className="flex justify-between font-semibold">
                  <dt>Total</dt>
                  <dd>{formatUsd(checkout.total_charged_cents)}</dd>
                </div>
              </dl>
              <CheckoutForm
                clientSecret={checkout.client_secret}
                onSuccess={() => setOrderComplete(true)}
              />
            </div>
          )}
        </>
      )}
    </main>
  );
}
