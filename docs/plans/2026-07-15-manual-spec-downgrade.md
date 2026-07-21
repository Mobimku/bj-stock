# Manual Specification Downgrade Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:test-driven-development and execute each task in order.

**Goal:** Add a manual Upgrade Log downgrade event that atomically updates `spek_saat_ini` and subtracts a positive amount from `units.total_modal`, without changing Bank Stock or creating Finance cash flow.

**Architecture:** Extend `upgrade_log` with an explicit `jenis` discriminator (`part`, `service`, `downgrade`) and optional `spek_setelah`. Keep `biaya` non-negative; PostgreSQL applies the sign with a `CASE` expression. A single security-definer RPC locks the unit, validates role/status/amount, inserts the downgrade event, and updates current specs in one transaction.

**Tech Stack:** PostgreSQL/Supabase migrations and RPC, PGlite regression tests, Next.js App Router, TypeScript, Zod, React/Tailwind.

---

### Task 1: Write the failing database contract test

**Files:**
- Modify: `supabase/tests/initial-migration.test.mjs`

1. Load migration `202607150005_manual_spec_downgrade.sql` after existing migrations.
2. Add assertions for `add_unit_downgrade(unit, 200000, new_spec, date, notes)`:
   - `upgrade_log.jenis = 'downgrade'`, `biaya = 200000`, and `spek_setelah` is saved.
   - `units.total_modal` decreases by 200000 and `spek_saat_ini` changes atomically.
   - Bank Stock quantity and Finance transaction count do not change.
   - A reduction that would make `total_modal <= 0` is rejected and leaves specs/modal unchanged.
3. Run `node supabase/tests/initial-migration.test.mjs`; expected RED because the migration/RPC does not exist.

### Task 2: Implement the database migration

**Files:**
- Create: `supabase/migrations/202607150005_manual_spec_downgrade.sql`
- Modify: `supabase/seed.sql`

1. Add `upgrade_log.jenis` and `spek_setelah`; backfill existing rows from `id_part`, then enforce constraints.
2. Replace `add_unit_upgrade` so new rows are explicitly `part` or `service`.
3. Replace `recalculate_unit_modal` and `set_unit_derived_fields` with `SUM(CASE WHEN jenis='downgrade' THEN -biaya ELSE biaya END)`.
4. Replace `journal_external_upgrade` so only `jenis='service'` creates/reverses Finance transactions.
5. Add `add_unit_downgrade` with centralized role validation, row lock, mutable-stock status guard, positive amount/new-spec validation, and a projected-total check above zero.
6. Update seed insert with `jenis='part'`.
7. Re-run the focused PGlite test; expected GREEN.

### Task 3: Add server validation and API dispatch

**Files:**
- Modify: `lib/validation/upgrade.ts`
- Modify: `app/api/units/[id]/upgrade/route.ts`

1. Add a `downgrade` branch requiring `cost > 0` and non-empty `currentSpecs` (max 2000).
2. Dispatch downgrade requests to `add_unit_downgrade`; retain `add_unit_upgrade` for part/service.
3. Map PostgreSQL validation failures to HTTP 400 and preserve 401/403/500 behavior.

### Task 4: Add the third form mode and history rendering

**Files:**
- Modify: `app/(dashboard)/units/[id]/upgrade-form.tsx`
- Modify: `app/(dashboard)/units/[id]/page.tsx`
- Modify: `app/api/units/[id]/route.ts`
- Modify: `lib/validation/unit.ts`

1. Add select option `Downgrade spek (kurangi modal)`.
2. Show fields for positive modal reduction and full current specs after downgrade; show that Bank Stock is not changed automatically.
3. Select/render `jenis` and `spek_setelah`; display downgrade amount with a minus sign and a distinct label.
4. Keep **Lepas part** available only for `jenis='part'` rows.

### Task 5: Verify and deploy

**Files:**
- Modify after successful deployment: `FSD.md`, `SPEC.md`, `TODO.md`, `HANDOFF.md`

1. Run `npm run test:db`, `npx tsc --noEmit`, `npm run build`, and `git diff --check`.
2. Apply migrations `202607150005` and null-safe auth correction `202607150006` to Supabase production and verify local/remote migration history.
3. Deploy Vercel production and smoke-test authenticated API/UI without mutating real business data where no safe fixture exists.
4. Only after deployment succeeds, document the completed phase, exact deployment, test evidence, and review steps in `TODO.md` and `HANDOFF.md`; synchronize FSD/SPEC contracts.

**Implemented:** Supabase migrations `202607150005`–`202607150006` and Vercel deployment `bj-stock-q8t9ulfuq-mobimku-1297s-projects.vercel.app` are live. Production smoke passed without creating a downgrade transaction.
