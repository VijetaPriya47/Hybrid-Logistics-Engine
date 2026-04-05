"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { API_URL } from "../../constants";
import { apiFetch } from "../../lib/api";
import { useSession } from "../../hooks/useSession";

type AuditEntry = {
  id?: string;
  ts_rfc3339?: string;
  method?: string;
  path?: string;
  actor_user_id?: string;
  role?: string;
  ip?: string;
  detail_json?: string;
};

type BusinessRow = {
  id?: string;
  email?: string;
  is_active?: boolean;
  created_by_admin_email?: string;
  created_at_rfc3339?: string;
};

type LedgerRow = {
  id?: string;
  user_id?: string;
  user_email?: string;
  amount_cents?: number;
  currency?: string;
  type?: string;
  region?: string;
  source_trip_id?: string;
  package_slug?: string;
  created_at_rfc3339?: string;
};

type RevenueData = { total_cents?: number; currency?: string };
type RegionsData = { regions?: { region?: string; amount_cents?: number }[]; currency?: string };
type CatsData = { categories?: { package_slug?: string; net_amount_cents?: number }[]; currency?: string };

function formatMoney(cents: number | undefined, currency = "usd") {
  if (cents == null) return "—";
  return `${currency.toUpperCase()} ${(cents / 100).toFixed(2)}`;
}

export default function AdminPage() {
  const { session, ready, logout } = useSession();
  const [logs, setLogs] = useState<{ entries?: AuditEntry[] } | null>(null);
  const [logError, setLogError] = useState("");
  const [bizUsers, setBizUsers] = useState<BusinessRow[]>([]);
  const [revenue, setRevenue] = useState<RevenueData | null>(null);
  const [regions, setRegions] = useState<RegionsData | null>(null);
  const [categories, setCategories] = useState<CatsData | null>(null);
  const [dashErr, setDashErr] = useState("");
  const [ledgerRows, setLedgerRows] = useState<LedgerRow[]>([]);
  const [ledgerOffset, setLedgerOffset] = useState(0);
  const [ledgerPageSize, setLedgerPageSize] = useState(50);
  const [ledgerTotal, setLedgerTotal] = useState<number | null>(null);
  const [ledgerHasMore, setLedgerHasMore] = useState(false);
  const [txFilters, setTxFilters] = useState({
    user_id: "",
    trip_id: "",
    email: "",
    package: "",
    rider_user_id: "",
    driver_user_id: "",
  });
  const [bizEmail, setBizEmail] = useState("");
  const [bizPass, setBizPass] = useState("");
  const [admEmail, setAdmEmail] = useState("");
  const [admPass, setAdmPass] = useState("");
  const [canCreateAdmins, setCanCreateAdmins] = useState(false);
  const [canDeleteData, setCanDeleteData] = useState(false);
  const [msg, setMsg] = useState("");
  const [ledgerLoading, setLedgerLoading] = useState(false);

  const fetchLedger = useCallback(
    async (filters: typeof txFilters, offset: number, pageSize?: number) => {
      const lim = pageSize ?? ledgerPageSize;
      setLedgerLoading(true);
      try {
        const q = new URLSearchParams();
        q.set("limit", String(lim));
        q.set("offset", String(offset));
        const uid = filters.user_id.trim();
        const tid = filters.trip_id.trim();
        const em = filters.email.trim();
        const pkg = filters.package.trim();
        const rid = filters.rider_user_id.trim();
        const did = filters.driver_user_id.trim();
        if (uid) q.set("user_id", uid);
        if (tid) q.set("trip_id", tid);
        if (em) q.set("email", em);
        if (pkg) q.set("package", pkg);
        if (rid) q.set("rider_user_id", rid);
        if (did) q.set("driver_user_id", did);
        const res = await apiFetch(`/api/admin/transactions?${q.toString()}`);
        const body = await res.json();
        if (!res.ok) {
          setMsg(body?.error?.message || "Transactions failed");
          return;
        }
        const d = body.data;
        const rows = d?.rows ?? d?.Rows ?? [];
        setLedgerRows(Array.isArray(rows) ? rows : []);
        const tc = d?.total_count ?? d?.totalCount;
        const tn = Number(tc);
        setLedgerTotal(Number.isFinite(tn) ? tn : null);
        setLedgerHasMore(d?.has_more === true || d?.hasMore === true);
        setLedgerOffset(offset);
      } finally {
        setLedgerLoading(false);
      }
    },
    [ledgerPageSize],
  );

  const loadData = useCallback(async () => {
    if (!session || session.user.role !== "admin") return;
    const [logRes, bizRes, r1, r2, r3] = await Promise.all([
      apiFetch("/api/admin/system-logs?limit=100"),
      apiFetch("/api/admin/users/business"),
      apiFetch("/api/finance/dashboard/revenue?trend_granularity=month"),
      apiFetch("/api/finance/dashboard/regions"),
      apiFetch("/api/finance/dashboard/categories"),
    ]);
    const logBody = await logRes.json();
    if (!logRes.ok) setLogError(logBody?.error?.message || "Failed to load logs");
    else setLogs(logBody.data ?? null);

    const bizBody = await bizRes.json();
    if (bizRes.ok) {
      const u = bizBody.data?.users ?? bizBody.data?.Users ?? [];
      setBizUsers(Array.isArray(u) ? u : []);
    }

    const b1 = await r1.json();
    const b2 = await r2.json();
    const b3 = await r3.json();
    if (!r1.ok || !r2.ok || !r3.ok) {
      setDashErr(b1?.error?.message || b2?.error?.message || b3?.error?.message || "Dashboard load failed");
    } else {
      setDashErr("");
      setRevenue(b1.data);
      setRegions(b2.data);
      setCategories(b3.data);
    }
  }, [session]);

  useEffect(() => {
    if (!ready || !session || session.user.role !== "admin") return;
    void loadData();
    void fetchLedger(
      {
        user_id: "",
        trip_id: "",
        email: "",
        package: "",
        rider_user_id: "",
        driver_user_id: "",
      },
      0,
    );
  }, [ready, session, loadData, fetchLedger]);

  const loadLedger = () => {
    setMsg("");
    void fetchLedger(txFilters, 0);
  };

  const clearTxFilters = () => {
    setTxFilters({
      user_id: "",
      trip_id: "",
      email: "",
      package: "",
      rider_user_id: "",
      driver_user_id: "",
    });
    setMsg("");
    void fetchLedger(
      {
        user_id: "",
        trip_id: "",
        email: "",
        package: "",
        rider_user_id: "",
        driver_user_id: "",
      },
      0,
    );
  };

  const ledgerRangeLabel =
    ledgerTotal != null && ledgerTotal > 0
      ? `${ledgerOffset + 1}–${ledgerOffset + ledgerRows.length} of ${ledgerTotal}`
      : ledgerRows.length > 0
        ? `Rows ${ledgerOffset + 1}–${ledgerOffset + ledgerRows.length}`
        : null;

  const createBiz = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg("");
    const res = await apiFetch("/api/admin/users/business", {
      method: "POST",
      body: JSON.stringify({ email: bizEmail, password: bizPass }),
    });
    const body = await res.json();
    if (!res.ok) {
      setMsg(body?.error?.message || "Failed");
      return;
    }
    setMsg(`Created business user ${bizEmail}`);
    setBizEmail("");
    setBizPass("");
    void loadData();
  };

  const createAdm = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg("");
    const res = await apiFetch("/api/admin/users/admin", {
      method: "POST",
      body: JSON.stringify({
        email: admEmail,
        password: admPass,
        can_create_admins: canCreateAdmins,
        can_delete_data: canDeleteData,
      }),
    });
    const body = await res.json();
    if (!res.ok) {
      setMsg(body?.error?.message || "Failed");
      return;
    }
    setMsg(`Created admin ${admEmail}`);
    setAdmEmail("");
    setAdmPass("");
    setCanCreateAdmins(false);
    setCanDeleteData(false);
  };

  const toggleBiz = async (userId: string, next: boolean) => {
    setMsg("");
    const res = await apiFetch("/api/admin/users/business", {
      method: "PATCH",
      body: JSON.stringify({ user_id: userId, is_active: next }),
    });
    const body = await res.json();
    if (!res.ok) {
      setMsg(body?.error?.message || "Update failed");
      return;
    }
    void loadData();
  };

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-500">Loading…</div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <p className="text-slate-600">Admin sign-in required.</p>
        <Button asChild>
          <Link href="/login?next=/admin">Sign in</Link>
        </Button>
      </div>
    );
  }

  if (session.user.role !== "admin") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <p className="text-slate-600">This area is restricted to administrators.</p>
        <Button asChild variant="outline">
          <Link href="/">Home</Link>
        </Button>
      </div>
    );
  }

  const entries = logs?.entries ?? [];
  const cur = revenue?.currency || "usd";
  const canMakeAdmins = session.user.can_create_admins === true;

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="max-w-6xl mx-auto space-y-8">
        <div className="flex justify-between items-center flex-wrap gap-2">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Admin</h1>
            <p className="text-sm text-slate-500">{session.user.email}</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" asChild>
              <Link href="/dashboard">Full dashboard</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/">Home</Link>
            </Button>
            <Button variant="ghost" onClick={() => { logout(); window.location.href = "/"; }}>
              Sign out
            </Button>
          </div>
        </div>

        {msg && <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg p-3">{msg}</p>}

        <section className="space-y-3">
          <h2 className="font-medium text-slate-800">Business overview (same data as dashboard)</h2>
          {dashErr && <p className="text-red-600 text-sm">{dashErr}</p>}
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <p className="text-xs text-slate-500 uppercase">Global revenue</p>
              <p className="text-2xl font-semibold text-slate-900">{formatMoney(revenue?.total_cents, cur)}</p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-4 sm:col-span-2">
              <p className="text-xs text-slate-500 uppercase mb-2">Top regions</p>
              <ul className="text-sm space-y-1">
                {(regions?.regions ?? []).slice(0, 5).map((r) => (
                  <li key={r.region} className="flex justify-between gap-2">
                    <span className="font-mono text-xs truncate">{r.region}</span>
                    <span>{formatMoney(r.amount_cents, regions?.currency || cur)}</span>
                  </li>
                ))}
                {(regions?.regions ?? []).length === 0 && <li className="text-slate-500">No data</li>}
              </ul>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4 overflow-x-auto">
            <p className="text-xs text-slate-500 uppercase mb-2">Packages</p>
            <table className="w-full text-sm">
              <thead className="text-left text-slate-600 border-b">
                <tr>
                  <th className="py-2 pr-3">Package</th>
                  <th className="py-2">Net</th>
                </tr>
              </thead>
              <tbody>
                {(categories?.categories ?? []).map((c) => (
                  <tr key={c.package_slug || "-"} className="border-t border-slate-100">
                    <td className="py-2 pr-3">{c.package_slug || "(unknown)"}</td>
                    <td className="py-2">{formatMoney(c.net_amount_cents, categories?.currency || cur)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="bg-white rounded-xl border border-slate-200 p-4 overflow-x-auto">
          <h2 className="font-medium text-slate-800 mb-3">Business accounts</h2>
          <p className="text-xs text-slate-500 mb-3">Created-by email is stored when an admin provisions the account.</p>
          <table className="w-full text-sm min-w-[640px]">
            <thead className="text-left text-slate-600 border-b">
              <tr>
                <th className="py-2 pr-3">Email</th>
                <th className="py-2 pr-3">Active</th>
                <th className="py-2 pr-3">Created by</th>
                <th className="py-2 pr-3">Created</th>
                <th className="py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {bizUsers.map((u) => (
                <tr key={u.id} className="border-t border-slate-100">
                  <td className="py-2 pr-3">{u.email}</td>
                  <td className="py-2 pr-3">{u.is_active ? "Yes" : "No"}</td>
                  <td className="py-2 pr-3 text-slate-600">{u.created_by_admin_email || "—"}</td>
                  <td className="py-2 pr-3 text-xs text-slate-500">{u.created_at_rfc3339 || "—"}</td>
                  <td className="py-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => u.id && toggleBiz(u.id, !u.is_active)}
                    >
                      {u.is_active ? "Deactivate" : "Activate"}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <div className="grid md:grid-cols-2 gap-6">
          <section className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
            <h2 className="font-medium text-slate-800">Create business user</h2>
            <form onSubmit={createBiz} className="space-y-2">
              <Input type="email" placeholder="Email" value={bizEmail} onChange={(e) => setBizEmail(e.target.value)} required />
              <Input type="password" placeholder="Password" value={bizPass} onChange={(e) => setBizPass(e.target.value)} required />
              <Button type="submit" className="w-full">Create</Button>
            </form>
          </section>
          <section className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
            <h2 className="font-medium text-slate-800">Create admin user</h2>
            {!canMakeAdmins ? (
              <p className="text-sm text-slate-600">Your account is not allowed to create other administrators.</p>
            ) : (
              <form onSubmit={createAdm} className="space-y-2">
                <Input type="email" placeholder="Email" value={admEmail} onChange={(e) => setAdmEmail(e.target.value)} required />
                <Input type="password" placeholder="Password" value={admPass} onChange={(e) => setAdmPass(e.target.value)} required />
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={canCreateAdmins} onChange={(e) => setCanCreateAdmins(e.target.checked)} />
                  Allowed to create other admins
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={canDeleteData} onChange={(e) => setCanDeleteData(e.target.checked)} />
                  Allowed to delete data
                </label>
                <Button type="submit" className="w-full">Create</Button>
              </form>
            )}
          </section>
        </div>

        <section className="bg-white rounded-xl border border-slate-200 p-4 overflow-x-auto">
          <h2 className="font-medium text-slate-800 mb-1">Transaction ledger</h2>
          <p className="text-sm text-slate-600 mb-3 max-w-3xl">
            You do <span className="font-medium text-slate-800">not</span> need to fill every field. Leave boxes empty to load the latest rows (paged).
            Use one or more filters together to narrow results—for example only email, or trip ID plus package.
          </p>
          <div className="flex flex-wrap items-center gap-3 mb-3 text-sm text-slate-600">
            <label className="flex items-center gap-2">
              <span>Page size</span>
              <select
                className="border border-slate-200 rounded-md px-2 py-1 bg-white"
                value={ledgerPageSize}
                onChange={(e) => {
                  const n = parseInt(e.target.value, 10);
                  setLedgerPageSize(n);
                  void fetchLedger(txFilters, 0, n);
                }}
              >
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </label>
            {ledgerRangeLabel && <span className="text-slate-500">{ledgerRangeLabel}</span>}
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2 mb-3">
            <Input placeholder="User ID" value={txFilters.user_id} onChange={(e) => setTxFilters((f) => ({ ...f, user_id: e.target.value }))} />
            <Input placeholder="Trip ID" value={txFilters.trip_id} onChange={(e) => setTxFilters((f) => ({ ...f, trip_id: e.target.value }))} />
            <Input placeholder="Email contains" value={txFilters.email} onChange={(e) => setTxFilters((f) => ({ ...f, email: e.target.value }))} />
            <Input placeholder="Package slug" value={txFilters.package} onChange={(e) => setTxFilters((f) => ({ ...f, package: e.target.value }))} />
            <Input placeholder="Rider user ID" value={txFilters.rider_user_id} onChange={(e) => setTxFilters((f) => ({ ...f, rider_user_id: e.target.value }))} />
            <Input placeholder="Driver user ID" value={txFilters.driver_user_id} onChange={(e) => setTxFilters((f) => ({ ...f, driver_user_id: e.target.value }))} />
          </div>
          <div className="flex flex-wrap gap-2 mb-3">
            <Button type="button" variant="secondary" onClick={loadLedger} disabled={ledgerLoading}>
              {ledgerLoading ? "Loading…" : "Apply filters"}
            </Button>
            <Button type="button" variant="outline" onClick={clearTxFilters} disabled={ledgerLoading}>
              Clear filters — show latest
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={ledgerLoading || ledgerOffset <= 0}
              onClick={() => void fetchLedger(txFilters, Math.max(0, ledgerOffset - ledgerPageSize))}
            >
              Previous page
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={ledgerLoading || !ledgerHasMore}
              onClick={() => void fetchLedger(txFilters, ledgerOffset + ledgerPageSize)}
            >
              Next page
            </Button>
          </div>
          <table className="w-full text-sm min-w-[800px]">
            <thead className="text-left text-slate-600 border-b">
              <tr>
                <th className="py-2 pr-2">When</th>
                <th className="py-2 pr-2">User</th>
                <th className="py-2 pr-2">Email</th>
                <th className="py-2 pr-2">Type</th>
                <th className="py-2 pr-2">Amount</th>
                <th className="py-2 pr-2">Trip</th>
                <th className="py-2">Pkg</th>
              </tr>
            </thead>
            <tbody>
              {!ledgerLoading && ledgerRows.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-500">
                    No rows match these filters (or the ledger is empty).
                  </td>
                </tr>
              )}
              {ledgerRows.map((r, i) => (
                <tr key={r.id || `row-${i}`} className="border-t border-slate-100">
                  <td className="py-2 pr-2 text-xs whitespace-nowrap">{r.created_at_rfc3339}</td>
                  <td className="py-2 pr-2 font-mono text-xs">{r.user_id}</td>
                  <td className="py-2 pr-2 text-xs">{r.user_email}</td>
                  <td className="py-2 pr-2 capitalize">{r.type}</td>
                  <td className={`py-2 pr-2 font-medium ${r.type === "credit" ? "text-emerald-700" : "text-red-600"}`}>
                    {r.type === "credit" ? "+" : "−"}
                    {formatMoney(r.amount_cents, r.currency)}
                  </td>
                  <td className="py-2 pr-2 font-mono text-xs">{r.source_trip_id}</td>
                  <td className="py-2 text-xs">{r.package_slug}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="bg-white rounded-xl border border-slate-200 p-4 overflow-x-auto">
          <h2 className="font-medium text-slate-800 mb-3">System audit logs</h2>
          {logError && <p className="text-red-600 text-sm mb-2">{logError}</p>}
          <table className="w-full text-sm min-w-[900px]">
            <thead className="text-left text-slate-600 border-b">
              <tr>
                <th className="py-2 pr-2">Time</th>
                <th className="py-2 pr-2">Method</th>
                <th className="py-2 pr-2">Path</th>
                <th className="py-2 pr-2">Actor</th>
                <th className="py-2 pr-2">Role</th>
                <th className="py-2 pr-2">IP</th>
                <th className="py-2">Detail</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id} className="border-t border-slate-100 align-top">
                  <td className="py-2 pr-2 text-xs whitespace-nowrap">{e.ts_rfc3339}</td>
                  <td className="py-2 pr-2">{e.method}</td>
                  <td className="py-2 pr-2 font-mono text-xs">{e.path}</td>
                  <td className="py-2 pr-2 font-mono text-xs">{e.actor_user_id}</td>
                  <td className="py-2 pr-2">{e.role}</td>
                  <td className="py-2 pr-2 font-mono text-xs">{e.ip}</td>
                  <td className="py-2 text-xs max-w-xs truncate" title={e.detail_json}>{e.detail_json}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <p className="text-xs text-slate-500">
          Password reset tokens are logged by platform-service (simulated email). Gateway: {API_URL}
        </p>
      </div>
    </div>
  );
}
