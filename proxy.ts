import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (values) => {
        values.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        values.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });
  const { data } = await supabase.auth.getUser();
  const role = data.user?.app_metadata.role;

  if (!data.user || (role !== "admin" && role !== "teknisi" && role !== "owner")) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return response;
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/units/:path*",
    "/bank-stock/:path*",
    "/sales/:path*",
    "/warranty/:path*",
    "/service/:path*",
    "/customers/:path*",
    "/scan/:path*",
    "/finance/:path*",
    "/reports/:path*",
    "/export/:path*",
    "/help/:path*",
    "/settings/:path*",
  ],
};
