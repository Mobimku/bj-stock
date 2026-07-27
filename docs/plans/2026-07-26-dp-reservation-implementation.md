# DP Reservation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a DP (down payment) reservation system that lets customers reserve a unit by paying partial DP. The reservation locks the unit as `Dipesan`, tracks immutable terms (DP amount, agreed price, refundable flag, expiry), and resolves through one of three explicit paths: completion to sale, Owner refund (refundable only), or forfeit (non-refundable only). Expiry blocks completion but does not auto-resolve — overdue reservations stay locked until manual resolution.

**Architecture:** New table `reservations` with status flow (`Dipesan → Selesai | Dibatalkan | Hangus`). New unit status `Dipesan` inserted between `Listed` and `Terjual`. Atomic RPCs for create, complete, refund, and forfeit — each enforces business rules, updates unit status, and records finance entries in one transaction. DP cash-in uses new category `Uang Muka Reservasi`. Complete first reverses that DP entry (−DP, same category, linked reversal), then invokes the existing F-SLS-02 `create_sale` path at full `agreed_price` — net cash = full price, warranty starts via existing sales trigger. Refundable cancellation creates a linked cash-out; non-refundable forfeit adds no cash entry (P&L sums `Hangus` reservation DP directly).

**Status flow (linear extension of existing unit flow):**
```
... → Listed → Dipesan → Terjual → ...
                  │
                  ├──→ Selesai (Dibatalkan, via refund)
                  └──→ Hangus   (via forfeit, non-refundable)
```

**Tech Stack:** PostgreSQL/Supabase migrations and RPCs, PGlite regression tests, Next.js App Router, TypeScript, Zod, React/Tailwind.

**Note:** No source implementation has started. This plan covers the complete feature from DB to UI.

---

### Task 1: Write the failing database contract test (RED)

**Files:**
- Modify: `supabase/tests/initial-migration.test.mjs`

1. Load migration `202607260001_dp_reservation.sql` after existing migrations.
2. Add assertions for `create_reservation(idempotency_key, unit_id, customer_id, dp_amount, agreed_price, is_refundable, expires_at)`:
   - Row inserted into `reservations` with correct values, status `Dipesan`, `dp_amount < agreed_price`, `dp_amount > 0`.
   - Unit status changed to `Dipesan`.
   - `finance_transactions` row created with kategori `Uang Muka Reservasi`, arah `Masuk`, jumlah = `dp_amount`.
    - Retrying the same `idempotency_key` returns the original reservation without duplicating Finance; a different key on the same active unit is rejected (one DP only).
3. Add assertions for `complete_reservation(reservation_id, p_test, ...sale_fields)`:
   - DP entry reversed: `finance_transactions` row with arah `Keluar`, kategori `Uang Muka Reservasi`, jumlah = `dp_amount`, is_reversal = true, reversal_of = original `id_dp_transaction`.
   - Existing `create_sale` path invoked at full `agreed_price`: `sale_unit_tests` inserted with `confirmed_at`, `sales` row created with `harga_jual = agreed_price`.
   - Warranty row created by existing sales trigger with correct `tanggal_mulai`.
   - Reservation status → `Selesai`, `completed_at` set.
   - Unit status → `Terjual`.
   - Net cash entries: +dp_amount (create), −dp_amount (reversal), +agreed_price (sale) = agreed_price total; no duplicate.
    - Completion rejected if `expires_at < clock_timestamp()` (error raised, reservation unchanged).
   - Completion rejected with `metode_bayar = 'Cicilan'` (v1 only allows Tunai/Transfer).
4. Add assertions for `refund_reservation(reservation_id)` (Owner only):
   - Reservation status → `Dibatalkan`.
   - Finance: cash-out entry linked to original DP entry (is_reversal=true, reversal_of=<dp_transaction>).
   - Unit status returned to `Listed`.
   - Rejected if `is_refundable = false`.
5. Add assertions for `forfeit_reservation(reservation_id)` (Admin/Owner):
   - Reservation status → `Hangus`.
   - No finance_transactions row added (cash already booked at creation; shown in P&L as DP hangus).
   - Unit status returned to `Listed`.
   - Rejected if `is_refundable = true`.
6. Add assertion: expiry date passed with no action → reservation stays `Dipesan`, unit stays locked, no auto-resolution.
7. Assert terms immutable: cannot modify `dp_amount`, `agreed_price`, `is_refundable`, or `expires_at` after creation.
8. Run `node supabase/tests/initial-migration.test.mjs`; expected RED because the migration/RPCs do not exist.

### Task 2: Implement database migration and RPCs (GREEN)

**Files:**
- Create: `supabase/migrations/202607260001_dp_reservation.sql`
- Modify: `supabase/seed.sql`

1. **Add `Dipesan` to `units.status` check constraint:**
   ```sql
   alter table units drop constraint if exists units_status_check;
   alter table units add constraint units_status_check
     check (status in ('Masuk','QC','Ready','Listed','Dipesan','Terjual','Selesai','Delisted'));
   ```

2. **Add `Uang Muka Reservasi` to `finance_transactions.kategori`:**
   ```sql
   alter table finance_transactions drop constraint if exists finance_transactions_kategori_check;
   alter table finance_transactions add constraint finance_transactions_kategori_check
     check (kategori in (
       'Pembelian Unit','Pembelian Part','Biaya Upgrade Eksternal',
       'Penjualan Unit','Pendapatan Servis','Operasional',
       'Modal Disetor','Retur Unit','Retur Servis','Selisih Penggantian Unit',
       'Uang Muka Reservasi','Lainnya'
     ));
   ```

3. **Add `Reservasi` to `finance_transactions.source_module`:**
   ```sql
   alter table finance_transactions drop constraint if exists finance_transactions_source_module_check;
   alter table finance_transactions add constraint finance_transactions_source_module_check
     check (source_module in ('Stock','BankStock','Sales','Servis','Manual','Retur','Warranty','Reservasi'));
   ```

4. **Create `reservations` table:**
   ```sql
   create table reservations (
     id_reservation uuid primary key default gen_random_uuid(),
      idempotency_key uuid not null unique,
      id_unit text not null references units(id_unit),
     id_customer uuid not null references customers(id_customer),
     dp_amount numeric not null check (dp_amount > 0),
     agreed_price numeric not null check (agreed_price > 0),
     is_refundable boolean not null default true,
     previous_status text not null,
     status text not null default 'Dipesan'
       check (status in ('Dipesan','Selesai','Dibatalkan','Hangus')),
      expires_at timestamptz not null,
     completed_at timestamptz,
     cancelled_at timestamptz,
     forfeited_at timestamptz,
     id_dp_transaction uuid references finance_transactions(id_transaksi),
     created_by uuid,
     created_at timestamptz not null default now(),
     updated_at timestamptz not null default now(),
     check (dp_amount < agreed_price)
   );
   -- One active DP per unit
   create unique index idx_reservations_active_unit on reservations(id_unit)
     where status = 'Dipesan';
   ```

5. **Create RPC `create_reservation`:**
   - `require_admin_or_owner()` guard (either admin or owner can create).
   - Validate unit status is `Ready` or `Listed`.
   - Validate `dp_amount > 0` and `< agreed_price`.
    - Return the existing row when `idempotency_key` was already processed.
    - Validate `expires_at > clock_timestamp()`.
   - Lock unit row (`SELECT ... FOR UPDATE`).
   - Get unit's current status as `previous_status`.
   - Insert `reservations` row.
   - Update `units.status = 'Dipesan'`.
   - Insert `finance_transactions`: kategori `Uang Muka Reservasi`, arah `Masuk`, jumlah = `dp_amount`, source_module = `Reservasi`, source_id = `id_reservation`.
   - Store `id_dp_transaction` on reservation.
   - Insert `admin_actions_log`.
   - All in one transaction.

6. **Create RPC `complete_reservation`:**
   - `require_admin_or_owner()` guard.
   - Accept `p_test jsonb`, `metode_bayar`, `channel`, `durasi_garansi_hari` (prefill from reservation/`app_settings`).
   - Validate reservation status is `Dipesan`.
    - Validate `expires_at >= clock_timestamp()` (reject if overdue).
   - Validate `metode_bayar IN ('Tunai','Transfer')` (v1 rejects Cicilan).
   - Lock reservation row and unit row.
   - **Step 1 — Reverse DP:** insert `finance_transactions`: arah `Keluar`, kategori `Uang Muka Reservasi`, jumlah = `dp_amount`, is_reversal = true, reversal_of = `id_dp_transaction`, source_module = `Reservasi`, source_id = `id_reservation`.
   - **Step 2 — Invoke `create_sale`:** pass `p_test` along with `id_unit`, `id_customer`, `harga_jual = agreed_price`, `metode_bayar`, `channel`, `durasi_garansi_hari`. `create_sale` inserts `sale_unit_tests` + `sales` + triggers warranty start atomically. The internal `prepare_sale` check is patched to accept `Dipesan` status when called from this flow (see note below).
   - Update reservation: status = `Selesai`, `completed_at = now()`.
   - Insert `admin_actions_log`.
   - All in one transaction. Net finance: +dp (create), −dp (reversal), +full agreed_price (sale) = full agreed_price.

7. **Create RPC `refund_reservation` (Owner only):**
   - `require_owner()` guard.
   - Validate reservation status is `Dipesan`.
   - Validate `is_refundable = true` (reject non-refundable).
   - Lock reservation row and unit row.
   - Insert `finance_transactions`: kategori `Uang Muka Reservasi`, arah `Keluar`, jumlah = `dp_amount`, is_reversal = true, reversal_of = `id_dp_transaction`.
   - Update reservation: status = `Dibatalkan`, `cancelled_at = now()`.
   - Restore `units.status = previous_status`.
   - Insert `admin_actions_log`.
   - All in one transaction.

8. **Create RPC `forfeit_reservation` (Admin or Owner):**
   - `require_admin_or_owner()` guard.
   - Validate reservation status is `Dipesan`.
   - Validate `is_refundable = false` (reject refundable).
   - Lock reservation row and unit row.
   - **No finance_transactions row added.** DP was already booked as cash-in at creation; P&L recognizes via `reservations WHERE status = 'Hangus'`.
   - Update reservation: status = `Hangus`, `forfeited_at = now()`.
   - Restore `units.status = previous_status`.
   - Insert `admin_actions_log`.
   - All in one transaction.

9. **Patch `prepare_sale` for `Dipesan` acceptance without changing the public `create_sale` signature:**
    - The existing 12-argument `create_sale` RPC remains unchanged for callers.
    - `complete_reservation` sets transaction-local `app.reservation_flow = 'on'` before invoking `create_sale`.
    - `prepare_sale` accepts `Dipesan` only while that transaction-local flag is on; ordinary `POST /api/sales` still rejects `Dipesan`.
   - This is the **only** path that transitions `Dipesan → Terjual`.

10. **Enable RLS on `reservations`:** SELECT/INSERT for authenticated; UPDATE only via RPCs (security definer).
11. **Grant execute** on all four RPCs to `authenticated` role.
12. Update seed data to include a sample reservation scenario.
13. Re-run the focused PGlite test; expected GREEN.

### Task 3: Add server validation and API dispatch

**Files:**
- Create: `lib/validation/reservation.ts`
- Create: `app/api/reservations/route.ts`
- Create: `app/api/reservations/[id]/complete/route.ts`
- Create: `app/api/reservations/[id]/refund/route.ts`
- Create: `app/api/reservations/[id]/forfeit/route.ts`
- Modify: `app/api/sales/route.ts` (reject `Dipesan` units at route level)

1. **Zod schemas (`lib/validation/reservation.ts`):**
   - `createReservationSchema`: `id_unit` (required), `id_customer` (required UUID), `dp_amount` (positive, less than agreed_price), `agreed_price` (positive), `is_refundable` (boolean), `expires_at` (date string, future).
   - `completeReservationSchema`: `id_reservation` (required UUID), plus full F-SLS-02 fields (`p_test` with 12 `test_results`, `blocking_checks`, `acknowledgement`), plus sale fields (`metode_bayar` enum `Tunai` | `Transfer`, `channel`, `durasi_garansi_hari`).
   - `refundReservationSchema`: `id_reservation` (required UUID).
   - `forfeitReservationSchema`: `id_reservation` (required UUID).

2. **`POST /api/reservations` → Create:**
   - Validate body with `createReservationSchema`.
   - Dispatch to RPC `create_reservation`.
   - Map PG validation failures (unique violation → 409, active DP → 409, constraint violation → 400).
   - Return 201 with reservation ID.

3. **`POST /api/reservations/[id]/complete` → Complete to sale:**
   - Read `id` from params; read `p_test`, `metode_bayar`, `channel`, `durasi_garansi_hari` from body.
   - Validate with `completeReservationSchema`.
   - Dispatch to RPC `complete_reservation` (which reverses DP then invokes `create_sale`).
   - Reject with 400 if expired, 400 if Cicilan, 409 if wrong status.
   - Return 200 with invoice ID. **This is the exclusive endpoint** for selling a reserved unit.

4. **`POST /api/sales` → Reject `Dipesan` units:**
   - Add early guard at route level: if unit status is `Dipesan`, return 400 "Unit sedang dalam reservasi. Selesaikan reservasi terlebih dahulu."
   - This ensures ordinary sale flow cannot bypass the reservation completion path.

5. **`POST /api/reservations/[id]/refund` → Refund (Owner only):**
   - Read `id` from params.
   - Dispatch to RPC `refund_reservation`.
   - Reject with 403 if not owner, 400 if non-refundable, 409 if wrong status.
   - Return 200.

6. **`POST /api/reservations/[id]/forfeit` → Forfeit:**
   - Read `id` from params.
   - Dispatch to RPC `forfeit_reservation`.
   - Reject with 400 if refundable, 409 if wrong status.
   - Return 200.

### Task 4: Add UI flows

**Files:**
- Create: `app/(dashboard)/units/[id]/reservation-section.tsx`
- Create: `app/(dashboard)/reservations/page.tsx`
- Modify: `app/(dashboard)/units/[id]/page.tsx`
- Modify: `app/(dashboard)/units/[id]/sale-form.tsx` (or equivalent sale creation flow — hide "Jual" for `Dipesan` units)
- Modify: `components/nav/` (add Reservations link)

1. **Reservation section on unit detail (`reservation-section.tsx`):**
   - If unit status is `Dipesan`: show reservation card with customer name, DP amount, agreed price, expiry date, status badge.
   - If current user is admin/owner and reservation is `Dipesan`: show action buttons based on terms:
     - **Complete** (always, if not expired): opens a complete modal that embeds the **full F-SLS-02 test form** (12 categories, buyer acknowledgement) plus sale fields (channel, metode_bayar Tunai/Transfer only, durasi_garansi). The remaining balance is displayed as info but not separately journaled — the completion posts the full `agreed_price` through `create_sale`. Submit → calls `POST /api/reservations/[id]/complete` with `p_test` and sale fields.
     - **Refund DP** (if `is_refundable`): Owner-only button with confirmation ("DP akan dikembalikan ke customer?") → calls refund endpoint.
     - **Forfeit DP** (if not `is_refundable`): Admin/Owner button with confirmation ("DP akan hangus?") → calls forfeit endpoint.
   - If expired: show "Melebihi batas reservasi" warning; Complete button disabled with tooltip; Refund/Forfeit still available.

2. **Reservation list page (`/reservations`):**
   - Table/list of all reservations: ID, unit info, customer, DP amount, agreed price, status, expiry.
   - Filterable by status (Dipesan, Selesai, Dibatalkan, Hangus).
   - Click row → navigate to unit detail page.
   - Mobile: card layout; Desktop: table.

3. **Create reservation flow:**
   - From unit detail page (status Ready/Listed): button "Reservasi (DP)".
   - Opens modal form:
     - Customer select/search (existing CRM lookup by WA).
     - DP amount input (> 0, < agreed_price).
     - Agreed price input (> DP amount).
     - Refundable toggle (default true) with explanation text.
     - Expiry date picker (default +30 days, min +1 day, max configurable).
   - Submit → calls `POST /api/reservations`.
   - On success: close modal, refresh unit detail (unit status now `Dipesan`).

4. **Sale flow hardening — `/api/sales` rejects `Dipesan`:**
   - The existing "Jual" button on unit detail is **hidden** when unit status is `Dipesan` — completion happens exclusively through the reservation section.
   - `POST /api/sales` route adds an early 400 guard if unit status is `Dipesan` (already in Task 3 API above).
   - The sale-form component is unaffected for non-reserved units (Ready/Listed).

5. **Navigation:** Add "Reservasi" link to MobileDrawer and AppSidebar for admin/owner roles.

### Task 5: Verify and deploy

**Files:**
- Modify after successful deployment: `SPEC.md`, `FSD.md`, `TODO.md`, `HANDOFF.md`

1. Run verification commands:
   ```
   npm run test:db              # PGlite tests pass (RED→GREEN tasks 1-2)
   npx tsc --noEmit             # TypeScript strict no errors
   npm run build                # Next.js production build succeeds
   ```

2. Apply migration `202607260001_dp_reservation.sql` to Supabase production. Verify migration history matches local.

3. Deploy to Vercel production. Smoke-test:
    - Create a reservation from unit detail (unit status → `Dipesan`, finance entry `Uang Muka Reservasi` +dp created).
    - Complete reservation with full F-SLS-02 test data: verify DP reversal (−dp, same category, linked reversal), then `create_sale` at full `agreed_price` journals +full sale and starts warranty. Net finance = full agreed_price. Unit → `Terjual`, reservation → `Selesai`.
    - Verify full `agreed_price` appears as revenue in sales report (not just remaining balance).
    - Test ordinary `POST /api/sales` on a `Dipesan` unit → 400 rejected.
    - Test refund flow on a refundable reservation (owner only, cash-out reversal of DP created, unit back to Listed).
    - Test forfeit flow on a non-refundable reservation (unit back to Listed, no cash entry, reservation status = Hangus).
    - Verify expiry blocks completion but does not auto-resolve.
    - Verify one DP per unit enforced.
    - Verify non-refundable cannot be refunded and refundable cannot be forfeited.
    - Do not mutate real business data where no safe fixture exists.

4. Only after deployment succeeds:
   - Add reservation schema to `SPEC.md` §3 (new subsection).
   - Add API routes to `SPEC.md` §5.
   - Add DP reservation flow to `FSD.md` as new functional section (F-RSV-01 through F-RSV-04).
   - Document the completed phase, exact migration number, test evidence, and review steps in `TODO.md` and `HANDOFF.md`.
   - Synchronize FSD/SPEC contracts with implemented behavior.
