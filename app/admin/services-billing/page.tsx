"use client";

import { useEffect, useMemo, useState } from "react";
import { formatDateOnly } from "@/lib/date-only";
import {
  getServicesInvoiceDisplayStatus,
  getServicesInvoiceShortDescription,
  getServicesInvoiceStatusBadgeClass,
} from "@/lib/services-billing";

type ServicesInvoiceRow = {
  id: string;
  invoiceNumber: string;
  clientName: string;
  clientEmail: string;
  companyName?: string | null;
  description: string;
  issueDate: string;
  dueDate: string;
  subtotal: number;
  total: number;
  notes?: string | null;
  status: string;
  paidDate?: string | null;
  pdfUrl?: string | null;
  hostedPagePath: string;
};

export default function ServicesBillingPage() {
  const [rows, setRows] = useState<ServicesInvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showPaid, setShowPaid] = useState(false);
  const [showVoided, setShowVoided] = useState(false);
  const [showDesktopSite, setShowDesktopSite] = useState(false);
  const [showCreateMobile, setShowCreateMobile] = useState(false);
  const [form, setForm] = useState({
    clientName: "",
    clientEmail: "",
    companyName: "",
    description: "",
    issueDate: new Date().toISOString().slice(0, 10),
    dueDate: "",
    amount: "",
    notes: "",
  });

  const loadRows = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/admin/services-billing", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load services invoices");
      setRows(data.rows || []);
    } catch (err: any) {
      setError(err.message || "Failed to load services invoices");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRows();
  }, []);

  const visibleRows = useMemo(() => {
    const sorted = [...rows].sort((a, b) => {
      const aTime = new Date(`${a.dueDate}T00:00:00Z`).getTime();
      const bTime = new Date(`${b.dueDate}T00:00:00Z`).getTime();
      return aTime - bTime;
    });
    return sorted.filter((row) => {
      const displayStatus = getServicesInvoiceDisplayStatus(row.status, row.dueDate);
      if (displayStatus === "Paid" && !showPaid) return false;
      if (displayStatus === "Voided" && !showVoided) return false;
      return true;
    });
  }, [rows, showPaid, showVoided]);

  const handleCreate = async () => {
    try {
      setSaving(true);
      setError(null);
      setNotice(null);
      const res = await fetch("/api/admin/services-billing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientName: form.clientName,
          clientEmail: form.clientEmail,
          companyName: form.companyName,
          description: form.description,
          issueDate: form.issueDate,
          dueDate: form.dueDate,
          amount: form.amount,
          notes: form.notes,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create invoice");
      setForm({
        clientName: "",
        clientEmail: "",
        companyName: "",
        description: "",
        issueDate: new Date().toISOString().slice(0, 10),
        dueDate: "",
        amount: "",
        notes: "",
      });
      setNotice(data.warning ? `${data.invoiceNumber} created. ${data.warning}` : `Created ${data.invoiceNumber}`);
      await loadRows();
    } catch (err: any) {
      setError(err.message || "Failed to create invoice");
    } finally {
      setSaving(false);
    }
  };

  const handleMarkPaid = async (id: string) => {
    try {
      setSaving(true);
      setError(null);
      const res = await fetch("/api/admin/services-billing", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status: "paid" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to mark invoice paid");
      await loadRows();
    } catch (err: any) {
      setError(err.message || "Failed to mark invoice paid");
    } finally {
      setSaving(false);
    }
  };

  const handleVoid = async (id: string) => {
    const voidReason = window.prompt("Optional void reason", "") ?? "";
    try {
      setSaving(true);
      setError(null);
      const res = await fetch("/api/services-billing/void-invoice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, voidReason }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to void invoice");
      await loadRows();
    } catch (err: any) {
      setError(err.message || "Failed to void invoice");
    } finally {
      setSaving(false);
    }
  };

  const totalDue = visibleRows.reduce((sum, row) => {
    const displayStatus = getServicesInvoiceDisplayStatus(row.status, row.dueDate);
    if (displayStatus === "Paid" || displayStatus === "Voided") return sum;
    return sum + Number(row.total || 0);
  }, 0);

  const renderRow = (row: ServicesInvoiceRow, compact = false) => {
    const displayStatus = getServicesInvoiceDisplayStatus(row.status, row.dueDate);
    const showMarkPaid = displayStatus !== "Paid" && displayStatus !== "Voided";
    const showVoidButton = displayStatus !== "Paid" && displayStatus !== "Voided";

    return (
      <div key={row.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs uppercase tracking-wide text-slate-500">{formatDateOnly(row.dueDate) || "-"}</div>
            <div className="mt-1 text-sm font-semibold text-slate-900">{row.clientName}</div>
            <div className="text-xs text-slate-500 truncate">{row.clientEmail}</div>
          </div>
          <div className="text-sm font-semibold text-slate-900">${Number(row.total || 0).toFixed(2)}</div>
        </div>
        <div className="mt-2 text-sm text-slate-700 break-words">{getServicesInvoiceShortDescription(row.description)}</div>
        {!compact && (
          <div className="mt-2 text-xs text-slate-500">
            <span className="font-medium text-slate-600">{row.invoiceNumber}</span>
            {row.companyName ? ` • ${row.companyName}` : ""}
          </div>
        )}
        <div className="mt-3 flex items-center justify-between gap-3">
          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${getServicesInvoiceStatusBadgeClass(displayStatus)}`}>
            {displayStatus}
          </span>
          <div className="flex items-center gap-2">
            {!compact && (
              <>
                <a href={row.hostedPagePath} target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:text-blue-700">
                  Hosted Page
                </a>
                {row.pdfUrl && (
                  <a href={row.pdfUrl} target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:text-blue-700">
                    PDF
                  </a>
                )}
              </>
            )}
            {showMarkPaid && (
              <button
                type="button"
                onClick={() => handleMarkPaid(row.id)}
                disabled={saving}
                className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                Mark Paid
              </button>
            )}
            {showVoidButton && (
              <button
                type="button"
                onClick={() => handleVoid(row.id)}
                disabled={saving}
                className="rounded-md border border-red-300 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
              >
                Void
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Services Billing</h1>
        <p className="mt-1 text-sm text-slate-500">Portal-generated service invoices for Luxor professional work.</p>
      </div>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
      {notice && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">{notice}</div>}

      <div className="md:hidden">
        <button
          type="button"
          onClick={() => setShowDesktopSite((prev) => !prev)}
          className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          {showDesktopSite ? "Back to Mobile View" : "View Desktop Site for More Options"}
        </button>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700">Generate Invoice</h2>
            <p className="mt-0.5 text-xs text-slate-400">Create a Luxor-owned services invoice and hosted payment page.</p>
          </div>
          <button
            type="button"
            onClick={() => setShowCreateMobile((prev) => !prev)}
            className="md:hidden inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-300 bg-white text-lg font-medium text-slate-700 hover:bg-slate-50"
            aria-label={showCreateMobile ? "Collapse generate invoice form" : "Expand generate invoice form"}
          >
            {showCreateMobile ? "−" : "+"}
          </button>
        </div>
        <div className={`${showCreateMobile ? "block" : "hidden"} md:block`}>
          <div className="grid grid-cols-1 gap-4 px-4 py-4 md:grid-cols-2 lg:grid-cols-3">
            <div className="flex flex-col text-sm">
              <label className="mb-1 text-slate-600">Client name</label>
              <input className="rounded border border-slate-300 px-3 py-2" value={form.clientName} onChange={(e) => setForm((prev) => ({ ...prev, clientName: e.target.value }))} />
            </div>
            <div className="flex flex-col text-sm">
              <label className="mb-1 text-slate-600">Client email</label>
              <input className="rounded border border-slate-300 px-3 py-2" value={form.clientEmail} onChange={(e) => setForm((prev) => ({ ...prev, clientEmail: e.target.value }))} />
            </div>
            <div className="flex flex-col text-sm">
              <label className="mb-1 text-slate-600">Company name (optional)</label>
              <input className="rounded border border-slate-300 px-3 py-2" value={form.companyName} onChange={(e) => setForm((prev) => ({ ...prev, companyName: e.target.value }))} />
            </div>
            <div className="flex flex-col text-sm md:col-span-2 lg:col-span-3">
              <label className="mb-1 text-slate-600">Service description</label>
              <textarea className="rounded border border-slate-300 px-3 py-2" rows={3} value={form.description} onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))} />
            </div>
            <div className="flex flex-col text-sm">
              <label className="mb-1 text-slate-600">Issue date</label>
              <input type="date" className="rounded border border-slate-300 px-3 py-2" value={form.issueDate} onChange={(e) => setForm((prev) => ({ ...prev, issueDate: e.target.value }))} />
            </div>
            <div className="flex flex-col text-sm">
              <label className="mb-1 text-slate-600">Due date</label>
              <input type="date" className="rounded border border-slate-300 px-3 py-2" value={form.dueDate} onChange={(e) => setForm((prev) => ({ ...prev, dueDate: e.target.value }))} />
            </div>
            <div className="flex flex-col text-sm">
              <label className="mb-1 text-slate-600">Amount</label>
              <input type="number" step="0.01" className="rounded border border-slate-300 px-3 py-2" value={form.amount} onChange={(e) => setForm((prev) => ({ ...prev, amount: e.target.value }))} />
            </div>
            <div className="flex flex-col text-sm md:col-span-2 lg:col-span-3">
              <label className="mb-1 text-slate-600">Notes (optional)</label>
              <textarea className="rounded border border-slate-300 px-3 py-2" rows={2} value={form.notes} onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))} />
            </div>
          </div>
          <div className="px-4 pb-4">
            <button
              type="button"
              onClick={handleCreate}
              disabled={saving}
              className="h-10 rounded bg-slate-900 px-4 text-sm text-white hover:bg-slate-800 disabled:opacity-60"
            >
              {saving ? "Generating..." : "Generate Invoice"}
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700">Invoices Due</h2>
            <p className="mt-0.5 text-xs text-slate-400">Stripe-paid invoices auto-update. Zelle payments are marked paid manually.</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-sm font-semibold text-slate-900">Open total: ${totalDue.toFixed(2)}</div>
            <button
              type="button"
              onClick={() => setShowPaid((prev) => !prev)}
              className="rounded border border-slate-300 px-3 py-1 text-xs text-slate-700 hover:bg-slate-50"
            >
              {showPaid ? "Hide Paid" : "Show Paid"}
            </button>
            <button
              type="button"
              onClick={() => setShowVoided((prev) => !prev)}
              className="rounded border border-slate-300 px-3 py-1 text-xs text-slate-700 hover:bg-slate-50"
            >
              {showVoided ? "Hide Voided" : "Show Voided"}
            </button>
          </div>
        </div>

        {loading ? (
          <div className="p-6 text-sm text-slate-500">Loading invoices...</div>
        ) : visibleRows.length === 0 ? (
          <div className="p-6 text-sm text-slate-500">No services invoices found.</div>
        ) : (
          <>
            <div className={showDesktopSite ? "hidden" : "space-y-3 p-4 md:hidden"}>
              {visibleRows.map((row) => renderRow(row, true))}
            </div>
            <div className={showDesktopSite ? "block p-4" : "hidden p-4 md:block"}>
              <div className="grid grid-cols-1 gap-3">{visibleRows.map((row) => renderRow(row, false))}</div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
