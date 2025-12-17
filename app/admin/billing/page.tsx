"use client";

import { useMemo } from "react";

type BillRow = {
  id: string;
  ownerEmail: string;
  property: string;
  description: string;
  amount: number;
  dueDate: string;
  status: "due" | "paid" | "overdue" | "pending";
  invoiceUrl?: string;
};

const sampleAdminBills: BillRow[] = [
  {
    id: "pm-1001",
    ownerEmail: "kwamwad@gmail.com",
    property: "317 West Riverbend Drive, Sunrise, FL, 33326",
    description: "Property management fee - December",
    amount: 350,
    dueDate: "2025-12-20",
    status: "due",
    invoiceUrl: "#",
  },
  {
    id: "pm-1002",
    ownerEmail: "kwamwad@gmail.com",
    property: "10370 Buena Ventura Dr., Boca Raton, FL, 33498",
    description: "Property management fee - November",
    amount: 325,
    dueDate: "2025-11-20",
    status: "overdue",
    invoiceUrl: "#",
  },
  {
    id: "pm-1003",
    ownerEmail: "juana.g.b@gmail.com",
    property: "317 West Riverbend Drive, Sunrise, FL, 33326",
    description: "Lease renewal prep",
    amount: 150,
    dueDate: "2025-12-05",
    status: "paid",
    invoiceUrl: "#",
  },
];

export default function AdminBilling() {
  const totals = useMemo(() => {
    const due = sampleAdminBills.filter((b) => b.status === "due" || b.status === "overdue").reduce((s, b) => s + b.amount, 0);
    const paid = sampleAdminBills.filter((b) => b.status === "paid").reduce((s, b) => s + b.amount, 0);
    return { due, paid };
  }, []);

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-3xl font-semibold text-slate-900">Billing (PM Fees)</h1>
          <p className="text-slate-600">Monitor owner billing, payments, and send reminders.</p>
        </div>
        <div className="text-sm text-slate-700 space-y-1">
          <div className="font-medium">Balance due</div>
          <div className="text-xl font-semibold text-red-600">${totals.due.toFixed(2)}</div>
          <div className="text-xs text-slate-500">Paid to date: ${totals.paid.toFixed(2)}</div>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Owner Bills</h2>
          <span className="text-xs text-slate-500">Stripe collection coming soon</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-700">
              <tr>
                <th className="px-4 py-3 text-left">Owner</th>
                <th className="px-4 py-3 text-left">Property</th>
                <th className="px-4 py-3 text-left">Description</th>
                <th className="px-4 py-3 text-right">Amount</th>
                <th className="px-4 py-3 text-left">Due</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Invoice</th>
                <th className="px-4 py-3 text-left">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sampleAdminBills.map((bill) => (
                <tr key={bill.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 text-slate-900">{bill.ownerEmail}</td>
                  <td className="px-4 py-3 text-slate-800">{bill.property}</td>
                  <td className="px-4 py-3 text-slate-700">{bill.description}</td>
                  <td className="px-4 py-3 text-right text-slate-900">${bill.amount.toFixed(2)}</td>
                  <td className="px-4 py-3 text-slate-700">{new Date(bill.dueDate).toLocaleDateString()}</td>
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
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button className="text-xs px-2 py-1 rounded bg-slate-900 text-white hover:bg-slate-800">
                        Send reminder
                      </button>
                      <button className="text-xs px-2 py-1 rounded bg-white border border-slate-300 text-slate-700 hover:bg-slate-50">
                        Add invoice
                      </button>
                    </div>
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
