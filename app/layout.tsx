
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BJ Stock",
  description: "Sistem operasional BJ Laptop",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
