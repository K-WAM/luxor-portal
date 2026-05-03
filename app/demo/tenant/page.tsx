"use client";

import { useMemo, useState } from "react";
import { formatDateOnly } from "@/lib/date-only";
import { getDemoTenantData, type DemoBillStatus, type DemoTenantBill } from "@/lib/demo/demo-data";

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);

const tenantTabs = [
  { key: "dashboard", label: "Dashboard" },
  { key: "payments", label: "Payments" },
  { key: "documents", label: "Documents" },
  { key: "maintenance", label: "Maintenance" },
] as const;

const getStatusClass = (status: DemoBillStatus) => {
  switch (status) {
    case "paid":
      return "bg-emerald-100 text-emerald-700";
    case "processing":
      return "bg-blue-100 text-blue-700";
    case "overdue":
      return "bg-red-100 text-red-700";
    case "voided":
      return "bg-slate-200 text-slate-600";
    default:
      return "bg-amber-100 text-amber-700";
  }
};

export default function TenantDemoPage() {
  const initial = useMemo(() => getDemoTenantData(), []);
  const [activeTab, setActiveTab] = useState<(typeof tenantTabs)[number]["key"]>("dashboard");
  const [bills, setBills] = useState(initial.bills);
  const [notice, setNotice] = useState<string | null>(null);

  const applyPayment = (bill: DemoTenantBill, method: "card" | "ach" | "manual") => {
    setBills((current) =>
      current.map((row) =>
        row.id === bill.id
          ? { ...row, status: method === "ach" ? "processing" : "paid", paymentMethod: method }
          : row
      )
    );

    if (method === "ach") {
      setNotice("Demo ACH payment submitted. This bill is now Processing. Bank transfers may take 2–4 business days to be confirmed.");
    } else if (method === "manual") {
      setNotice("Demo Zelle / Other payment recorded. This bill has been marked Paid for demonstration purposes.");
    } else {
      setNotice("Demo payment confirmed. This bill has been marked Paid for demonstration purposes.");
    }
  };

  const dueNow = bills.filter((bill) => bill.status === "due" || bill.status === "overdue").reduce((sum, bill) => sum + bill.amount, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold text-slate-900">Tenant Demo</h1>
        <p className="mt-2 text-sm text-slate-600">Fictional tenant experience for PAL248 only. No live billing, Stripe, or client data is used.</p>
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
        <div className="flex flex-wrap gap-2">
          {tenantTabs.map((tab) => {
            const active = activeTab === tab.key;
            return <button key={tab.key} type="button" onClick={() => setActiveTab(tab.key)} className={`rounded-xl px-4 py-2 text-sm font-medium ${active ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-100"}`}>{tab.label}</button>;
          })}
        </div>
      </div>
      {notice && <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">{notice}</div>}

      {activeTab === "dashboard" && (
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="text-xs uppercase tracking-wide text-slate-500">Property</div><div className="mt-2 text-2xl font-semibold text-slate-900">{initial.property.shortName}</div></div>
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="text-xs uppercase tracking-wide text-slate-500">Monthly Rent</div><div className="mt-2 text-2xl font-semibold text-slate-900">{formatCurrency(initial.property.monthlyRent)}</div></div>
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="text-xs uppercase tracking-wide text-slate-500">Lease Term</div><div className="mt-2 text-sm font-semibold text-slate-900">{initial.snapshot.leaseLabel}</div></div>
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="text-xs uppercase tracking-wide text-slate-500">Upcoming Balance</div><div className="mt-2 text-2xl font-semibold text-slate-900">{formatCurrency(initial.snapshot.upcomingBalance)}</div></div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-xl font-semibold text-slate-900">Resident Snapshot</h2>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div><div className="text-sm text-slate-500">Resident</div><div className="font-medium text-slate-900">{initial.snapshot.residentName}</div><div className="text-sm text-slate-600">{initial.snapshot.residentEmail}</div></div>
              <div><div className="text-sm text-slate-500">Property</div><div className="font-medium text-slate-900">{initial.property.address}, {initial.property.cityState}</div><div className="text-sm text-slate-600">{initial.property.type}</div></div>
            </div>
          </div>
        </div>
      )}

      {activeTab === "payments" && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="text-xl font-semibold text-slate-900">Pay Now</h2><p className="mt-1 text-sm text-slate-600">Demo interactions update bill status in local state only and reset on refresh.</p><div className="mt-3 text-2xl font-semibold text-slate-900">{formatCurrency(dueNow)}</div></div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-slate-200 text-left text-slate-500"><tr><th className="pb-2">Description</th><th className="pb-2">Due Date</th><th className="pb-2 text-right">Amount</th><th className="pb-2">Status</th><th className="pb-2 text-right">Actions</th></tr></thead>
                <tbody>
                  {bills.map((bill) => {
                    const disabled = bill.status === "paid" || bill.status === "processing" || bill.status === "voided";
                    return <tr key={bill.id} className="border-b border-slate-100"><td className="py-3"><div className="font-medium text-slate-900">{bill.description}</div><div className="text-xs text-slate-500">{bill.category}</div></td><td className="py-3 text-slate-700">{formatDateOnly(bill.dueDate) || bill.dueDate}</td><td className="py-3 text-right font-medium text-slate-900">{formatCurrency(bill.amount)}</td><td className="py-3"><span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium capitalize ${getStatusClass(bill.status)}`}>{bill.status}</span></td><td className="py-3"><div className="flex flex-wrap justify-end gap-2"><button disabled={disabled} onClick={() => applyPayment(bill, "card")} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50">Pay by Card</button><button disabled={disabled} onClick={() => applyPayment(bill, "ach")} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50">Pay by ACH</button><button disabled={disabled} onClick={() => applyPayment(bill, "manual")} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50">Zelle / Other</button></div></td></tr>;
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === "documents" && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-xl font-semibold text-slate-900">Demo Documents</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {initial.documents.map((doc) => <div key={doc.id} className="rounded-xl border border-slate-200 p-4"><div className="flex items-start justify-between gap-3"><div><div className="text-sm font-semibold text-slate-900">{doc.title}</div><div className="text-xs text-slate-500">{doc.scope}</div></div><button onClick={() => setNotice("Demo document placeholder opened. No real file is attached in Demo Mode.")} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50">Open</button></div><div className="mt-3 text-sm text-slate-600">{doc.type} · Uploaded {formatDateOnly(doc.uploadedAt) || doc.uploadedAt}</div></div>)}
          </div>
        </div>
      )}

      {activeTab === "maintenance" && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-xl font-semibold text-slate-900">Maintenance Requests</h2>
          <div className="mt-4 grid gap-3">
            {initial.maintenance.map((item) => <div key={item.id} className="rounded-xl border border-slate-200 p-4"><div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between"><div><div className="text-sm font-semibold text-slate-900">{item.title}</div><div className="text-xs text-slate-500">{item.category}</div><p className="mt-2 text-sm text-slate-600">{item.details}</p></div><div className="text-right"><span className="inline-flex rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">{item.status}</span><div className="mt-2 text-xs text-slate-500">Opened {formatDateOnly(item.openedAt) || item.openedAt}</div></div></div></div>)}
          </div>
        </div>
      )}
    </div>
  );
}
