"use client";

import { useEffect, useState } from "react";
import { getShortPropertyName } from "@/lib/property-short-name";

type OwnerRow = {
  id: string;
  ownerName: string;
  ownerEmail: string;
  properties: string[];
  stripeConnectedAccountId: string;
  stripeStatus: string;
  chargesEnabled?: boolean | null;
  payoutsEnabled?: boolean | null;
};

export default function AdminOwnersPage() {
  const [rows, setRows] = useState<OwnerRow[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [savingOwnerId, setSavingOwnerId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadRows = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/admin/owners", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load owners");
      setRows(data.rows || []);
      setDrafts(
        Object.fromEntries(
          (data.rows || []).map((row: OwnerRow) => [row.id, row.stripeConnectedAccountId || ""])
        )
      );
    } catch (err: any) {
      setError(err.message || "Failed to load owners");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRows();
  }, []);

  const saveStripeAccount = async (ownerUserId: string, stripeConnectedAccountId: string) => {
    try {
      setSavingOwnerId(ownerUserId);
      setError(null);
      setNotice(null);
      const res = await fetch("/api/admin/owners", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ownerUserId, stripeConnectedAccountId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update Stripe account");
      setNotice("Owner Stripe setup updated.");
      await loadRows();
    } catch (err: any) {
      setError(err.message || "Failed to update Stripe account");
    } finally {
      setSavingOwnerId(null);
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Owners</h1>
        <p className="mt-1 text-sm text-slate-500">Stripe Setup</p>
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      {notice && <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</div>}

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700">Stripe Setup</h2>
        </div>

        {loading ? (
          <div className="p-6 text-sm text-slate-500">Loading owners...</div>
        ) : rows.length === 0 ? (
          <div className="p-6 text-sm text-slate-500">No owners found.</div>
        ) : (
          <div className="divide-y divide-slate-200">
            {rows.map((row) => (
              <div key={row.id} className="grid gap-4 px-5 py-4 md:grid-cols-[1.2fr_1fr_1.4fr_auto] md:items-center">
                <div>
                  <div className="text-sm font-semibold text-slate-900">{row.ownerName}</div>
                  <div className="text-xs text-slate-500">{row.ownerEmail || row.id}</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {row.properties.length > 0 ? row.properties.map((property) => (
                      <span key={`${row.id}-${property}`} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700" title={property}>
                        {getShortPropertyName(property || "Property")}
                      </span>
                    )) : <span className="text-xs text-slate-500">No property access</span>}
                  </div>
                </div>

                <div className="text-sm text-slate-700">
                  <div className="font-medium text-slate-900">Status</div>
                  <div>{row.stripeStatus === "connected" ? "Connected" : "Not connected"}</div>
                  <div className="mt-1 text-xs text-slate-500">
                    Charges: {row.chargesEnabled === null || row.chargesEnabled === undefined ? "—" : row.chargesEnabled ? "Enabled" : "Disabled"}
                  </div>
                  <div className="text-xs text-slate-500">
                    Payouts: {row.payoutsEnabled === null || row.payoutsEnabled === undefined ? "—" : row.payoutsEnabled ? "Enabled" : "Disabled"}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="block text-xs font-medium uppercase tracking-wide text-slate-500">
                    Stripe Connected Account ID
                  </label>
                  <input
                    type="text"
                    value={drafts[row.id] ?? ""}
                    onChange={(e) => setDrafts((prev) => ({ ...prev, [row.id]: e.target.value }))}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                    placeholder="acct_..."
                  />
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => saveStripeAccount(row.id, drafts[row.id] ?? "")}
                    disabled={savingOwnerId === row.id}
                    className="rounded-md bg-slate-900 px-3 py-2 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-60"
                  >
                    {savingOwnerId === row.id ? "Saving..." : "Save"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDrafts((prev) => ({ ...prev, [row.id]: "" }));
                      void saveStripeAccount(row.id, "");
                    }}
                    disabled={savingOwnerId === row.id}
                    className="rounded-md border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                  >
                    Clear
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
