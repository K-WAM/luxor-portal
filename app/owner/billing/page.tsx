"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/app/context/AuthContext";
import { formatDateOnly } from "@/lib/date-only";

type Bill = {
  id: string;
  propertyId: string;
  propertyAddress: string;
  description: string;
  amount: number;
  dueDate: string;
  status: "due" | "paid" | "overdue" | "pending";
  invoiceUrl?: string;
  paymentLinkUrl?: string;
};

export default function OwnerBilling() {
  const { user, role } = useAuth();
  const [properties, setProperties] = useState<{ id: string; address: string }[]>([]);
  const [selectedProperty, setSelectedProperty] = useState<string>("all");
  const [bills, setBills] = useState<Bill[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const filtered = bills.filter((b) => selectedProperty === "all" || b.propertyId === selectedProperty);
  const totalDue = filtered
    .filter((b) => b.status === "due" || b.status === "overdue")
    .reduce((sum, b) => sum + b.amount, 0);

  const uniqueProps =
    properties.length > 0
      ? properties
      : Array.from(new Set(bills.map((b) => b.propertyId))).map((id) => ({
          id,
          address: bills.find((b) => b.propertyId === id)?.propertyAddress || id,
        }));

  return (
    <div className="p-6 max-w-6xl mx-auto">
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
          <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
            <div className="text-xs uppercase text-slate-500 mb-1">Balance due</div>
            <div className="text-2xl font-semibold text-slate-900">${totalDue.toFixed(2)}</div>
          </div>
        <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
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
          <div className="text-xs uppercase text-slate-500 mb-1">Notes</div>
          <div className="text-sm text-slate-700">Payment options: Zelle (Connect@luxordev.com), or Credit Card/ACH through Stripe Payment Link on invoice.</div>
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
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-700 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 text-left">Property</th>
                <th className="px-4 py-3 text-left">Description</th>
                <th className="px-4 py-3 text-right">Amount</th>
                <th className="px-4 py-3 text-left">Due</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Invoice PDF</th>
                <th className="px-4 py-3 text-left">Payment Link</th>
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
                  <td className="px-4 py-3">
                    {bill.paymentLinkUrl ? (
                      <a href={bill.paymentLinkUrl} target="_blank" rel="noreferrer" className="text-blue-600 hover:text-blue-700 text-sm">
                        Pay Now
                      </a>
                    ) : (
                      <span className="text-xs text-slate-500">-</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        )}
      </div>
    </div>
  );
}
