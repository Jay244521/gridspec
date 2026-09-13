-- GridSpec core schema
-- Target: PostgreSQL 15+ (Supabase)

create extension if not exists "pgcrypto"; -- gen_random_uuid()

-- ---------------------------------------------------------------------------
-- Distributors
-- ---------------------------------------------------------------------------
create table distributors (
    id                  uuid primary key default gen_random_uuid(),
    name                text not null,
    slug                text not null unique,
    contact_email       text,
    stripe_account_id   text,              -- Stripe Connect account for payouts
    fee_pct_override    numeric(5,2),      -- pilot-partner reduced/waived fee, else platform default applies
    is_pilot_partner    boolean not null default false,
    non_circumvention_signed_at timestamptz,
    created_at          timestamptz not null default now(),
    updated_at          timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Contractors (buyer firms) and their users
-- ---------------------------------------------------------------------------
create table contractors (
    id                  uuid primary key default gen_random_uuid(),
    company_name        text not null,
    stripe_customer_id  text,
    subscription_tier   text not null default 'trial'
                         check (subscription_tier in ('trial', 'standard', 'pro')),
    subscription_status text not null default 'inactive'
                         check (subscription_status in ('inactive', 'active', 'past_due', 'canceled')),
    created_at          timestamptz not null default now(),
    updated_at          timestamptz not null default now()
);

create table contractor_users (
    id              uuid primary key default gen_random_uuid(),
    contractor_id   uuid not null references contractors(id) on delete cascade,
    email           text not null unique,
    full_name       text,
    role            text not null default 'member' check (role in ('owner', 'member')),
    created_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Products: one row per distributor's SKU. Cross-distributor equivalence is
-- expressed via `canonical_key` (e.g. normalized mfr+model) so the search/BOM
-- matcher can group equivalent SKUs from different distributors together.
-- ---------------------------------------------------------------------------
create table products (
    id                  uuid primary key default gen_random_uuid(),
    distributor_id      uuid not null references distributors(id) on delete cascade,
    distributor_sku     text not null,
    canonical_key       text not null,      -- normalized mfr+model, used to match equivalent SKUs across distributors
    manufacturer        text not null,
    model_name          text not null,
    category            text not null,      -- e.g. 'battery_pack', 'inverter', 'panel', 'combiner_box'
    description         text,
    specs               jsonb not null default '{}'::jsonb,
    -- e.g. {"voltage_v": 48, "chemistry": "LiFePO4", "capacity_kwh": 14.3,
    --       "certifications": ["UL9540", "UL1973"], "form_factor": "wall_mount"}
    unit_price_cents    integer not null check (unit_price_cents >= 0),
    currency            text not null default 'USD',
    stock_qty           integer not null default 0,
    lead_time_days      integer,
    cad_step_url        text,
    schematic_url       text,
    datasheet_url       text,
    is_active           boolean not null default true,
    last_ingested_at    timestamptz,
    created_at          timestamptz not null default now(),
    updated_at          timestamptz not null default now(),
    unique (distributor_id, distributor_sku)
);

-- Sub-second attribute filtering on the specs blob.
create index idx_products_specs_gin on products using gin (specs jsonb_path_ops);
create index idx_products_canonical_key on products (canonical_key);
create index idx_products_category on products (category);
create index idx_products_manufacturer_model on products (manufacturer, model_name);

-- ---------------------------------------------------------------------------
-- Saved BOM templates / project workspace
-- ---------------------------------------------------------------------------
create table boms (
    id              uuid primary key default gen_random_uuid(),
    contractor_id   uuid not null references contractors(id) on delete cascade,
    name            text not null,
    project_ref     text,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);

create table bom_lines (
    id              uuid primary key default gen_random_uuid(),
    bom_id          uuid not null references boms(id) on delete cascade,
    line_no         integer not null,
    raw_description text,               -- as uploaded, before SKU matching
    canonical_key   text,               -- resolved match, nullable until matched
    quantity        integer not null check (quantity > 0),
    matched_product_id uuid references products(id),
    created_at      timestamptz not null default now(),
    unique (bom_id, line_no)
);

-- ---------------------------------------------------------------------------
-- Orders: a contractor checkout may fan out into multiple purchase_orders
-- (one per distributor) to support split fulfillment across a single BOM.
-- ---------------------------------------------------------------------------
create table orders (
    id                      uuid primary key default gen_random_uuid(),
    contractor_id           uuid not null references contractors(id),
    bom_id                  uuid references boms(id),
    status                  text not null default 'pending'
                             check (status in ('pending', 'paid', 'dispatched', 'fulfilled', 'disputed', 'canceled')),
    subtotal_cents          integer not null,
    platform_fee_cents      integer not null,
    total_charged_cents     integer not null,
    stripe_payment_intent_id text,
    job_site_address        jsonb not null,
    created_at              timestamptz not null default now(),
    updated_at              timestamptz not null default now()
);

create table order_lines (
    id              uuid primary key default gen_random_uuid(),
    order_id        uuid not null references orders(id) on delete cascade,
    product_id      uuid not null references products(id),
    quantity        integer not null check (quantity > 0),
    unit_price_cents integer not null,
    created_at      timestamptz not null default now()
);

-- One purchase order per distributor per customer order (split fulfillment).
create table purchase_orders (
    id                  uuid primary key default gen_random_uuid(),
    order_id            uuid not null references orders(id) on delete cascade,
    distributor_id      uuid not null references distributors(id),
    po_number           text not null unique,
    status              text not null default 'dispatched'
                         check (status in ('dispatched', 'acknowledged', 'shipped', 'delivered', 'exception')),
    distributor_payout_cents integer not null,
    payout_terms        text not null default 'net_30' check (payout_terms in ('net_30', 'net_60')),
    payout_due_at        timestamptz,
    packing_slip_blind   boolean not null default true,
    tracking_number      text,
    created_at           timestamptz not null default now(),
    updated_at           timestamptz not null default now()
);

create index idx_purchase_orders_order on purchase_orders (order_id);
create index idx_purchase_orders_distributor on purchase_orders (distributor_id);
