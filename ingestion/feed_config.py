"""
Per-distributor column mappings for inbound inventory feeds.

Every distributor exports CSV/Excel with their own header names. Rather than
force distributors to conform to our schema before we'll ingest their feed,
each distributor gets an alias map: canonical field -> list of header names
we've seen them use (case-insensitive, whitespace-insensitive match).

`spec_fields` lists source columns that get folded into the `specs` JSONB
blob verbatim (after basic type coercion), keyed by their canonical spec name.
"""

FEED_CONFIGS = {
    "acme-solar-supply": {
        "aliases": {
            "distributor_sku": ["sku", "part_number", "item_code"],
            "manufacturer": ["mfr", "manufacturer", "brand"],
            "model_name": ["model", "model_name", "model_no"],
            "category": ["category", "product_type"],
            "description": ["description", "desc"],
            "unit_price": ["price", "unit_price", "wholesale_price"],
            "stock_qty": ["qty", "stock", "qty_on_hand", "available_qty"],
            "lead_time_days": ["lead_time", "lead_time_days"],
            "cad_step_url": ["cad_url", "step_file_url"],
            "schematic_url": ["schematic_url", "wiring_diagram_url"],
            "datasheet_url": ["datasheet_url", "spec_sheet_url"],
        },
        "spec_fields": {
            "voltage_v": ["voltage", "voltage_v"],
            "chemistry": ["chemistry", "battery_chemistry"],
            "capacity_kwh": ["capacity_kwh", "capacity"],
            "certifications": ["certifications", "certs"],
            "form_factor": ["form_factor"],
        },
    },
    # Add one block per pilot distributor as they're onboarded (Phase 2).
}

DEFAULT_CURRENCY = "USD"
