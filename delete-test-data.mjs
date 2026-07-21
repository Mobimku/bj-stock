const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!token) throw new Error('SUPABASE_ACCESS_TOKEN is required');
const ref = 'ksecrddwowrswfcbdknf';

async function runQuery(sql) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  const text = await r.text();
  if (!r.ok) { console.error('Query failed:', text.substring(0, 500)); throw new Error(text); }
  return JSON.parse(text);
}

// Step 1: Check data exists
console.log('=== Checking data ===');
const sales = await runQuery("SELECT id_invoice, id_unit, id_customer FROM sales WHERE id_invoice = 'INV-2607-001'");
console.log('Sales:', JSON.stringify(sales));
const unitId = sales[0]?.id_unit;
const custId = sales[0]?.id_customer;

const service = await runQuery("SELECT id_servis, id_unit, id_customer, status FROM service_orders WHERE id_servis = 'SVC-2607-001'");
console.log('Service:', JSON.stringify(service));

const customers = await runQuery("SELECT id_customer, nama FROM customers WHERE nama IN ('Customer Seed', 'Eko')");
console.log('Customers:', JSON.stringify(customers));

const warranty = await runQuery("SELECT id_garansi, status FROM warranty WHERE id_unit = '" + unitId + "'");
console.log('Warranty:', JSON.stringify(warranty));

// Step 2: Delete in order
console.log('\n=== Deleting data ===');

// service_part_log
let res = await runQuery("DELETE FROM service_part_log WHERE id_servis = 'SVC-2607-001' RETURNING id_log");
console.log('Deleted service_part_log:', res.length);

// warranty_claim
if (warranty.length > 0) {
  const ids = warranty.map(w => "'" + w.id_garansi + "'").join(',');
  res = await runQuery("DELETE FROM warranty_claim WHERE id_garansi IN (" + ids + ") RETURNING id_klaim");
  console.log('Deleted warranty_claim:', res.length);
}

// warranty
res = await runQuery("DELETE FROM warranty WHERE id_unit = '" + unitId + "' RETURNING id_garansi");
console.log('Deleted warranty:', res.length);

// service_orders
res = await runQuery("DELETE FROM service_orders WHERE id_servis = 'SVC-2607-001' RETURNING id_servis");
console.log('Deleted service_orders:', res.length);

// upgrade_log
res = await runQuery("DELETE FROM upgrade_log WHERE id_unit = '" + unitId + "' RETURNING id_log");
console.log('Deleted upgrade_log:', res.length);

// sales
res = await runQuery("DELETE FROM sales WHERE id_invoice = 'INV-2607-001' RETURNING id_invoice");
console.log('Deleted sales:', res.length);

// units (cascades to unit_spec_history)
res = await runQuery("DELETE FROM units WHERE id_unit = '" + unitId + "' RETURNING id_unit");
console.log('Deleted units:', res.length);

// customers
const custNames = customers.map(c => "'" + c.nama.replace(/'/g, "''") + "'").join(',');
res = await runQuery("DELETE FROM customers WHERE nama IN (" + custNames + ") RETURNING id_customer, nama");
console.log('Deleted customers:', JSON.stringify(res));

console.log('\n✅ Deletion complete');
