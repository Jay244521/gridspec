"use client";

import { useState } from "react";
import type { BomLineMatch } from "@/lib/types";

function formatUsd(cents: number): string {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export default function BomUploadPage() {
  const [lines, setLines] = useState<BomLineMatch[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        </>
      )}
    </main>
  );
}
