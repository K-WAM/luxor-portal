"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/app/context/AuthContext";
import { formatDateOnly, formatMonthYearFromParts, getDateOnlyParts, parseDateOnly } from "@/lib/date-only";

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
  invoice_url?: string | null;
  payment_link_url?: string | null;
};

type OwnerBilling = {
  userId: string;
  ownerEmail: string;
  zelleEmail: string | null;
  zellePhone: string | null;
  zelleRecipient: string | null;
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
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<string[]>([]);
  const [checkoutLoading, setCheckoutLoading] = useState<"ach" | "card" | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [showCheckoutSuccessBanner, setShowCheckoutSuccessBanner] = useState(false);

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

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("checkout") === "success") {
      setShowCheckoutSuccessBanner(true);
      const url = new URL(window.location.href);
      url.searchParams.delete("checkout");
      url.searchParams.delete("session_id");
      window.history.replaceState({}, "", `${url.pathname}${url.search}`);
    }
  }, []);

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
    return filtered
      .map((bill) => {
        const label = BILL_TYPE_LABELS[bill.bill_type] || bill.bill_type;
        const detail = bill.description ? ` - ${bill.description}` : "";
        return {
          id: bill.id,
          year: bill.year,
          month: bill.month,
          monthLabel: formatMonthYearFromParts(bill.year, bill.month),
          description: `${label}${detail}`,
          amount: bill.amount || 0,
          status: bill.status || "due",
          dueDate: bill.due_date,
          invoiceUrl: bill.invoice_url,
          paymentLinkUrl: bill.payment_link_url,
        };
      })
      .sort((a, b) => {
        const aParts = getDateOnlyParts(a.dueDate);
        const bParts = getDateOnlyParts(b.dueDate);
        const aDate = aParts
          ? new Date(Date.UTC(aParts.year, aParts.month - 1, aParts.day))
          : new Date(Date.UTC(a.year, a.month - 1, 1));
        const bDate = bParts
          ? new Date(Date.UTC(bParts.year, bParts.month - 1, bParts.day))
          : new Date(Date.UTC(b.year, b.month - 1, 1));
        return aDate.getTime() - bDate.getTime();
      });
  }, [bills, year]);

  const DAY_MS = 24 * 60 * 60 * 1000;

  const getDueDateMs = (dateStr?: string | null) => {
    const date = parseDateOnly(dateStr);
    return date ? date.getTime() : null;
  };

  // Memoize to prevent infinite render loop (windowEndMs → qualifyingBills → useEffect → setState)
  const nowMs = useMemo(() => Date.now(), []);
  const windowEndMs = nowMs + 30 * DAY_MS;

  const qualifyingBills = useMemo(() => {
    return bills.filter((bill) => {
      if (bill.status === "paid") return false;
      const dueMs = getDueDateMs(bill.due_date);
      if (dueMs === null) return false;
      return dueMs <= windowEndMs;
    });
  }, [bills, windowEndMs]);

  useEffect(() => {
    setSelectedInvoiceIds(qualifyingBills.map((bill) => bill.id));
  }, [qualifyingBills]);

  const totalDue = qualifyingBills.reduce((sum, bill) => sum + (bill.amount || 0), 0);
  const selectedSubtotal = qualifyingBills
    .filter((bill) => selectedInvoiceIds.includes(bill.id))
    .reduce((sum, bill) => sum + (bill.amount || 0), 0);
  const hasProcessingSelected = qualifyingBills.some(
    (bill) =>
      selectedInvoiceIds.includes(bill.id) && (bill.status || "").toLowerCase() === "processing"
  );

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);

  const handleCheckout = async (method: "ach" | "card") => {
    if (selectedInvoiceIds.length === 0) return;
    try {
      setCheckoutLoading(method);
      setCheckoutError(null);
      const res = await fetch("/api/tenant/payments/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          billIds: selectedInvoiceIds,
          method,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to start checkout");
      }
      if (data?.url) {
        window.location.href = data.url;
      }
    } catch (err: any) {
      setCheckoutError(err.message || "Failed to start checkout");
    } finally {
      setCheckoutLoading(null);
    }
  };

  return (
    <div className="px-4 py-6 md:p-8 max-w-5xl">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
        <div>
          <h1 className="text-3xl font-bold">Payments</h1>
          <p className="text-gray-700">
            Payment status and history for your lease.
          </p>
        </div>
        <div className="flex flex-col md:flex-row md:items-center gap-2">
          <select
            className="border border-gray-300 rounded px-3 py-2 text-sm w-full md:w-auto"
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
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Pay Now</h2>
          {showCheckoutSuccessBanner && (
            <div className="mb-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
              <div className="text-sm font-semibold text-blue-900">Payment initiated</div>
              <div className="text-sm text-blue-800">
                Your bank transfer has been initiated and is processing. This can take 2–5 business days. If it doesn’t complete, you’ll be able to try again.
              </div>
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="md:col-span-2">
              <div className="bg-white border border-slate-200 rounded-lg p-3 shadow-sm">
                <div className="text-xs uppercase text-slate-500 mb-1">Balance due in the next 30 days</div>
                <div className="text-2xl font-semibold text-slate-900">${totalDue.toFixed(2)}</div>
                <div className="mt-3 border-t border-slate-100 pt-3">
                  {qualifyingBills.length === 0 ? (
                    <div className="text-sm text-slate-500">No invoices due in the next 30 days.</div>
                  ) : (
                    <div className="space-y-2">
                      <div className="text-xs uppercase text-slate-500">Invoices included</div>
                      <div className="space-y-2">
                        {qualifyingBills.map((bill) => {
                          const billTypeLabel = BILL_TYPE_LABELS[bill.bill_type] || bill.bill_type;
                          const billDetail = bill.description ? ` - ${bill.description}` : "";
                          const billTitle = `${billTypeLabel}${billDetail}`;
                          const selectedProperty =
                            properties.find((p) => p.id === selectedPropertyId) || properties[0];
                          const propertyDisplay = selectedProperty?.name || selectedProperty?.address || "Property";
                          return (
                            <label key={bill.id} className="flex items-start gap-2 text-sm text-slate-700">
                              <input
                                type="checkbox"
                                className="mt-1 h-3.5 w-3.5 text-slate-600 border-slate-300"
                                checked={selectedInvoiceIds.includes(bill.id)}
                                onChange={(e) => {
                                  setSelectedInvoiceIds((prev) =>
                                    e.target.checked
                                      ? [...prev, bill.id]
                                      : prev.filter((id) => id !== bill.id)
                                  );
                                }}
                              />
                              <div className="flex-1">
                                <div className="text-slate-700">
                                  {propertyDisplay} · {billTitle || "Invoice"}
                                </div>
                                <div className="text-xs text-slate-500">
                                  Due {formatDateOnly(bill.due_date) || "-"} ·{" "}
                                  <span className="font-semibold text-slate-700">
                                    ${bill.amount.toFixed(2)}
                                  </span>
                                </div>
                                {(bill.status || "").toLowerCase() === "processing" && (
                                  <span className="inline-flex mt-1 items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-blue-100 text-blue-700">
                                    Processing (ACH)
                                  </span>
                                )}
                              </div>
                            </label>
                          );
                        })}
                      </div>
                      <div className="flex items-center justify-between text-sm text-slate-700 pt-2 border-t border-slate-100">
                        <span>Subtotal (selected)</span>
                        <span className="font-semibold">${selectedSubtotal.toFixed(2)}</span>
                      </div>
                      {checkoutError && <div className="text-xs text-red-600">{checkoutError}</div>}
                      {hasProcessingSelected && (
                        <div className="text-xs text-slate-500">
                          A selected bill is currently processing via ACH.
                        </div>
                      )}
                      <div className="border-t border-slate-100 mt-3 pt-3">
                        {ownerBillingError ? (
                          <div className="text-xs text-red-600">{ownerBillingError}</div>
                        ) : zelleRecipient?.zelleEmail ? (
                          <div className="inline-flex flex-col px-3 py-2 rounded border border-slate-400 bg-slate-100 text-sm md:text-xs leading-tight text-slate-800">
                            <span>Zelle: {zelleRecipient.zelleEmail}</span>
                            <span className="text-[11px] text-slate-500">Recipient: {zelleRecipient.zelleRecipient || "—"}</span>
                            <span className="text-[11px] text-slate-500">No processing fee</span>
                          </div>
                        ) : zelleRecipient?.zellePhone ? (
                          <div className="inline-flex flex-col px-3 py-2 rounded border border-slate-400 bg-slate-100 text-sm md:text-xs leading-tight text-slate-800">
                            <span>Zelle: {zelleRecipient.zellePhone}</span>
                            <span className="text-[11px] text-slate-500">Recipient: {zelleRecipient.zelleRecipient || "—"}</span>
                            <span className="text-[11px] text-slate-500">No processing fee</span>
                          </div>
                        ) : (
                          <div className="text-sm text-slate-500">
                            {ownerBillingWarning || "Zelle details not set. Contact your property manager."}
                          </div>
                        )}
                        <div className="text-xs text-slate-500 mt-2">
                          Include your property address in the memo. Once received, we&apos;ll mark it as paid.
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2 pt-2">
                        <div>
                          <button
                            onClick={() => handleCheckout("ach")}
                            disabled={checkoutLoading !== null || selectedInvoiceIds.length === 0 || hasProcessingSelected}
                            className="h-11 md:h-9 px-4 md:px-3 rounded border border-slate-400 bg-slate-100 text-slate-800 text-sm md:text-xs hover:bg-slate-200 disabled:opacity-60"
                          >
                            {checkoutLoading === "ach" ? "Starting..." : "Pay Balance by Bank (ACH)"}
                          </button>
                        </div>
                        <div>
                          <button
                            onClick={() => handleCheckout("card")}
                            disabled={checkoutLoading !== null || selectedInvoiceIds.length === 0 || hasProcessingSelected}
                            className="h-11 md:h-9 px-4 md:px-3 rounded border border-slate-400 bg-slate-100 text-slate-800 text-sm md:text-xs hover:bg-slate-200 disabled:opacity-60"
                          >
                            {checkoutLoading === "card" ? "Starting..." : "Pay Balance by Card"}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="flex flex-col gap-4">
              <div className="bg-white border border-slate-200 rounded-lg p-3 shadow-sm">
                <div className="text-xs uppercase text-slate-500 mb-1">Property</div>
                <select
                  value={selectedPropertyId}
                  onChange={(e) => setSelectedPropertyId(e.target.value)}
                  disabled={role === "tenant"}
                  className="w-full border border-slate-300 rounded px-3 py-2 text-sm bg-white"
                >
                  {properties.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name || p.address || "Property"}
                    </option>
                  ))}
                </select>
              </div>
              <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
                <div className="flex items-center justify-between mb-1">
                  <div className="text-xs uppercase text-slate-500">Payment options</div>
                  <span
                    className="text-xs text-slate-500"
                    title="Processing fees are charged by Stripe for electronic payments. Zelle has no processing fee. Fees shown are estimates and may vary based on payment details."
                  >
                    ⓘ Fees explained
                  </span>
                </div>
                <div className="text-sm text-slate-700 space-y-1">
                  <div>• Zelle (no fee)</div>
                  <div>• Bank transfer (ACH): 0.8% (max $5)</div>
                  <div>• Credit card: 2.9% + $0.30 (domestic)</div>
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
              <>
                <div className="md:hidden space-y-3">
                  {billRows.map((row) => (
                    <div key={row.id} className="border border-gray-200 rounded-lg p-3">
                      <div className="text-sm font-semibold text-gray-900">{row.monthLabel}</div>
                      <div className="text-sm text-gray-700 mt-1">{row.description}</div>
                      <div className="mt-2 flex items-center justify-between text-sm">
                        <span className="text-gray-500">Due</span>
                        <span className="text-gray-700">{formatDateOnly(row.dueDate) || "-"}</span>
                      </div>
                      <div className="mt-1 flex items-center justify-between text-sm">
                        <span className="text-gray-500">Amount</span>
                        <span className="font-semibold">{formatCurrency(row.amount)}</span>
                      </div>
                      <div className="mt-2 flex items-center justify-between">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                            row.status === "paid"
                              ? "bg-emerald-100 text-emerald-700"
                              : row.status === "processing"
                              ? "bg-blue-100 text-blue-700"
                              : "bg-orange-100 text-orange-700"
                          }`}
                        >
                          {row.status === "paid"
                            ? "Paid"
                            : row.status === "processing"
                            ? "Processing (ACH)"
                            : row.status.charAt(0).toUpperCase() + row.status.slice(1)}
                        </span>
                        {row.invoiceUrl ? (
                          <a href={row.invoiceUrl} target="_blank" rel="noreferrer" className="text-blue-600 hover:text-blue-700 text-xs">
                            Invoice PDF
                          </a>
                        ) : (
                          <span className="text-xs text-gray-500">-</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="bg-gray-50 text-left text-sm text-gray-600">
                        <th className="py-2 px-3">Month</th>
                        <th className="py-2 px-3">Description</th>
                        <th className="py-2 px-3">Due Date</th>
                        <th className="py-2 px-3">Status</th>
                        <th className="py-2 px-3 text-right">Amount</th>
                        <th className="py-2 px-3">Invoice PDF</th>
                      </tr>
                    </thead>
                    <tbody>
                      {billRows.map((row) => (
                        <tr key={row.id} className="border-t text-sm">
                          <td className="py-2 px-3 font-medium">{row.monthLabel}</td>
                          <td className="py-2 px-3">
                            <div className="text-sm text-gray-900">{row.description}</div>
                          </td>
                          <td className="py-2 px-3 text-gray-700">
                            {formatDateOnly(row.dueDate) || "-"}
                          </td>
                          <td className="py-2 px-3">
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                                row.status === "paid"
                                  ? "bg-emerald-100 text-emerald-700"
                                  : row.status === "processing"
                                  ? "bg-blue-100 text-blue-700"
                                  : "bg-orange-100 text-orange-700"
                              }`}
                            >
                              {row.status === "paid"
                                ? "Paid"
                                : row.status === "processing"
                                ? "Processing (ACH)"
                                : row.status.charAt(0).toUpperCase() + row.status.slice(1)}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-right font-semibold">
                            {formatCurrency(row.amount)}
                          </td>
                          <td className="py-2 px-3">
                            {row.invoiceUrl ? (
                              <a href={row.invoiceUrl} target="_blank" rel="noreferrer" className="text-blue-600 hover:text-blue-700 text-sm">
                                Invoice PDF
                              </a>
                            ) : (
                              <span className="text-xs text-gray-500">-</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
