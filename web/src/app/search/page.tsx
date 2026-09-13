"use client";

import { useState } from "react";
import Link from "next/link";
import type { BlendedMatch } from "@/lib/types";

const CATEGORIES = ["battery_pack", "inverter", "panel", "combiner_box"];
const CHEMISTRIES = ["LiFePO4", "NMC"];

function formatUsd(cents: number): string {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export default function SearchPage() {
  const [category, setCategory] = useState("");
  const [chemistry, setChemistry] = useState("");
  const [voltage, setVoltage] = useState("");
  const [results, setResults] = useState<BlendedMatch[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runSearch() {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (category) params.set("category", category);

      const specs: Record<string, unknown> = {};
      if (chemistry) specs.chemistry = chemistry;
      if (voltage) specs.voltage_v = Number(voltage);
      if (Object.keys(specs).length > 0) params.set("specs", JSON.stringify(specs));

      const res = await fetch(`/api/search?${params.toString()}`);
      if (!res.ok) throw new Error((await res.json()).error ?? "Search failed");
      const body = await res.json();
      setResults(body.results);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Search failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <h1 className="text-2xl font-semibold">Spec Search</h1>
      <p className="mt-1 text-sm text-neutral-500">
        Filter by exact technical parameters. Prices shown are blended landed cost across matched distributors.
      </p>

      <div className="mt-6 flex flex-wrap gap-3">
        <select
          className="rounded border border-neutral-300 px-3 py-2 text-sm"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          <option value="">Any category</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>{c.replace("_", " ")}</option>
          ))}
        </select>

        <select
          className="rounded border border-neutral-300 px-3 py-2 text-sm"
          value={chemistry}
          onChange={(e) => setChemistry(e.target.value)}
        >
          <option value="">Any chemistry</option>
          {CHEMISTRIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>

        <input
          className="w-32 rounded border border-neutral-300 px-3 py-2 text-sm"
          placeholder="Voltage (V)"
          value={voltage}
          onChange={(e) => setVoltage(e.target.value)}
          inputMode="numeric"
        />

        <button
          onClick={runSearch}
          disabled={loading}
          className="rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {loading ? "Searching…" : "Search"}
        </button>
      </div>

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      <ul className="mt-8 divide-y divide-neutral-200">
        {results.map((r) => (
          <li key={r.canonical_key} className="flex items-center justify-between py-4">
            <div>
              <Link
                href={`/product/${r.representative_product.id}`}
                className="font-medium hover:underline"
              >
                {r.manufacturer} {r.model_name}
              </Link>
              <p className="text-sm text-neutral-500">
                {r.offer_count} distributor{r.offer_count > 1 ? "s" : ""} · {r.total_stock_qty} in stock
              </p>
            </div>
            <span className="text-lg font-semibold">{formatUsd(r.best_unit_price_cents)}</span>
          </li>
        ))}
        {!loading && results.length === 0 && (
          <li className="py-8 text-center text-sm text-neutral-400">No results yet — run a search.</li>
        )}
      </ul>
    </main>
  );
}
