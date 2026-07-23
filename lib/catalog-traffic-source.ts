/**
 * Classify catalog traffic into short, non-PII labels.
 * Never store raw URLs — only labels like "google", "instagram", "utm:ads", "direct".
 */

const KNOWN_HOSTS: ReadonlyArray<readonly [RegExp, string]> = [
  [/(^|\.)google\./i, "google"],
  [/(^|\.)bing\./i, "bing"],
  [/(^|\.)yahoo\./i, "yahoo"],
  [/(^|\.)duckduckgo\./i, "duckduckgo"],
  [/(^|\.)instagram\./i, "instagram"],
  [/(^|\.)facebook\./i, "facebook"],
  [/(^|\.)fb\./i, "facebook"],
  [/(^|\.)tiktok\./i, "tiktok"],
  [/(^|\.)youtube\./i, "youtube"],
  [/(^|\.)youtu\.be$/i, "youtube"],
  [/(^|\.)twitter\./i, "x"],
  [/(^|\.)x\.com$/i, "x"],
  [/(^|\.)t\.co$/i, "x"],
  [/(^|\.)wa\.me$/i, "whatsapp"],
  [/(^|\.)whatsapp\./i, "whatsapp"],
  [/(^|\.)telegram\./i, "telegram"],
  [/(^|\.)t\.me$/i, "telegram"],
  [/(^|\.)shopee\./i, "shopee"],
  [/(^|\.)tokopedia\./i, "tokopedia"],
  [/(^|\.)lazada\./i, "lazada"],
];

function sanitizeLabel(raw: string): string {
  const cleaned = raw
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9._:-]/g, "")
    .replace(/^[^a-z0-9]+/, "")
    .slice(0, 48);
  return cleaned || "direct";
}

function hostFromReferrer(referrer: string): string | null {
  try {
    const host = new URL(referrer).hostname.replace(/^www\./i, "");
    return host || null;
  } catch {
    return null;
  }
}

function classifyHost(host: string): string {
  for (const [pattern, label] of KNOWN_HOSTS) {
    if (pattern.test(host)) return label;
  }
  // collapse multi-level host to last two labels when possible
  const parts = host.toLowerCase().split(".").filter(Boolean);
  if (parts.length >= 2) {
    return sanitizeLabel(parts.slice(-2).join("."));
  }
  return sanitizeLabel(host);
}

/** Resolve traffic source from UTM params and document.referrer. */
export function classifyTrafficSource(
  search: string = typeof window !== "undefined" ? window.location.search : "",
  referrer: string = typeof document !== "undefined" ? document.referrer : "",
): string {
  try {
    const params = new URLSearchParams(search.startsWith("?") ? search : `?${search}`);
    const utmSource = params.get("utm_source")?.trim();
    if (utmSource) {
      const medium = params.get("utm_medium")?.trim();
      const campaign = params.get("utm_campaign")?.trim();
      // Prefer compact utm labels: utm:instagram or utm:google-cpc
      const parts = [utmSource, medium, campaign].filter(Boolean).map((p) => p!.toLowerCase());
      return sanitizeLabel(`utm:${parts.join("-").slice(0, 40)}`);
    }

    // Common share/ad aliases without full UTM
    const src = params.get("src") ?? params.get("source") ?? params.get("ref");
    if (src?.trim()) {
      return sanitizeLabel(src.trim());
    }

    if (!referrer) return "direct";

    const host = hostFromReferrer(referrer);
    if (!host) return "direct";

    // Same-site navigation (katalog → detail) is not an external source
    if (typeof window !== "undefined") {
      const selfHost = window.location.hostname.replace(/^www\./i, "");
      if (host === selfHost) return "direct";
    }

    return classifyHost(host);
  } catch {
    return "direct";
  }
}

const SOURCE_STORAGE_KEY = "bj-catalog-traffic-source";

/** Stable source for this browser tab/session (first capture wins). */
export function getOrCaptureTrafficSource(): string {
  if (typeof sessionStorage === "undefined") {
    return classifyTrafficSource();
  }
  const existing = sessionStorage.getItem(SOURCE_STORAGE_KEY);
  if (existing && /^[a-z0-9][a-z0-9._:-]{0,47}$/.test(existing)) {
    return existing;
  }
  const next = classifyTrafficSource();
  sessionStorage.setItem(SOURCE_STORAGE_KEY, next);
  return next;
}
