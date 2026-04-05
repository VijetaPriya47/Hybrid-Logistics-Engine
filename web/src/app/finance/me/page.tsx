"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "../../../components/ui/button";
import { apiFetch } from "../../../lib/api";
import { useSession } from "../../../hooks/useSession";

type RideRow = {
  trip_id?: string;
  role?: string;
  status?: string;
  when_rfc3339?: string;
  fare_total_cents?: number;
  package_slug?: string;
  other_party_label?: string;
};

type AmountPoint = { period?: string; amount_cents?: number };
type LedgerTx = {
  type?: string;
  amount_cents?: number;
  currency?: string;
  created_at_rfc3339?: string;
  source_trip_id?: string;
  package_slug?: string;
};

type Summary = {
  total_income_cents?: number;
  total_expense_cents?: number;
  net_cents?: number;
  currency?: string;
  earning_series?: AmountPoint[];
  recent?: LedgerTx[];
};

function formatMoney(cents: number | undefined, currency = "usd") {
  if (cents == null) return "—";
  const v = (cents / 100).toFixed(2);
  return `${currency.toUpperCase()} ${v}`;
}

export default function FinanceMePage() {
  const { session, ready, logout } = useSession();
  const [rows, setRows] = useState<RideRow[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [seriesGranularity, setSeriesGranularity] = useState<"day" | "month">("day");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!ready || !session || session.user.role !== "customer") return;
    (async () => {
      const [histRes, sumRes] = await Promise.all([
        apiFetch("/api/trips/history"),
        apiFetch(`/api/finance/me/summary?series_granularity=${seriesGranularity}`),
      ]);
      const histBody = await histRes.json();
      let errMsg = "";
      if (!histRes.ok) {
        errMsg = histBody?.error?.message || "Failed to load history";
      } else {
        const data = histBody.data;
        const entries = data?.entries ?? data?.Entries ?? [];
        setRows(Array.isArray(entries) ? entries : []);
      }
      const sumBody = await sumRes.json();
      if (!sumRes.ok) {
        errMsg = errMsg || sumBody?.error?.message || "Failed to load summary";
      } else {
        setSummary(sumBody.data ?? null);
      }
      setError(errMsg);
    })();
  }, [ready, session, seriesGranularity]);

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-500">Loading…</div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <p className="text-slate-600">Sign in as a rider to view your finances.</p>
        <Button asChild>
          <Link href="/login?next=/finance/me">Sign in</Link>
        </Button>
      </div>
    );
  }

  if (session.user.role !== "customer") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <p className="text-slate-600">This page is for customer accounts.</p>
        <Button asChild variant="outline">
          <Link href="/">Home</Link>
        </Button>
      </div>
    );
  }

  const cur = summary?.currency || "usd";
  const series = summary?.earning_series ?? [];
  const maxEarn = Math.max(1, ...series.map((p) => p.amount_cents ?? 0));

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex justify-between items-center flex-wrap gap-2">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">My finances</h1>
            <p className="text-sm text-slate-500">{session.user.email}</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" asChild>
              <Link href="/">Home</Link>
            </Button>
            <Button variant="ghost" onClick={() => { logout(); window.location.href = "/"; }}>
              Sign out
            </Button>
          </div>
        </div>

        {error && <p className="text-red-600 text-sm">{error}</p>}

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Total income</p>
            <p className="text-2xl font-semibold text-emerald-700 mt-1">
              +{formatMoney(summary?.total_income_cents, cur)}
            </p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Total expenses</p>
            <p className="text-2xl font-semibold text-red-600 mt-1">
              −{formatMoney(summary?.total_expense_cents, cur)}
            </p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Net balance</p>
            <p className={`text-2xl font-semibold mt-1 ${(summary?.net_cents ?? 0) >= 0 ? "text-slate-900" : "text-red-700"}`}>
              {(summary?.net_cents ?? 0) >= 0 ? "+" : "−"}
              {formatMoney(Math.abs(summary?.net_cents ?? 0), cur)}
            </p>
          </div>
        </div>

        <section className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex justify-between items-center mb-3 flex-wrap gap-2">
            <h2 className="font-medium text-slate-800">Earnings by {seriesGranularity}</h2>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={seriesGranularity === "day" ? "default" : "outline"}
                size="sm"
                onClick={() => setSeriesGranularity("day")}
              >
                Day
              </Button>
              <Button
                type="button"
                variant={seriesGranularity === "month" ? "default" : "outline"}
                size="sm"
                onClick={() => setSeriesGranularity("month")}
              >
                Month
              </Button>
            </div>
          </div>
          {series.length === 0 ? (
            <p className="text-sm text-slate-500">No earning data yet (driver credits appear after paid trips).</p>
          ) : (
            <div className="flex items-end gap-1 h-40 border-b border-slate-200 pb-1">
              {series.map((p) => (
                <div key={p.period} className="flex-1 min-w-0 flex flex-col items-center gap-1">
                  <div
                    className="w-full max-w-[28px] mx-auto rounded-t bg-emerald-500/90"
                    style={{ height: `${(100 * (p.amount_cents ?? 0)) / maxEarn}%`, minHeight: "4px" }}
                    title={`${p.period}: ${formatMoney(p.amount_cents, cur)}`}
                  />
                  <span className="text-[10px] text-slate-400 truncate w-full text-center">{p.period}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="bg-white rounded-xl border border-slate-200 p-4">
          <h2 className="font-medium text-slate-800 mb-3">Recent activity</h2>
          <ul className="divide-y divide-slate-100">
            {(summary?.recent ?? []).length === 0 && (
              <li className="py-6 text-center text-slate-500 text-sm">No ledger entries yet.</li>
            )}
            {(summary?.recent ?? []).map((t, i) => {
              const isCredit = t.type === "credit";
              const sign = isCredit ? "+" : "−";
              const color = isCredit ? "text-emerald-700" : "text-red-600";
              return (
                <li key={`${t.source_trip_id}-${i}`} className="py-3 flex justify-between gap-4 text-sm">
                  <div>
                    <p className="text-slate-800 capitalize">{t.type || "—"}</p>
                    <p className="text-xs text-slate-500 font-mono">{t.created_at_rfc3339 || "—"}</p>
                    {t.package_slug ? <p className="text-xs text-slate-500">Package: {t.package_slug}</p> : null}
                    {t.source_trip_id ? <p className="text-xs text-slate-400 font-mono truncate max-w-[220px]">{t.source_trip_id}</p> : null}
                  </div>
                  <span className={`font-semibold tabular-nums shrink-0 ${color}`}>
                    {sign}{formatMoney(t.amount_cents, t.currency || cur)}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-medium text-slate-900 mb-2">Ride history</h2>
          <p className="text-xs text-slate-500 mb-3">
            Trips you booked as a rider and trips you accepted as a driver (any status).
          </p>
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-100 text-left text-slate-600">
                <tr>
                  <th className="p-3">When</th>
                  <th className="p-3">Role</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Package</th>
                  <th className="p-3">Fare</th>
                  <th className="p-3">Details</th>
                  <th className="p-3">Trip ID</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-slate-500">
                      No rides yet.
                    </td>
                  </tr>
                )}
                {rows.map((t) => (
                  <tr key={t.trip_id || Math.random()} className="border-t border-slate-100">
                    <td className="p-3 whitespace-nowrap">{t.when_rfc3339 || "—"}</td>
                    <td className="p-3 capitalize">{t.role || "—"}</td>
                    <td className="p-3 capitalize">{t.status || "—"}</td>
                    <td className="p-3">{t.package_slug || "—"}</td>
                    <td className="p-3">
                      {t.fare_total_cents != null ? `${(t.fare_total_cents / 100).toFixed(2)}` : "—"}
                    </td>
                    <td className="p-3 text-slate-600 max-w-[200px] truncate" title={t.other_party_label}>
                      {t.other_party_label || "—"}
                    </td>
                    <td className="p-3 font-mono text-xs">{t.trip_id || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
