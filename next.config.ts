import type { NextConfig } from "next";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://ksecrddwowrswfcbdknf.supabase.co";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [new URL("/storage/v1/object/public/unit-photos/**", SUPABASE_URL)],
  },
};

export default nextConfig;
