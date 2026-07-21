import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Supabase client with service_role key for admin-level operations.
 * Use ONLY for server-side operations that need elevated privileges
 * (user management, bypassing RLS for audit log inserts, etc.)
 * NEVER expose this client or its key to the browser.
 */
export async function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY belum diisi di environment.");
  }

  const cookieStore = await cookies();

  return createServerClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: () => {},
    },
  });
}