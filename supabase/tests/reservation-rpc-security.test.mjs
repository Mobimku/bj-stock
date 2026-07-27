import assert from "node:assert/strict";
import { createReservationTestDatabase, CUSTOMER_ID, setActor } from "./reservation-harness.mjs";
import { createReservation } from "./reservation-fixtures.mjs";

const db = await createReservationTestDatabase();
await setActor(db, "admin");

const functions = await db.query(`
  select
    pg_get_function_identity_arguments(p.oid) arguments,
    p.prosecdef security_definer,
    coalesce(array_to_string(p.proconfig, ','), '') function_config
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='create_reservation'
  order by cardinality(p.proargtypes)
`);
assert.equal(functions.rows.length, 2);
for (const fn of functions.rows) {
  assert.equal(fn.security_definer, true);
  assert.equal(fn.function_config, "search_path=\"\"");
}

const signatures = [
  "public.create_reservation(uuid,text,uuid,numeric,numeric,boolean,timestamptz)",
  "public.create_reservation(uuid,text,uuid,text,text,text,text,numeric,numeric,boolean,timestamptz)",
];
for (const signature of signatures) {
  const privileges = await db.query(`
    select
      has_function_privilege('public', $1, 'EXECUTE') public_execute,
      has_function_privilege('anon', $1, 'EXECUTE') anon_execute,
      has_function_privilege('authenticated', $1, 'EXECUTE') authenticated_execute
  `, [signature]);
  assert.deepEqual(privileges.rows[0], {
    public_execute: false,
    anon_execute: false,
    authenticated_execute: true,
  });
}

const legacy = await createReservation(db, { unitId: "UNIT-RSV-01" });
assert.equal(legacy.rows[0].id_customer, CUSTOMER_ID);
assert.equal(legacy.rows[0].status, "Dipesan");

await db.close();
console.log("reservation RPC overload security and legacy-call contracts OK");
