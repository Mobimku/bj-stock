import fs from 'fs';

const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!token) throw new Error('SUPABASE_ACCESS_TOKEN is required');
const ref = 'ksecrddwowrswfcbdknf';

async function runQuery(sql) {
  const r = await fetch('https://api.supabase.com/v1/projects/' + ref + '/database/query', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  const text = await r.text();
  if (!r.ok) { console.error('Query failed:', text.substring(0, 500)); throw new Error('Query failed'); }
  return JSON.parse(text);
}

// Step 1: Get all functions that have 'is distinct from \\'admin\\'' in their body
const funcList = await runQuery(`
  SELECT p.proname,
         pg_get_functiondef(p.oid) AS definition
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.prokind = 'f'
    AND pg_get_functiondef(p.oid) LIKE '%is distinct from ''admin''%'
  ORDER BY p.proname;
`);

console.log('Functions to patch:', funcList.length);
for (const f of funcList) {
  console.log('  -', f.proname);
}

// Step 2: Extract definitions, patch them
function patchDefinition(def) {
  // Pattern 1: public.current_user_role() is distinct from 'admin'
  // → public.current_user_role() not in ('admin', 'owner')
  let patched = def.replace(
    /public\.current_user_role\(\) is distinct from 'admin'/g,
    "public.current_user_role() not in ('admin', 'owner')"
  );

  // Pattern 2: app_role is distinct from 'admin' and app_role is distinct from 'teknisi'
  // → app_role not in ('admin', 'teknisi', 'owner')
  patched = patched.replace(
    /app_role is distinct from 'admin' and app_role is distinct from 'teknisi'/g,
    "app_role not in ('admin', 'teknisi', 'owner')"
  );

  // Pattern 3: app_role is distinct from 'admin' (standalone in service context)
  // → app_role not in ('admin', 'owner')
  patched = patched.replace(
    /app_role is distinct from 'admin'(?! and app_role is distinct from 'teknisi')/g,
    "app_role not in ('admin', 'owner')"
  );

  return patched;
}

// Step 3: Apply each patched definition
let success = 0;
let failed = 0;
for (const f of funcList) {
  const definition = patchDefinition(f.definition);
  if (definition === f.definition) {
    console.log('  SKIP (no change):', f.proname);
    continue;
  }
  try {
    // Need to drop first if parameter names changed, but CREATE OR REPLACE works for same sig
    await runQuery(definition);
    console.log('  OK:', f.proname);
    success++;
  } catch (e) {
    console.log('  FAIL:', f.proname, e.message);
    failed++;
    // Try with DROP first fallback
    const dropMatch = f.definition.match(/create or replace function public\.(\w+)/);
    if (dropMatch) {
      try {
        await runQuery('DROP FUNCTION IF EXISTS public.' + dropMatch[1] + ' CASCADE');
        await runQuery(definition);
        console.log('  OK (after drop):', f.proname);
        success++;
        failed--;
      } catch (e2) {
        console.log('  FAIL (after drop):', f.proname, e2.message);
      }
    }
  }
}

console.log(`\nPatch complete: ${success} succeeded, ${failed} failed`);
