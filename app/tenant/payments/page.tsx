"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/app/context/AuthContext";
import { formatMonthYearFromParts, getDateOnlyParts } from "@/lib/date-only";

type Property = {
  id: string;
  address?: string | null;
  name?: string | null;
  target_monthly_rent?: number;
  lease_start?: string | null;
  lease_end?: string | null;
};

type TenantBill = {
  id: string;
  bill_type: string;
  description: string | null;
  amount: number;
  due_date: string;
  status: string;
  month: number;
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
  const [bills, setBills] = useState<TenantBill[]>([]);
  const [billsError, setBillsError] = useState<string | null>(null);
  const [ownerBilling, setOwnerBilling] = useState<OwnerBilling[]>([]);
  const [ownerBillingError, setOwnerBillingError] = useState<string | null>(null);
  const [ownerBillingWarning, setOwnerBillingWarning] = useState<string | null>(null);
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [loading, setLoading] = useState(true);
  const [billsLoading, setBillsLoading] = useState(false);
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
          setBills([]);
          setError("No properties available.");
        }
      } catch (err: any) {
        console.error(err);
        setError(err.message || "Failed to load payments.");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [authLoading, user?.id, role]);

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

  useEffect(() => {
    const loadBills = async () => {
      if (authLoading || !selectedPropertyId) return;
      try {
        setBillsLoading(true);
        setBillsError(null);
        const res = await fetch(`/api/tenant/billing?propertyId=${selectedPropertyId}`, {
          cache: "no-store",
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to load tenant bills");
        setBills(data.rows || []);
      } catch (err: any) {
        setBills([]);
        setBillsError(err.message || "Failed to load tenant bills.");
      } finally {
        setBillsLoading(false);
      }
    };

    loadBills();
  }, [authLoading, selectedPropertyId]);

  const zelleRecipient = useMemo(() => {
    if (!ownerBilling.length) return null;
    const withZelle = ownerBilling.find((o) => o.zelleEmail || o.zellePhone);
    return withZelle || ownerBilling[0];
  }, [ownerBilling]);

  const availableYears = useMemo(() => {
    const years = new Set<number>();
    bills.forEach((b) => {
      if (Number.isFinite(b.year)) years.add(b.year);
    });
    if (years.size === 0) years.add(year);
    return Array.from(years).sort((a, b) => a - b);
  }, [bills, year]);

  useEffect(() => {
    if (availableYears.length > 0 && !availableYears.includes(year)) {
      setYear(availableYears[availableYears.length - 1]);
    }
  }, [availableYears, year]);

  const BILL_TYPE_LABELS: Record<string, string> = {
    rent: "Rent",
    fee: "Fee",
    late_fee: "Late Fee",
    security_deposit: "Security Deposit",
  };

  const billRows = useMemo(() => {
    const filtered = bills.filter((b) => b.year === year);
    const grouped = new Map<string, { year: number; month: number; bills: TenantBill[] }>();

    filtered.forEach((bill) => {
      const key = `${bill.year}-${bill.month}`;
      const entry = grouped.get(key) || { year: bill.year, month: bill.month, bills: [] };
      entry.bills.push(bill);
      grouped.set(key, entry);
    });

    return Array.from(grouped.values())
      .sort((a, b) => (a.year !== b.year ? a.year - b.year : a.month - b.month))
      .map((group) => {
        const total = group.bills.reduce((sum, bill) => sum + (bill.amount || 0), 0);
        const breakdown = group.bills.map((bill) => {
          const label = BILL_TYPE_LABELS[bill.bill_type] || bill.bill_type;
          const detail = bill.description ? ` - ${bill.description}` : "";
          return {
            label,
            detail,
            amount: bill.amount || 0,
            status: bill.status || "due",
          };
        });
        const allPaid = group.bills.every((bill) => bill.status === "paid");

        return {
          year: group.year,
          month: group.month,
          monthLabel: formatMonthYearFromParts(group.year, group.month),
          total,
          breakdown,
          status: allPaid ? "Paid" : "Unpaid",
        };
      });
  }, [bills, year]);

  const now = new Date();
  const currentMonthIndex = now.getMonth() + 1;
  const currentYear = now.getFullYear();
  const currentMonthBills = bills.filter(
    (bill) => bill.year === currentYear && bill.month === currentMonthIndex
  );

  const nextDueSummary = useMemo(() => {
    const unpaid = bills.filter((bill) => bill.status !== "paid");
    if (unpaid.length === 0) {
      return { label: "No upcoming dues", amount: 0 };
    }

    const sorted = [...unpaid].sort((a, b) => {
      const aParts = getDateOnlyParts(a.due_date);
      const bParts = getDateOnlyParts(b.due_date);
      const aYear = aParts?.year ?? a.year;
      const aMonth = aParts?.month ?? a.month;
      const bYear = bParts?.year ?? b.year;
      const bMonth = bParts?.month ?? b.month;
      if (aYear !== bYear) return aYear - bYear;
      return aMonth - bMonth;
    });

    const first = sorted[0];
    const firstParts = getDateOnlyParts(first.due_date);
    const dueYear = firstParts?.year ?? first.year;
    const dueMonth = firstParts?.month ?? first.month;
    const sameMonthBills = unpaid.filter(
      (bill) => bill.year === dueYear && bill.month === dueMonth
    );
    const amount = sameMonthBills.reduce((sum, bill) => sum + (bill.amount || 0), 0);

    return {
      label: formatMonthYearFromParts(dueYear, dueMonth),
      amount,
    };
  }, [bills]);

  const paymentDue = nextDueSummary.amount;
  const paidThisMonth = currentMonthBills
    .filter((bill) => bill.status === "paid")
    .reduce((sum, bill) => sum + (bill.amount || 0), 0);

  const outstanding = bills.reduce((sum, bill) => {
    const parts = getDateOnlyParts(bill.due_date);
    if (!parts) return sum;
    const dueDate = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
    const today = new Date(Date.UTC(currentYear, currentMonthIndex - 1, now.getDate()));
    const isDue = dueDate <= today;
    if (!isDue || bill.status === "paid") return sum;
    return sum + (bill.amount || 0);
  }, 0);

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);

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
            {availableYears.map((y) => (
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
            {loading || billsLoading || authLoading ? (
              <p className="text-gray-600">Loading payments...</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 border rounded-lg bg-gray-50">
                  <div className="text-sm text-gray-600">Payment Due ({nextDueSummary.label})</div>
                  <div className="text-2xl font-bold text-gray-900">
                    {formatCurrency(paymentDue)}
                  </div>
                </div>
                <div className="p-4 border rounded-lg bg-gray-50">
                  <div className="text-sm text-gray-600">Paid This Month</div>
                  <div className="text-2xl font-bold text-green-700">
                    {formatCurrency(paidThisMonth)}
                  </div>
                </div>
                <div className="p-4 border rounded-lg bg-gray-50">
                  <div className="text-sm text-gray-600">Outstanding</div>
                  <div className="text-2xl font-bold text-orange-700">
                    {formatCurrency(outstanding)}
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
            {loading || billsLoading || authLoading ? (
              <p className="text-gray-600">Loading history...</p>
            ) : billsError ? (
              <p className="text-red-600">{billsError}</p>
            ) : billRows.length === 0 ? (
              <p className="text-gray-500">No payment history available yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-gray-50 text-left text-sm text-gray-600">
                      <th className="py-2 px-3">Month</th>
                      <th className="py-2 px-3">Description</th>
                      <th className="py-2 px-3">Status</th>
                      <th className="py-2 px-3 text-right">Rent</th>
                    </tr>
                  </thead>
                  <tbody>
                    {billRows.map((row) => (
                      <tr key={`${row.year}-${row.month}`} className="border-t text-sm">
                        <td className="py-2 px-3 font-medium">{row.monthLabel}</td>
                        <td className="py-2 px-3">
                          <div className="text-sm text-gray-900">
                            {row.breakdown
                              .map((item) => `${item.label}${item.detail}`)
                              .join(", ")}
                          </div>
                          <div className="text-xs text-gray-500">
                            {row.breakdown
                              .map((item) => `${item.label}: ${formatCurrency(item.amount)}`)
                              .join(" | ")}
                          </div>
                        </td>
                        <td className="py-2 px-3">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                              row.status === "Paid"
                                ? "bg-emerald-100 text-emerald-700"
                                : "bg-orange-100 text-orange-700"
                            }`}
                          >
                            {row.status}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-right font-semibold">
                          {formatCurrency(row.total)}
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
