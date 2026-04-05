"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "../../components/ui/button";
import { DASHBOARD_MOCK } from "../../constants";
import { apiFetch } from "../../lib/api";
import { getMockFinanceDashboard } from "../../lib/dashboardMockData";
import { useSession } from "../../hooks/useSession";

type RevenuePoint = { period?: string; amount_cents?: number };
type RevenueData = { total_cents?: number; currency?: string; trend?: RevenuePoint[] };
type RegionRow = { region?: string; amount_cents?: number; transaction_count?: number };
type RegionsData = { regions?: RegionRow[]; currency?: string };
type CatRow = {
  package_slug?: string;
  net_amount_cents?: number;
  trip_count?: number;
  distinct_riders?: number;
  distinct_drivers?: number;
};
type CatsData = { categories?: CatRow[]; currency?: string };

function formatMoney(cents: number | undefined, currency = "usd") {
  if (cents == null) return "—";
  return `${currency.toUpperCase()} ${(cents / 100).toFixed(2)}`;
}

export default function DashboardPage() {
  const { session, ready, logout } = useSession();
  const [revenue, setRevenue] = useState<RevenueData | null>(null);
  const [regions, setRegions] = useState<RegionsData | null>(null);
  const [categories, setCategories] = useState<CatsData | null>(null);
  const [trendGranularity, setTrendGranularity] = useState<"day" | "month" | "year">("day");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!ready || !session) return;
    if (session.user.role !== "business" && session.user.role !== "admin") return;

    (async () => {
      if (DASHBOARD_MOCK) {
        const { revenue, regions, categories } = getMockFinanceDashboard(trendGranularity);
        setRevenue(revenue);
        setRegions(regions);
        setCategories(categories);
        setError("");
        return;
      }
      try {
        const q = `trend_granularity=${trendGranularity}`;
        const [r1, r2, r3] = await Promise.all([
          apiFetch(`/api/finance/dashboard/revenue?${q}`),
          apiFetch("/api/finance/dashboard/regions"),
          apiFetch("/api/finance/dashboard/categories"),
        ]);
        const b1 = await r1.json();
        const b2 = await r2.json();
        const b3 = await r3.json();
        if (!r1.ok) setError(b1?.error?.message || "Revenue failed");
        else setRevenue(b1.data);
        if (r2.ok) setRegions(b2.data);
        if (r3.ok) setCategories(b3.data);
      } catch {
        setError("Network error");
      }
    })();
  }, [ready, session, trendGranularity]);

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-500">Loading…</div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <p className="text-slate-600">Sign in with a business account.</p>
        <Button asChild>
          <Link href="/login?next=/dashboard">Sign in</Link>
        </Button>
      </div>
    );
  }

  if (session.user.role !== "business" && session.user.role !== "admin") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <p className="text-slate-600">Dashboard is for business or admin roles.</p>
        <Button asChild variant="outline">
          <Link href="/">Home</Link>
        </Button>
      </div>
    );
  }

  const cur = revenue?.currency || "usd";
  const trend = revenue?.trend ?? [];
  const maxTrend = Math.max(1, ...trend.map((p) => p.amount_cents ?? 0));

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex justify-between items-center flex-wrap gap-2">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Finance dashboard</h1>
            <p className="text-sm text-slate-500">{session.user.email} · {session.user.role}</p>
            <p className="text-xs text-slate-400 mt-1">
              {DASHBOARD_MOCK ? (
                <span className="text-amber-700">Mock data (set NEXT_PUBLIC_DASHBOARD_MOCK=false for live API).</span>
              ) : (
                "Revenue counts rider payments once per trip (no double-count)."
              )}
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            {session.user.role === "admin" && (
              <Button variant="outline" asChild>
                <Link href="/admin">Admin</Link>
              </Button>
            )}
            <Button variant="outline" asChild>
              <Link href="/">Home</Link>
            </Button>
            <Button variant="ghost" onClick={() => { logout(); window.location.href = "/"; }}>
              Sign out
            </Button>
          </div>
        </div>

        {error && <p className="text-red-600 text-sm">{error}</p>}

        <section className="bg-white rounded-xl border border-slate-200 p-4">
          <h2 className="font-medium text-slate-800 mb-1">Global revenue</h2>
          <p className="text-3xl font-semibold text-slate-900">{formatMoney(revenue?.total_cents, cur)}</p>
          <div className="flex gap-2 mt-4 mb-2">
            {(["day", "month", "year"] as const).map((g) => (
              <Button
                key={g}
                type="button"
                size="sm"
                variant={trendGranularity === g ? "default" : "outline"}
                onClick={() => setTrendGranularity(g)}
              >
                {g}
              </Button>
            ))}
          </div>
          {trend.length === 0 ? (
            <p className="text-sm text-slate-500">No trend points yet.</p>
          ) : (
            <div className="flex items-end gap-1 h-44 border-b border-slate-200 pb-1 mt-2">
              {trend.map((p) => (
                <div key={p.period} className="flex-1 min-w-0 flex flex-col items-center gap-1">
                  <div
                    className="w-full max-w-[20px] mx-auto rounded-t bg-sky-600/90"
                    style={{ height: `${(100 * (p.amount_cents ?? 0)) / maxTrend}%`, minHeight: "4px" }}
                    title={`${p.period}: ${formatMoney(p.amount_cents, cur)}`}
                  />
                  <span className="text-[9px] text-slate-400 truncate w-full text-center leading-tight">{p.period}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="bg-white rounded-xl border border-slate-200 p-4 overflow-x-auto">
          <h2 className="font-medium text-slate-800 mb-3">Regional analytics</h2>
          <table className="w-full text-sm">
            <thead className="text-left text-slate-600 border-b">
              <tr>
                <th className="py-2 pr-4">Region</th>
                <th className="py-2 pr-4">Amount</th>
                <th className="py-2">Trips</th>
              </tr>
            </thead>
            <tbody>
              {(regions?.regions ?? []).length === 0 && (
                <tr>
                  <td colSpan={3} className="py-6 text-slate-500">No regional data.</td>
                </tr>
              )}
              {(regions?.regions ?? []).map((row) => (
                <tr key={row.region} className="border-t border-slate-100">
                  <td className="py-2 pr-4 font-mono text-xs">{row.region || "—"}</td>
                  <td className="py-2 pr-4">{formatMoney(row.amount_cents, regions?.currency || cur)}</td>
                  <td className="py-2">{row.transaction_count ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="bg-white rounded-xl border border-slate-200 p-4 overflow-x-auto">
          <h2 className="font-medium text-slate-800 mb-3">Category insights (by package)</h2>
          <table className="w-full text-sm">
            <thead className="text-left text-slate-600 border-b">
              <tr>
                <th className="py-2 pr-3">Package</th>
                <th className="py-2 pr-3">Net</th>
                <th className="py-2 pr-3">Trips</th>
                <th className="py-2 pr-3">Riders</th>
                <th className="py-2">Drivers</th>
              </tr>
            </thead>
            <tbody>
              {(categories?.categories ?? []).length === 0 && (
                <tr>
                  <td colSpan={5} className="py-6 text-slate-500">No category data.</td>
                </tr>
              )}
              {(categories?.categories ?? []).map((row) => (
                <tr key={row.package_slug || "empty"} className="border-t border-slate-100">
                  <td className="py-2 pr-3">{row.package_slug || "(unknown)"}</td>
                  <td className="py-2 pr-3">{formatMoney(row.net_amount_cents, categories?.currency || cur)}</td>
                  <td className="py-2 pr-3">{row.trip_count ?? "—"}</td>
                  <td className="py-2 pr-3">{row.distinct_riders ?? "—"}</td>
                  <td className="py-2">{row.distinct_drivers ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  );
}
