#!/usr/bin/env python3
"""
Daily distributor feed ingestion.

Usage:
    python ingest.py --distributor acme-solar-supply --file feeds/acme_2026-09-13.csv

Reads a distributor's raw CSV/Excel inventory feed, normalizes it against the
schema in db/migrations/0001_init.sql, and upserts into `products` keyed on
(distributor_id, distributor_sku).
"""
import argparse
import json
import os
import re
import sys

import pandas as pd
import psycopg2
from psycopg2.extras import execute_values
from dotenv import load_dotenv

from feed_config import FEED_CONFIGS, DEFAULT_CURRENCY

load_dotenv()


def _normalize_header(name: str) -> str:
    return re.sub(r"[^a-z0-9]", "", name.strip().lower())


def _find_source_column(df_columns_normalized: dict, aliases: list[str]) -> str | None:
    for alias in aliases:
        key = _normalize_header(alias)
        if key in df_columns_normalized:
            return df_columns_normalized[key]
    return None


def load_feed(path: str) -> pd.DataFrame:
    if path.lower().endswith((".xlsx", ".xls")):
        return pd.read_excel(path, dtype=str)
    return pd.read_csv(path, dtype=str)


def canonical_key(manufacturer: str, model_name: str) -> str:
    raw = f"{manufacturer}_{model_name}"
    return re.sub(r"[^a-z0-9]+", "_", raw.strip().lower()).strip("_")


def to_cents(value) -> int:
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return 0
    return int(round(float(str(value).replace("$", "").replace(",", "")) * 100))


def to_int(value, default: int = 0) -> int:
    if value is None or (isinstance(value, float) and pd.isna(value)) or str(value).strip() == "":
        return default
    return int(float(value))


def normalize_rows(df: pd.DataFrame, config: dict) -> list[dict]:
    normalized_cols = {_normalize_header(c): c for c in df.columns}
    aliases = config["aliases"]
    spec_fields = config.get("spec_fields", {})

    col_map = {
        field: _find_source_column(normalized_cols, candidates)
        for field, candidates in aliases.items()
    }
    missing_required = [
        f for f in ("distributor_sku", "manufacturer", "model_name", "unit_price")
        if col_map.get(f) is None
    ]
    if missing_required:
        raise ValueError(f"Feed is missing required columns for: {missing_required}")

    spec_col_map = {
        spec_name: _find_source_column(normalized_cols, candidates)
        for spec_name, candidates in spec_fields.items()
    }

    rows = []
    for _, row in df.iterrows():
        manufacturer = str(row[col_map["manufacturer"]]).strip()
        model_name = str(row[col_map["model_name"]]).strip()

        specs = {}
        for spec_name, source_col in spec_col_map.items():
            if source_col is None:
                continue
            val = row[source_col]
            if pd.isna(val):
                continue
            if spec_name == "certifications":
                specs[spec_name] = [c.strip() for c in str(val).split(",") if c.strip()]
            elif spec_name in ("voltage_v", "capacity_kwh"):
                specs[spec_name] = float(val)
            else:
                specs[spec_name] = str(val).strip()

        rows.append({
            "distributor_sku": str(row[col_map["distributor_sku"]]).strip(),
            "canonical_key": canonical_key(manufacturer, model_name),
            "manufacturer": manufacturer,
            "model_name": model_name,
            "category": str(row.get(col_map.get("category"), "") or "uncategorized").strip() or "uncategorized",
            "description": str(row.get(col_map.get("description"), "") or "").strip() or None,
            "specs": json.dumps(specs),
            "unit_price_cents": to_cents(row[col_map["unit_price"]]),
            "currency": DEFAULT_CURRENCY,
            "stock_qty": to_int(row.get(col_map.get("stock_qty")), default=0),
            "lead_time_days": to_int(row.get(col_map.get("lead_time_days")), default=None) if col_map.get("lead_time_days") else None,
            "cad_step_url": row.get(col_map.get("cad_step_url")) or None,
            "schematic_url": row.get(col_map.get("schematic_url")) or None,
            "datasheet_url": row.get(col_map.get("datasheet_url")) or None,
        })
    return rows


UPSERT_SQL = """
insert into products (
    distributor_id, distributor_sku, canonical_key, manufacturer, model_name,
    category, description, specs, unit_price_cents, currency, stock_qty,
    lead_time_days, cad_step_url, schematic_url, datasheet_url, last_ingested_at
)
values %s
on conflict (distributor_id, distributor_sku) do update set
    canonical_key    = excluded.canonical_key,
    manufacturer     = excluded.manufacturer,
    model_name       = excluded.model_name,
    category         = excluded.category,
    description      = excluded.description,
    specs            = excluded.specs,
    unit_price_cents = excluded.unit_price_cents,
    currency         = excluded.currency,
    stock_qty        = excluded.stock_qty,
    lead_time_days   = excluded.lead_time_days,
    cad_step_url     = excluded.cad_step_url,
    schematic_url    = excluded.schematic_url,
    datasheet_url    = excluded.datasheet_url,
    last_ingested_at = excluded.last_ingested_at,
    updated_at       = now();
"""


def upsert_products(conn, distributor_id: str, rows: list[dict]) -> None:
    if not rows:
        return
    values = [
        (
            distributor_id, r["distributor_sku"], r["canonical_key"], r["manufacturer"],
            r["model_name"], r["category"], r["description"], r["specs"],
            r["unit_price_cents"], r["currency"], r["stock_qty"], r["lead_time_days"],
            r["cad_step_url"], r["schematic_url"], r["datasheet_url"], "now()",
        )
        for r in rows
    ]
    with conn.cursor() as cur:
        execute_values(cur, UPSERT_SQL, values, template=None, page_size=500)
    conn.commit()


def get_distributor_id(conn, slug: str) -> str:
    with conn.cursor() as cur:
        cur.execute("select id from distributors where slug = %s", (slug,))
        result = cur.fetchone()
        if result is None:
            raise ValueError(f"No distributor found with slug '{slug}' — seed it first")
        return result[0]


def main():
    parser = argparse.ArgumentParser(description="Ingest a distributor inventory feed into GridSpec")
    parser.add_argument("--distributor", required=True, help="Distributor slug, e.g. acme-solar-supply")
    parser.add_argument("--file", required=True, help="Path to the CSV/XLSX feed")
    parser.add_argument("--database-url", default=os.environ.get("DATABASE_URL"))
    args = parser.parse_args()

    if not args.database_url:
        sys.exit("DATABASE_URL not set (env var or --database-url)")

    config = FEED_CONFIGS.get(args.distributor)
    if config is None:
        sys.exit(f"No feed config for distributor '{args.distributor}' — add one to feed_config.py")

    df = load_feed(args.file)
    rows = normalize_rows(df, config)

    conn = psycopg2.connect(args.database_url)
    try:
        distributor_id = get_distributor_id(conn, args.distributor)
        upsert_products(conn, distributor_id, rows)
    finally:
        conn.close()

    print(f"Ingested {len(rows)} rows for distributor '{args.distributor}'")


if __name__ == "__main__":
    main()
