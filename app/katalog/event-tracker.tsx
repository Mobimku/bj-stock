"use client";

import { useEffect, type ReactNode } from "react";
import { getOrCaptureTrafficSource } from "@/lib/catalog-traffic-source";

const SESSION_STORAGE_KEY = "bj-catalog-anonymous-session-id";
const emittedEvents = new Set<string>();

type CatalogEvent =
  | { readonly eventType: "catalog_view" }
  | { readonly eventType: "detail_view"; readonly idUnit: string }
  | { readonly eventType: "whatsapp_click"; readonly idUnit: string }
  | { readonly eventType: "share_click"; readonly idUnit: string };

function eventKey(event: CatalogEvent): string {
  switch (event.eventType) {
    case "catalog_view":
      return event.eventType;
    case "detail_view":
    case "whatsapp_click":
    case "share_click":
      return `${event.eventType}:${event.idUnit}`;
  }
}

export function recordCatalogEvent(event: CatalogEvent): void {
  const key = eventKey(event);
  if (emittedEvents.has(key)) return;
  emittedEvents.add(key);

  let sessionId = localStorage.getItem(SESSION_STORAGE_KEY);
  if (!sessionId) {
    sessionId = crypto.randomUUID();
    localStorage.setItem(SESSION_STORAGE_KEY, sessionId);
  }

  const trafficSource = getOrCaptureTrafficSource();
  const body = JSON.stringify({ ...event, sessionId, trafficSource });
  if (typeof navigator.sendBeacon === "function") {
    const queued = navigator.sendBeacon(
      "/api/catalog/events",
      new Blob([body], { type: "application/json" }),
    );
    if (queued) return;
  }

  void fetch("/api/catalog/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  }).then(undefined, () => undefined);
}

export function CatalogViewTracker() {
  useEffect(() => recordCatalogEvent({ eventType: "catalog_view" }), []);
  return null;
}

export function CatalogDetailTracker({ idUnit }: { readonly idUnit: string }) {
  useEffect(() => recordCatalogEvent({ eventType: "detail_view", idUnit }), [idUnit]);
  return null;
}

export function CatalogWhatsAppLink({
  href,
  idUnit,
  children,
}: {
  readonly href: string;
  readonly idUnit: string;
  readonly children: ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => recordCatalogEvent({ eventType: "whatsapp_click", idUnit })}
      className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#198929] px-5 py-3.5 text-sm font-bold text-white transition-colors hover:bg-[#147522]"
    >
      {children}
    </a>
  );
}
