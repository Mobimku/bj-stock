import { redirect } from "next/navigation";
import { z } from "zod";

export default async function ReservationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const status = typeof params.status === "string" ? params.status : "";
  const validStatus = z.enum(["Dipesan", "Selesai", "Dibatalkan", "Hangus"]).safeParse(status).data;
  const qs = validStatus ? `?view=reservations&status=${validStatus}` : "?view=reservations";
  redirect(`/sales${qs}`);
}
