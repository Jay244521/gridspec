# GridSpec

Phase 1 scaffold: B2B procurement search, BOM quoting, and order routing for
solar/battery/EPC contractors, per the platform spec (v2).

## Layout

```
db/migrations/    Postgres schema (Supabase-flavored)
ingestion/        Python pipeline that normalizes distributor feeds into products
web/              Next.js app: spec search, BOM upload, checkout, Stripe webhook
```

## 1. Database

Run the migration against a Postgres 15+ instance (Supabase or otherwise):

```bash
psql "$DATABASE_URL" -f db/migrations/0001_init.sql
psql "$DATABASE_URL" -f db/migrations/0002_auth_rls.sql
```

`0001_init.sql` creates `distributors`, `contractors`, `products` (JSONB
`specs` column with a GIN index for sub-second attribute filtering),
`boms`/`bom_lines`, `orders`/`order_lines`, and `purchase_orders` (one row per
distributor per order, supporting split fulfillment across a single BOM).

`0002_auth_rls.sql` links `contractor_users` to Supabase Auth
(`auth_user_id`) and turns on Row Level Security everywhere: a contractor can
only ever see its own `boms`/`orders`/`purchase_orders`, and — deliberately —
no policy grants contractors read access to `distributors` at all, so a
direct query can't defeat the blended-pricing display and reveal which
distributor fulfilled what (see Anti-Disintermediation Mechanics). Today all
of this is defense-in-depth: the web app's own routes already enforce
tenant scoping in application code (see below) and talk to Postgres with the
service-role key for anything that legitimately spans contractors, so
nothing currently relies on RLS alone — but it's what stops a leaked anon
key or a future direct-from-browser Supabase call from crossing a tenant
boundary.

Seed at least one distributor before ingesting a feed — the ingestion script
looks distributors up by `slug`:

```sql
insert into distributors (name, slug, is_pilot_partner)
values ('Acme Solar Supply', 'acme-solar-supply', true);
```

## 2. Ingestion pipeline

```bash
cd ingestion
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python ingest.py --distributor acme-solar-supply --file sample_feeds/acme-solar-supply_2026-09-13.csv \
  --database-url "$DATABASE_URL"
```

Each distributor gets a column-alias mapping in `feed_config.py` (their CSV/
Excel headers vary; we normalize to our schema rather than asking distributors
to conform). Add a new block there for each pilot partner onboarded in Phase 2.

Products are upserted on `(distributor_id, distributor_sku)`, so re-running
ingestion on a refreshed daily feed just updates price/stock in place.

## 3. Web app

```bash
cd web
cp .env.example .env.local   # fill in Supabase + Stripe keys
npm install
npm run dev
```

Pages/routes:
- `/login` — email/password sign-in (Supabase Auth). There is no public
  sign-up: Phase 3 onboarding is invite-only (see below).
- `/search` — spec search (`/api/search`), blended across distributors by
  `canonical_key` — the UI never shows a per-distributor bidding view.
  Requires auth (search access is a paid SaaS-tier feature, not public).
- `/bom` — BOM upload (`/api/bom-upload`), CSV/XLSX, heuristic SKU matching
  against manufacturer/model name; low-confidence lines come back unmatched
  for manual resolution rather than guessing. Requires auth.
- `/product/[id]` — product detail, spec table, CAD/schematic/datasheet links.
  Requires auth.
- `/api/checkout` — requires auth; `contractor_id` is derived from the
  session (never trusted from the request body — otherwise any caller could
  place orders, or read order history, under an arbitrary contractor). Prices
  the order entirely from server-side catalog data and opens a Stripe
  PaymentIntent for subtotal + platform fee. GridSpec is merchant of record;
  distributors are not paid via Stripe Connect transfer at charge time.
- `/api/webhooks/stripe` — on `payment_intent.succeeded`, marks the order paid
  and performs Automated PO Dispatch: splits the order into one
  `purchase_order` per distributor with a blind packing slip, on Net-30 payout
  terms. PO generation never happens before payment actually clears.

### Auth model

- Contractor onboarding is invite-only (LinkedIn outreach to a 10-15-firm VIP
  Beta cohort per the roadmap), so there's no public signup route. Invite a
  pilot contractor with:
  ```bash
  cd web
  node --env-file=.env.local scripts/invite-contractor.mjs \
    "Acme Solar Installers" ops@acmesolar.example "Jordan Lee"
  ```
  This creates the `contractors` row, sends a Supabase invite email (the
  person sets their own password via the link), and links the two via
  `contractor_users.auth_user_id`.
- `src/proxy.ts` (Next.js 16 renamed `middleware.ts` to `proxy.ts`) only
  refreshes the session cookie on every request — it does not gate access.
  Every route that touches contractor-owned data calls
  `getAuthedContractor()` (`src/lib/auth.ts`) itself and derives
  `contractor_id` from the session, per the Next.js proxy docs' own warning
  not to rely on proxy/middleware alone for authorization.
- Two Supabase clients exist on purpose: `lib/supabase-server.ts` /
  `lib/supabase-browser.ts` use the anon key and a user's session (subject to
  RLS); `lib/supabase.ts` uses the service role key (bypasses RLS) and is
  only for the ingestion pipeline and the Stripe webhook, which have no user
  session to act as.

### Known gaps (not yet built)

- No actual distributor-facing PO/packing-slip document generation or email
  dispatch — `purchase_orders` rows are created but nothing downstream
  consumes them yet.
- No scheduled job to reconcile/pay out `purchase_orders` at their
  `payout_due_at` — Net-30/60 payout is modeled in the schema but not executed.
- BOM SKU matching is a naive token-overlap heuristic, not fuzzy/ML matching.
- No automated test suite yet.
