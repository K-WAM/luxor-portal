"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/app/context/AuthContext";
import { getDateOnlyParts } from "@/lib/date-only";

type Property = {
  id: string;
  address?: string | null;
  name?: string | null;
  target_monthly_rent?: number;
  lease_start?: string | null;
  lease_end?: string | null;
};

type MonthlyRow = {
  month: number;
  month_name: string;
  rent_income: number;
  year: number;
};

type OwnerBilling = {
  userId: string;
  ownerEmail: string;
  zelleEmail: string | null;
  zellePhone: string | null;
};

export default function TenantPayments() {
  const { user, role, loading: authLoading } = useAuth();
  const [properties, setProperties] = useState<Property[]>([]);
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>("");
  const [monthly, setMonthly] = useState<MonthlyRow[]>([]);
  const [property, setProperty] = useState<Property | null>(null);
  const [ownerBilling, setOwnerBilling] = useState<OwnerBilling[]>([]);
  const [ownerBillingError, setOwnerBillingError] = useState<string | null>(null);
  const [ownerBillingWarning, setOwnerBillingWarning] = useState<string | null>(null);
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        if (authLoading) return;
        setLoading(true);
        setError(null);

        const propRes = await fetch("/api/properties", { cache: "no-store" });
        if (!propRes.ok) throw new Error("Failed to load properties");
        const propsData = (await propRes.json()) as Property[];
        setProperties(propsData);
        const propId =
          (selectedPropertyId && propsData.find((p) => p.id === selectedPropertyId)?.id) ||
          propsData[0]?.id ||
          "";
        setSelectedPropertyId(propId);

        if (!propId) {
          setMonthly([]);
          setProperty(null);
          setError("No properties available.");
          setLoading(false);
          return;
        }

        // Fetch financial metrics for the selected year and the next year (to cover leases crossing years)
        const yearsToFetch = Array.from(new Set([year, year + 1]));

        const fetchYear = async (yr: number) => {
          const res = await fetch(
            `/api/owner/financial-metrics?propertyId=${propId}&year=${yr}`,
            { cache: "no-store" }
          );
          if (!res.ok) throw new Error("Failed to load payment data");
          return res.json();
        };

        const results = await Promise.all(yearsToFetch.map(fetchYear));

        // Use the first result's property details
        const finData = results[0];
        setProperty({
          id: finData.property.id,
          address: finData.property.address,
          target_monthly_rent: finData.property.target_monthly_rent,
          lease_start: finData.property.lease_start || null,
          lease_end: finData.property.lease_end || null,
        });

        // Combine monthly data across fetched years
        const combinedMonthly: MonthlyRow[] = results.flatMap((data) =>
          (data.monthly || []).map((m: any) => ({
            month: m.month,
            month_name: m.month_name,
            rent_income: m.rent_income || 0,
            year: m.year || year,
          }))
        );
        setMonthly(combinedMonthly);
      } catch (err: any) {
        console.error(err);
        setError(err.message || "Failed to load payments.");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [authLoading, user?.id, role, selectedPropertyId, year]);

  useEffect(() => {
    const loadBilling = async () => {
      if (authLoading || !selectedPropertyId) return;
      try {
        setOwnerBillingError(null);
        const res = await fetch(`/api/owner-billing?propertyId=${selectedPropertyId}`, {
          cache: "no-store",
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to load owner billing details");
        setOwnerBilling(data.rows || []);
        setOwnerBillingWarning(data.warning || null);
      } catch (err: any) {
        setOwnerBilling([]);
        setOwnerBillingError(err.message || "Failed to load owner billing details.");
        setOwnerBillingWarning(null);
      }
    };

    loadBilling();
  }, [authLoading, selectedPropertyId]);

  const zelleRecipient = useMemo(() => {
    if (!ownerBilling.length) return null;
    const withZelle = ownerBilling.find((o) => o.zelleEmail || o.zellePhone);
    return withZelle || ownerBilling[0];
  }, [ownerBilling]);

  const monthRows = useMemo(() => {
    const sorted = [...monthly].sort((a, b) =>
      a.year !== b.year ? a.year - b.year : a.month - b.month
    );
    const leaseStart = property?.lease_start
      ? getDateOnlyParts(property.lease_start)
      : null;
    const leaseEnd = property?.lease_end ? getDateOnlyParts(property.lease_end) : null;
    const leaseStartYear = leaseStart?.year ?? null;
    const leaseStartMonth = leaseStart?.month ?? null;
    const leaseEndYear = leaseEnd?.year ?? null;
    const leaseEndMonth = leaseEnd?.month ?? null;

    const toIndex = (y: number, m: number) => y * 12 + m; // m is 1-based

    const filtered = sorted.filter((m) => {
      if (!leaseStartYear || !leaseStartMonth) return true;
      const idx = toIndex(m.year, m.month);
      const startIdx = toIndex(leaseStartYear, leaseStartMonth);
      const endIdx = leaseEndYear && leaseEndMonth ? toIndex(leaseEndYear, leaseEndMonth) : null;
      if (endIdx) {
        return idx >= startIdx && idx <= endIdx;
      }
      return idx >= startIdx;
    });

    return filtered.map((m) => ({
      ...m,
      status: m.rent_income > 0 ? "Paid" : "Unpaid",
    }));
  }, [monthly, property?.lease_start, property?.lease_end]);

  const currentMonthIndex = new Date().getMonth() + 1;
  const currentMonthRow = monthRows.find((m) => m.month === currentMonthIndex);
  const paymentDue = property?.target_monthly_rent || 0;
  const paidThisMonth = currentMonthRow?.rent_income || 0;

  return (
    <div className="p-8 max-w-5xl">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-3xl font-bold">Payments</h1>
          <p className="text-gray-700">
            Payment status and history for your lease.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            className="border border-gray-300 rounded px-3 py-2 text-sm"
            value={selectedPropertyId}
            onChange={(e) => setSelectedPropertyId(e.target.value)}
            disabled={role === "tenant"}
          >
            {properties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name || p.address || "Property"}
              </option>
            ))}
          </select>
          <select
            className="border border-gray-300 rounded px-3 py-2 text-sm"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
          >
            {[year - 1, year, year + 1].map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error ? (
        <div className="bg-white border rounded-lg p-6 mb-6">
          <p className="text-red-600">{error}</p>
        </div>
      ) : (
        <>
          <div className="bg-white border rounded-lg p-6 mb-6">
            {loading || authLoading ? (
              <p className="text-gray-600">Loading payments...</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 border rounded-lg bg-gray-50">
                  <div className="text-sm text-gray-600">Payment Due (This Month)</div>
                  <div className="text-2xl font-bold text-gray-900">
                    ${paymentDue.toLocaleString()}
                  </div>
                </div>
                <div className="p-4 border rounded-lg bg-gray-50">
                  <div className="text-sm text-gray-600">Paid This Month</div>
                  <div className="text-2xl font-bold text-green-700">
                    ${paidThisMonth.toLocaleString()}
                  </div>
                </div>
                <div className="p-4 border rounded-lg bg-gray-50">
                  <div className="text-sm text-gray-600">Outstanding</div>
                  <div className="text-2xl font-bold text-orange-700">
                    ${(Math.max(paymentDue - paidThisMonth, 0)).toLocaleString()}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Pay Now */}
          <div className="bg-white border rounded-lg p-6 mb-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Pay Now</h2>
            <p className="text-sm text-gray-600 mb-4">
              Choose a payment option for this month&apos;s rent.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="border border-slate-200 rounded-lg p-4 bg-slate-50">
                <div className="text-sm font-semibold text-gray-900">Zelle</div>
                <div className="text-sm text-gray-700 mt-1">Send your payment to:</div>
                {ownerBillingError ? (
                  <div className="text-sm text-red-600 mt-1">{ownerBillingError}</div>
                ) : zelleRecipient?.zelleEmail ? (
                  <div className="text-base font-semibold text-gray-900 mt-1">
                    {zelleRecipient.zelleEmail}
                  </div>
                ) : zelleRecipient?.zellePhone ? (
                  <div className="text-base font-semibold text-gray-900 mt-1">
                    {zelleRecipient.zellePhone}
                  </div>
                ) : (
                  <div className="text-sm text-gray-500 mt-1">
                    {ownerBillingWarning || "Zelle details not set. Contact your property manager."}
                  </div>
                )}
                <div className="text-xs text-gray-500 mt-2">
                  Include your property address in the memo. Once received, we&apos;ll mark it as paid.
                </div>
              </div>
              <div className="border border-slate-200 rounded-lg p-4 bg-slate-50">
                <div className="text-sm font-semibold text-gray-900">Card / ACH</div>
                <div className="text-sm text-gray-700 mt-1">Coming soon.</div>
                <div className="text-xs text-gray-500 mt-2">
                  You can still use Zelle above while we enable online card/ACH checkout.
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg border p-6">
            {loading || authLoading ? (
              <p className="text-gray-600">Loading history…</p>
            ) : monthRows.length === 0 ? (
              <p className="text-gray-500">No payment history available yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-gray-50 text-left text-sm text-gray-600">
                      <th className="py-2 px-3">Month</th>
                      <th className="py-2 px-3 text-right">Amount</th>
                      <th className="py-2 px-3 text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthRows.map((row) => (
                      <tr key={row.month} className="border-t text-sm">
                        <td className="py-2 px-3">{row.month_name}</td>
                        <td className="py-2 px-3 text-right">
                          ${row.rent_income.toLocaleString()}
                        </td>
                        <td className="py-2 px-3 text-right">
                          <span
                            className={`inline-flex items-center px-2 py-1 rounded-full text-xs ${
                              row.status === "Paid"
                                ? "bg-green-100 text-green-700"
                                : "bg-orange-100 text-orange-700"
                            }`}
                          >
                            {row.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
