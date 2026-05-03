"use client";

import { useMemo, useState } from "react";
import { formatDateOnly } from "@/lib/date-only";
import { getDemoOwnerData, type DemoBillStatus, type DemoOwnerBill } from "@/lib/demo/demo-data";

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);

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

const ownerTabs = [
  { key: "dashboard", label: "Dashboard" },
  { key: "reports", label: "Reports" },
  { key: "bills", label: "Bills" },
  { key: "documents", label: "Documents" },
  { key: "maintenance", label: "Maintenance" },
] as const;

export default function OwnerDemoPage() {
  const initial = useMemo(() => getDemoOwnerData(), []);
  const [activeTab, setActiveTab] = useState<(typeof ownerTabs)[number]["key"]>("dashboard");
  const [bills, setBills] = useState(initial.bills);
  const [notice, setNotice] = useState<string | null>(null);

  const totalMarketValue = initial.properties.reduce((sum, property) => sum + property.marketValue, 0);
  const totalCostBasis = initial.properties.reduce((sum, property) => sum + property.costBasis, 0);

  const applyPayment = (bill: DemoOwnerBill, method: "card" | "ach" | "manual") => {
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold text-slate-900">Owner Demo</h1>
        <p className="mt-2 text-sm text-slate-600">Fictional owner portfolio across PAL248, COR512, and SUN904. No real Luxor records are shown.</p>
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
        <div className="flex flex-wrap gap-2">
          {ownerTabs.map((tab) => {
            const active = activeTab === tab.key;
            return <button key={tab.key} type="button" onClick={() => setActiveTab(tab.key)} className={`rounded-xl px-4 py-2 text-sm font-medium ${active ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-100"}`}>{tab.label}</button>;
          })}
        </div>
      </div>
      {notice && <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">{notice}</div>}

      {activeTab === "dashboard" && (
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="text-xs uppercase tracking-wide text-slate-500">Portfolio Market Value</div><div className="mt-2 text-2xl font-semibold text-slate-900">{formatCurrency(totalMarketValue)}</div></div>
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="text-xs uppercase tracking-wide text-slate-500">Cost Basis</div><div className="mt-2 text-2xl font-semibold text-slate-900">{formatCurrency(totalCostBasis)}</div></div>
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="text-xs uppercase tracking-wide text-slate-500">YTD Net Income</div><div className="mt-2 text-2xl font-semibold text-emerald-700">{formatCurrency(initial.report.netIncome)}</div></div>
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="text-xs uppercase tracking-wide text-slate-500">Portfolio ROI</div><div className="mt-2 text-2xl font-semibold text-slate-900">{initial.report.roi.toFixed(2)}%</div></div>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {initial.properties.map((property) => (
              <div key={property.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{property.shortName}</div>
                <h2 className="mt-2 text-xl font-semibold text-slate-900">{property.address}</h2>
                <p className="text-sm text-slate-600">{property.cityState}</p>
                <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div><div className="text-slate-500">Type</div><div className="font-medium text-slate-900">{property.type}</div></div>
                  <div><div className="text-slate-500">Monthly Rent</div><div className="font-medium text-slate-900">{formatCurrency(property.monthlyRent)}</div></div>
                  <div><div className="text-slate-500">Tenant</div><div className="font-medium text-slate-900">{property.tenantName}</div></div>
                  <div><div className="text-slate-500">Lease End</div><div className="font-medium text-slate-900">{formatDateOnly(property.leaseEnd) || property.leaseEnd}</div></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === "reports" && (
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-5">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="text-xs uppercase tracking-wide text-slate-500">YTD Income</div><div className="mt-2 text-2xl font-semibold text-slate-900">{formatCurrency(initial.report.ytdIncome)}</div></div>
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="text-xs uppercase tracking-wide text-slate-500">YTD Expenses</div><div className="mt-2 text-2xl font-semibold text-slate-900">{formatCurrency(initial.report.ytdExpenses)}</div></div>
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="text-xs uppercase tracking-wide text-slate-500">Net Income</div><div className="mt-2 text-2xl font-semibold text-emerald-700">{formatCurrency(initial.report.netIncome)}</div></div>
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="text-xs uppercase tracking-wide text-slate-500">Maintenance Burden</div><div className="mt-2 text-2xl font-semibold text-slate-900">{initial.report.maintenanceBurden.toFixed(2)}%</div></div>
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="text-xs uppercase tracking-wide text-slate-500">Appreciation</div><div className="mt-2 text-2xl font-semibold text-slate-900">{formatCurrency(initial.report.appreciation)}</div></div>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900">Expense Summary</h2>
              <div className="mt-4 space-y-3">
                {initial.report.expenseSummary.map((row) => <div key={row.label} className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3 text-sm"><span className="text-slate-700">{row.label}</span><span className="font-semibold text-slate-900">{formatCurrency(row.amount)}</span></div>)}
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900">Payment History</h2>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-slate-200 text-left text-slate-500"><tr><th className="pb-2">Month</th><th className="pb-2 text-right">Collected</th><th className="pb-2 text-right">Outstanding</th></tr></thead>
                  <tbody>{initial.report.paymentHistory.map((row) => <tr key={row.month} className="border-b border-slate-100"><td className="py-3 text-slate-900">{row.month}</td><td className="py-3 text-right font-medium text-slate-900">{formatCurrency(row.collected)}</td><td className="py-3 text-right font-medium text-slate-700">{formatCurrency(row.outstanding)}</td></tr>)}</tbody>
                </table>
              </div>
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Property Timeline</h2>
            <div className="mt-4 grid gap-4 md:grid-cols-3">
              {initial.report.timeline.map((row) => {
                const property = initial.properties.find((item) => item.id === row.propertyId)!;
                return <div key={row.propertyId} className="rounded-xl border border-slate-200 p-4"><div className="text-sm font-semibold text-slate-900">{property.shortName}</div><div className="mt-3 space-y-2">{row.milestones.map((milestone) => <div key={`${row.propertyId}-${milestone.label}`} className="flex items-center justify-between gap-3 text-sm"><span className="text-slate-600">{milestone.label}</span><span className="font-medium text-slate-900">{formatDateOnly(milestone.date) || milestone.date}</span></div>)}</div></div>;
              })}
            </div>
          </div>
        </div>
      )}

      {activeTab === "bills" && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-xl font-semibold text-slate-900">Owner Bills</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 text-left text-slate-500"><tr><th className="pb-2">Property</th><th className="pb-2">Description</th><th className="pb-2">Due Date</th><th className="pb-2 text-right">Amount</th><th className="pb-2">Status</th><th className="pb-2 text-right">Actions</th></tr></thead>
              <tbody>
                {bills.map((bill) => {
                  const property = initial.properties.find((item) => item.id === bill.propertyId)!;
                  const disabled = bill.status === "paid" || bill.status === "processing" || bill.status === "voided";
                  return <tr key={bill.id} className="border-b border-slate-100"><td className="py-3 font-medium text-slate-900">{property.shortName}</td><td className="py-3 text-slate-700">{bill.description}</td><td className="py-3 text-slate-700">{formatDateOnly(bill.dueDate) || bill.dueDate}</td><td className="py-3 text-right font-medium text-slate-900">{formatCurrency(bill.amount)}</td><td className="py-3"><span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium capitalize ${getStatusClass(bill.status)}`}>{bill.status}</span></td><td className="py-3"><div className="flex flex-wrap justify-end gap-2"><button disabled={disabled} onClick={() => applyPayment(bill, "card")} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50">Pay by Card</button><button disabled={disabled} onClick={() => applyPayment(bill, "ach")} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50">Pay by ACH</button><button disabled={disabled} onClick={() => applyPayment(bill, "manual")} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50">Zelle / Other</button></div></td></tr>;
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === "documents" && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-xl font-semibold text-slate-900">Demo Documents</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {initial.documents.map((doc) => {
              const property = initial.properties.find((item) => item.id === doc.propertyId)!;
              return <div key={doc.id} className="rounded-xl border border-slate-200 p-4"><div className="flex items-start justify-between gap-3"><div><div className="text-sm font-semibold text-slate-900">{doc.title}</div><div className="text-xs text-slate-500">{property.shortName} · {doc.scope}</div></div><button onClick={() => setNotice("Demo document placeholder opened. No real file is attached in Demo Mode.")} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50">Open</button></div><div className="mt-3 text-sm text-slate-600">{doc.type} · Uploaded {formatDateOnly(doc.uploadedAt) || doc.uploadedAt}</div></div>;
            })}
          </div>
        </div>
      )}

      {activeTab === "maintenance" && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-xl font-semibold text-slate-900">Maintenance</h2>
          <div className="mt-4 grid gap-3">
            {initial.maintenance.map((item) => {
              const property = initial.properties.find((row) => row.id === item.propertyId)!;
              return <div key={item.id} className="rounded-xl border border-slate-200 p-4"><div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between"><div><div className="text-sm font-semibold text-slate-900">{item.title}</div><div className="text-xs text-slate-500">{property.shortName} · {item.category}</div><p className="mt-2 text-sm text-slate-600">{item.details}</p></div><div className="text-right"><span className="inline-flex rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">{item.status}</span><div className="mt-2 text-xs text-slate-500">Opened {formatDateOnly(item.openedAt) || item.openedAt}</div></div></div></div>;
            })}
          </div>
        </div>
      )}
    </div>
  );
}
