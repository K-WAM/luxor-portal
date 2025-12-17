"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/app/context/AuthContext";

type Bill = {
  id: string;
  propertyId: string;
  propertyAddress: string;
  description: string;
  amount: number;
  dueDate: string;
  status: "due" | "paid" | "overdue" | "pending";
  invoiceUrl?: string;
};

// In lieu of a backend feed, show placeholder data so owners can review fees.
const sampleBills: Bill[] = [
  {
    id: "b1",
    propertyId: "prop-1",
    propertyAddress: "317 West Riverbend Drive, Sunrise, FL, 33326",
    description: "Property management fee - December",
    amount: 350,
    dueDate: "2025-12-20",
    status: "due",
    invoiceUrl: "#",
  },
  {
    id: "b2",
    propertyId: "prop-1",
    propertyAddress: "317 West Riverbend Drive, Sunrise, FL, 33326",
    description: "Lease renewal prep",
    amount: 150,
    dueDate: "2025-12-05",
    status: "paid",
    invoiceUrl: "#",
  },
  {
    id: "b3",
    propertyId: "prop-2",
    propertyAddress: "10370 Buena Ventura Dr., Boca Raton, FL, 33498",
    description: "Property management fee - November",
    amount: 325,
    dueDate: "2025-11-20",
    status: "overdue",
    invoiceUrl: "#",
  },
];

export default function OwnerBilling() {
  const { user, role } = useAuth();
  const [selectedProperty, setSelectedProperty] = useState<string>("all");
  const [bills, setBills] = useState<Bill[]>([]);

  useEffect(() => {
    // TODO: replace with real fetch to /api/owner/billing once available
    setBills(sampleBills);
  }, []);

  const filtered = bills.filter((b) => selectedProperty === "all" || b.propertyId === selectedProperty);
  const totalDue = filtered
    .filter((b) => b.status === "due" || b.status === "overdue")
    .reduce((sum, b) => sum + b.amount, 0);

  const uniqueProps = Array.from(new Set(bills.map((b) => b.propertyId))).map((id) => ({
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
          <div className="text-sm text-slate-700">Online payment coming soon via Stripe.</div>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Invoices</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-700 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 text-left">Property</th>
                <th className="px-4 py-3 text-left">Description</th>
                <th className="px-4 py-3 text-right">Amount</th>
                <th className="px-4 py-3 text-left">Due</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Invoice</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map((bill) => (
                <tr key={bill.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 text-slate-900">{bill.propertyAddress}</td>
                  <td className="px-4 py-3 text-slate-700">{bill.description}</td>
                  <td className="px-4 py-3 text-right text-slate-900">${bill.amount.toFixed(2)}</td>
                  <td className="px-4 py-3 text-slate-700">
                    {new Date(bill.dueDate).toLocaleDateString()}
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
                      <a href={bill.invoiceUrl} className="text-blue-600 hover:text-blue-700 text-sm">
                        View
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
      </div>
    </div>
  );
}
