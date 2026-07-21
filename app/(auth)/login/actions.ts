"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(8),
});

export type LoginState = { error?: string; success?: boolean };

export async function login(
  _previousState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const result = loginSchema.safeParse(Object.fromEntries(formData));

  if (!result.success) {
    return { error: "Email atau password tidak valid." };
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.signInWithPassword(result.data);
    const role = data.user?.app_metadata.role;

    if (error || (role !== "admin" && role !== "teknisi" && role !== "owner")) {
      if (data.session) await supabase.auth.signOut();
      return { error: "Akun tidak terdaftar sebagai admin, teknisi, atau owner." };
    }

    // ponytail: client-side redirect (useRouter) avoids session-cookie-on-redirect race
    return { success: true };
  } catch {
    return { error: "Login gagal. Periksa konfigurasi dan coba lagi." };
  }
}
