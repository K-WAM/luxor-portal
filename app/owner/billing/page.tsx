"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/app/context/AuthContext";
import { formatDateOnly, parseDateOnly } from "@/lib/date-only";

type Bill = {
  id: string;
  propertyId: string;
  propertyAddress: string;
  description: string;
  amount: number;
  dueDate: string;
  status: "due" | "paid" | "overdue" | "pending" | "voided";
  invoiceUrl?: string;
  paymentLinkUrl?: string;
  voidedAt?: string;
};

const DAY_MS = 24 * 60 * 60 * 1000;

const getDueDateMs = (dateStr?: string | null) => {
  const date = parseDateOnly(dateStr);
  return date ? date.getTime() : null;
};

const getQualifyingBills = (items: Bill[], nowMs: number) => {
  const windowEndMs = nowMs + 30 * DAY_MS;
  return items.filter((bill) => {
    if (bill.status === "paid") return false;
    if (bill.status === "voided") return false;
    const dueMs = getDueDateMs(bill.dueDate);
    if (dueMs === null) return false;
    return dueMs <= windowEndMs;
  });
};

if (process.env.NODE_ENV !== "production") {
  const testNowMs = Date.UTC(2026, 0, 30, 12);
  const testBills: Bill[] = [
    {
      id: "overdue",
      propertyId: "p1",
      propertyAddress: "Test",
      description: "Overdue",
      amount: 1,
      dueDate: "2026-01-01",
      status: "due",
    },
    {
      id: "within",
      propertyId: "p1",
      propertyAddress: "Test",
      description: "Within",
      amount: 1,
      dueDate: "2026-02-09",
      status: "due",
    },
    {
      id: "beyond",
      propertyId: "p1",
      propertyAddress: "Test",
      description: "Beyond",
      amount: 1,
      dueDate: "2026-03-02",
      status: "due",
    },
  ];
  const ids = getQualifyingBills(testBills, testNowMs)
    .map((bill) => bill.id)
    .sort()
    .join(",");
  const expected = ["overdue", "within"].sort().join(",");
  if (ids !== expected) {
    console.warn("Qualifying invoice filter failed dev check", { ids, expected });
  }
}

export default function OwnerBilling() {
  const { user, role } = useAuth();
  const [properties, setProperties] = useState<{ id: string; address: string }[]>([]);
  const [selectedProperty, setSelectedProperty] = useState<string>("all");
  const [bills, setBills] = useState<Bill[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<string[]>([]);
  const [checkoutLoading, setCheckoutLoading] = useState<"bank" | "card" | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  useEffect(() => {
    const loadProps = async () => {
      try {
        const res = await fetch("/api/properties", { cache: "no-store" });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to load properties");
        setProperties(data.map((p: any) => ({ id: p.id, address: p.address })));
        if (!selectedProperty && data.length) {
          setSelectedProperty(data[0].id);
        }
      } catch (err: any) {
        console.error(err);
      }
    };
    loadProps();
  }, []);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const params = selectedProperty && selectedProperty !== "all" ? `?propertyId=${selectedProperty}` : "";
        const endpoint = role === "admin" ? "/api/admin/billing" : "/api/owner/billing";
        const res = await fetch(`${endpoint}${params}`, { cache: "no-store" });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to load billing");
        setBills(
          data.map((b: any) => ({
            id: b.id,
            propertyId: b.propertyId,
            propertyAddress: b.propertyAddress,
            description: b.description,
            amount: b.amount,
            dueDate: b.dueDate,
            status: b.status,
            invoiceUrl: b.invoiceUrl,
            paymentLinkUrl: b.paymentLinkUrl,
            voidedAt: b.voidedAt,
          }))
        );
      } catch (err: any) {
        setError(err.message || "Failed to load billing");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [selectedProperty, role]);

  const filtered = bills
    .filter((b) => selectedProperty === "all" || b.propertyId === selectedProperty)
    .sort((a, b) => {
      const aDate = parseDateOnly(a.dueDate);
      const bDate = parseDateOnly(b.dueDate);
      const aTime = aDate ? aDate.getTime() : Number.MAX_SAFE_INTEGER;
      const bTime = bDate ? bDate.getTime() : Number.MAX_SAFE_INTEGER;
      return aTime - bTime;
    });

  const nowMs = Date.now();
  const qualifyingBills = getQualifyingBills(filtered, nowMs);

  const totalDue = qualifyingBills.reduce((sum, b) => sum + b.amount, 0);

  useEffect(() => {
    setSelectedInvoiceIds(qualifyingBills.map((b) => b.id));
  }, [selectedProperty, bills.length]);

  const selectedSubtotal = qualifyingBills
    .filter((b) => selectedInvoiceIds.includes(b.id))
    .reduce((sum, b) => sum + b.amount, 0);

  const handleCheckout = async (method: "bank" | "card") => {
    if (!selectedInvoiceIds.length) return;
    try {
      setCheckoutLoading(method);
      setCheckoutError(null);
      const res = await fetch("/api/billing/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          selectedInvoiceIds,
          paymentMethod: method,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to start checkout");
      if (data?.url) {
        window.location.href = data.url;
      }
    } catch (err: any) {
      setCheckoutError(err.message || "Failed to start checkout");
    } finally {
      setCheckoutLoading(null);
    }
  };

  const uniqueProps =
    properties.length > 0
      ? properties
      : Array.from(new Set(bills.map((b) => b.propertyId))).map((id) => ({
          id,
          address: bills.find((b) => b.propertyId === id)?.propertyAddress || id,
        }));

  return (
    <div className="px-4 py-6 md:p-6 max-w-6xl mx-auto">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-3xl font-semibold text-slate-900">Billing</h1>
          <p className="text-slate-600">Review Luxor management fees for your properties.</p>
        </div>
        <div className="text-sm text-slate-700">
          <div className="font-medium">Signed in as</div>
          <div>{user?.email || "Unknown"} · {role || "owner"}</div>
        </div>
      </div>

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
                    {qualifyingBills.map((bill) => (
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
                            {bill.propertyAddress} · {bill.description || "Invoice"}
                          </div>
                          <div className="text-xs text-slate-500">
                            Due {formatDateOnly(bill.dueDate) || "-"} ·{" "}
                            <span className="font-semibold text-slate-700">${bill.amount.toFixed(2)}</span>
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>
                  <div className="flex items-center justify-between text-sm text-slate-700 pt-2 border-t border-slate-100">
                    <span>Subtotal (selected)</span>
                    <span className="font-semibold">${selectedSubtotal.toFixed(2)}</span>
                  </div>
                  {checkoutError && <div className="text-xs text-red-600">{checkoutError}</div>}
                  <div className="border-t border-slate-100 mt-3 pt-3">
                    <div className="inline-flex flex-col justify-center h-11 md:h-9 px-3 rounded border border-slate-400 bg-slate-100 text-sm md:text-xs text-slate-800">
                      <span>Zelle · Connect@luxordev.com</span>
                      <span className="text-[11px] text-slate-500">No processing fee</span>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 pt-2">
                    <button
                      onClick={() => handleCheckout("bank")}
                      disabled={checkoutLoading !== null || selectedInvoiceIds.length === 0}
                      className="h-11 md:h-9 px-4 md:px-3 rounded border border-slate-400 bg-slate-100 text-slate-800 text-sm md:text-xs hover:bg-slate-200 disabled:opacity-60"
                    >
                      {checkoutLoading === "bank" ? "Starting..." : "Pay Balance by Bank (ACH)"}
                    </button>
                    <button
                      onClick={() => handleCheckout("card")}
                      disabled={checkoutLoading !== null || selectedInvoiceIds.length === 0}
                      className="h-11 md:h-9 px-4 md:px-3 rounded border border-slate-400 bg-slate-100 text-slate-800 text-sm md:text-xs hover:bg-slate-200 disabled:opacity-60"
                    >
                      {checkoutLoading === "card" ? "Starting..." : "Pay Balance by Card"}
                    </button>
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
              value={selectedProperty}
              onChange={(e) => setSelectedProperty(e.target.value)}
              className="w-full border border-slate-300 rounded px-3 py-2 text-sm bg-white"
            >
              <option value="all">All properties</option>
              {uniqueProps.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.address}
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

      <div className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Invoices</h2>
        </div>
        {error && <div className="px-4 py-3 text-sm text-red-600">{error}</div>}
        {loading ? (
          <div className="p-6 text-center text-slate-500">Loading...</div>
        ) : (
          <>
            <div className="md:hidden space-y-3 p-4">
              {filtered.map((bill) => (
                <div key={bill.id} className="border border-slate-200 rounded-lg p-3">
                  <div className="text-sm font-semibold text-slate-900">{bill.propertyAddress}</div>
                  <div className="text-sm text-slate-700 mt-1">{bill.description}</div>
                  <div className="mt-2 flex items-center justify-between text-sm">
                    <span className="text-slate-500">Due</span>
                    <span className="text-slate-700">{formatDateOnly(bill.dueDate) || "-"}</span>
                  </div>
                  <div className="mt-1 flex items-center justify-between text-sm">
                    <span className="text-slate-500">Amount</span>
                    <span className="font-semibold text-slate-900">${bill.amount.toFixed(2)}</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <span
                      className={`px-2 py-1 rounded-full text-xs font-semibold ${
                        bill.status === "paid"
                          ? "bg-emerald-100 text-emerald-700"
                          : bill.status === "overdue"
                          ? "bg-red-100 text-red-700"
                          : bill.status === "voided"
                          ? "bg-slate-100 text-slate-600"
                          : "bg-amber-100 text-amber-800"
                      }`}
                    >
                      {bill.status.charAt(0).toUpperCase() + bill.status.slice(1)}
                    </span>
                    {bill.invoiceUrl ? (
                      <a
                        href={bill.invoiceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-blue-600 hover:text-blue-700 text-xs"
                      >
                        Invoice PDF
                      </a>
                    ) : (
                      <span className="text-xs text-slate-500">Not uploaded</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-700 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3 text-left">Property</th>
                    <th className="px-4 py-3 text-left">Description</th>
                    <th className="px-4 py-3 text-right">Amount</th>
                    <th className="px-4 py-3 text-left">Due</th>
                    <th className="px-4 py-3 text-left">Status</th>
                    <th className="px-4 py-3 text-left">Invoice PDF</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map((bill) => (
                    <tr key={bill.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 text-slate-900">{bill.propertyAddress}</td>
                      <td className="px-4 py-3 text-slate-700">{bill.description}</td>
                      <td className="px-4 py-3 text-right text-slate-900">${bill.amount.toFixed(2)}</td>
                      <td className="px-4 py-3 text-slate-700">
                        {formatDateOnly(bill.dueDate) || "-"}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`px-2 py-1 rounded-full text-xs font-semibold ${
                            bill.status === "paid"
                              ? "bg-emerald-100 text-emerald-700"
                              : bill.status === "overdue"
                              ? "bg-red-100 text-red-700"
                              : bill.status === "voided"
                              ? "bg-slate-100 text-slate-600"
                              : "bg-amber-100 text-amber-800"
                          }`}
                        >
                          {bill.status.charAt(0).toUpperCase() + bill.status.slice(1)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {bill.invoiceUrl ? (
                          <a href={bill.invoiceUrl} target="_blank" rel="noreferrer" className="text-blue-600 hover:text-blue-700 text-sm">
                            Invoice PDF
                          </a>
                        ) : (
                          <span className="text-xs text-slate-500">Not uploaded</span>
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
    </div>
  );
}


