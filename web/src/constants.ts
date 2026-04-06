const DEFAULT_API_URL = "http://localhost:8081";

/** Trailing slash or `/api` on NEXT_PUBLIC_API_URL would produce `//api/...` and break gateway public paths. */
function normalizeGatewayBase(raw: string | undefined): string {
  if (raw == null || raw.trim() === "") {
    return DEFAULT_API_URL;
  }
  let s = raw.trim();
  while (s.endsWith("/")) {
    s = s.slice(0, -1);
  }
  if (s.endsWith("/api")) {
    s = s.slice(0, -4);
    while (s.endsWith("/")) {
      s = s.slice(0, -1);
    }
  }
  return s.length > 0 ? s : DEFAULT_API_URL;
}

export const API_URL = normalizeGatewayBase(process.env.NEXT_PUBLIC_API_URL);

const getWsUrl = () => {
  const explicit = process.env.NEXT_PUBLIC_WEBSOCKET_URL?.trim();
  if (explicit) {
    let w = explicit;
    while (w.endsWith("/")) {
      w = w.slice(0, -1);
    }
    return w.endsWith("/ws") ? w : `${w}/ws`;
  }

  const base = API_URL.replace(/^http/, "ws");
  return base.endsWith("/ws") ? base : `${base}/ws`;
};

export const WEBSOCKET_URL = getWsUrl();

function envTruthy(raw: string | undefined): boolean {
  if (raw == null || raw.trim() === "") return false;
  const s = raw.trim().toLowerCase();
  return s === "true" || s === "1" || s === "yes" || s === "on";
}

/** When set, `/dashboard` and admin finance overview use sample data only (no gateway finance calls). Baked in at Next build time. */
export const DASHBOARD_MOCK = envTruthy(process.env.NEXT_PUBLIC_DASHBOARD_MOCK);

/**
 * When set, after a successful API response, if revenue/regions/categories are all empty (no ledger yet),
 * the UI fills charts with the same sample data. Useful on Railway when webhooks have not posted payments.
 */
export const DASHBOARD_FALLBACK_MOCK = envTruthy(process.env.NEXT_PUBLIC_DASHBOARD_FALLBACK_MOCK);
