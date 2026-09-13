-- Auth wiring + Row Level Security
--
-- Contractor onboarding is invite-only (Phase 3: VIP Beta cohort), not
-- self-serve signup, so contractor_users are created server-side (service
-- role) and linked to a Supabase Auth user via auth_user_id.
--
-- RLS is defense-in-depth: today all client traffic goes through our own
-- Next.js API routes using the service role key (which bypasses RLS), but
-- these policies stop a leaked anon key, a future direct-from-browser
-- Supabase call, or an app-layer bug from crossing tenant boundaries.

alter table contractor_users
    add column auth_user_id uuid unique references auth.users(id) on delete set null;

alter table contractors           enable row level security;
alter table contractor_users      enable row level security;
alter table products              enable row level security;
alter table distributors          enable row level security;
alter table boms                  enable row level security;
alter table bom_lines             enable row level security;
alter table orders                enable row level security;
alter table order_lines           enable row level security;
alter table purchase_orders       enable row level security;

-- Resolves the calling user's contractor_id, or null if unauthenticated /
-- not linked to a contractor. `security definer` lets it read
-- contractor_users regardless of the caller's own row visibility.
create or replace function current_contractor_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
    select contractor_id
    from contractor_users
    where auth_user_id = auth.uid()
    limit 1;
$$;

-- ---------------------------------------------------------------------------
-- contractors / contractor_users: a contractor firm sees only its own row
-- and its own users.
-- ---------------------------------------------------------------------------
create policy contractors_select_own on contractors
    for select using (id = current_contractor_id());

create policy contractor_users_select_own on contractor_users
    for select using (contractor_id = current_contractor_id());

-- No update/insert/delete policy on contractor_users: there's no self-service
-- profile-edit feature yet, and a naive "update using (auth_user_id =
-- auth.uid())" policy would actually let a user reassign their own
-- contractor_id to a different tenant (an UPDATE's WITH CHECK defaults to its
-- USING clause, which never inspects contractor_id). Add one later only with
-- an explicit WITH CHECK that pins contractor_id unchanged.

-- ---------------------------------------------------------------------------
-- products: public catalog data, readable by any signed-in contractor.
-- No insert/update/delete policy exists for anon/authenticated roles, so
-- only the service role (ingestion pipeline) can write.
-- ---------------------------------------------------------------------------
create policy products_select_active on products
    for select
    to authenticated
    using (is_active = true);

-- distributors intentionally has NO policy for anon/authenticated roles:
-- contractors should never resolve a product back to a named distributor
-- (blended pricing display is an anti-disintermediation mechanic, not just
-- a UI choice) — only the service role can read/write this table.

-- ---------------------------------------------------------------------------
-- boms / bom_lines: a contractor's saved project workspace is private to it.
-- ---------------------------------------------------------------------------
create policy boms_owner_all on boms
    for all
    using (contractor_id = current_contractor_id())
    with check (contractor_id = current_contractor_id());

create policy bom_lines_owner_all on bom_lines
    for all
    using (
        exists (
            select 1 from boms
            where boms.id = bom_lines.bom_id
            and boms.contractor_id = current_contractor_id()
        )
    )
    with check (
        exists (
            select 1 from boms
            where boms.id = bom_lines.bom_id
            and boms.contractor_id = current_contractor_id()
        )
    );

-- ---------------------------------------------------------------------------
-- orders / order_lines / purchase_orders: read-only for the owning
-- contractor. Rows are only ever written by our API routes via the service
-- role (server-side pricing, Automated PO Dispatch), never directly by a
-- client, so no insert/update/delete policy is granted here.
-- ---------------------------------------------------------------------------
create policy orders_select_own on orders
    for select using (contractor_id = current_contractor_id());

create policy order_lines_select_own on order_lines
    for select using (
        exists (
            select 1 from orders
            where orders.id = order_lines.order_id
            and orders.contractor_id = current_contractor_id()
        )
    );

create policy purchase_orders_select_own on purchase_orders
    for select using (
        exists (
            select 1 from orders
            where orders.id = purchase_orders.order_id
            and orders.contractor_id = current_contractor_id()
        )
    );
