"use client";

import React, { useMemo, useEffect, useState } from "react";
import { formatDateOnly, parseDateOnly } from "@/lib/date-only";
import { getStatusBadgeClass } from "@/app/admin/billing/utils";

type TenantOption = {
  userId: string;
  email: string;
  propertyId: string;
  propertyAddress: string;
};

type TenantBillRow = {
  id: string;
  tenantId: string;
  tenantEmail: string;
  propertyId: string;
  propertyAddress: string;
  bill_type: string;
  description: string | null;
  amount: number;
  due_date: string;
  status: string;
  month: number;
  year: number;
  invoiceUrl?: string | null;
  paymentLinkUrl?: string | null;
  voidedAt?: string;
  voidedBy?: string;
  voidedReason?: string;
};

const TENANT_BILL_TYPES = [
  { value: "rent", label: "Rent" },
  { value: "fee", label: "Fee" },
  { value: "late_fee", label: "Late Fee" },
  { value: "security_deposit", label: "Security Deposit" },
  { value: "hoa", label: "HOA" },
  { value: "maintenance", label: "Maintenance" },
  { value: "other", label: "Other" },
];

export default function AdminBilling() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [properties, setProperties] = useState<{ id: string; address: string }[]>([]);
  const [tenantOptions, setTenantOptions] = useState<TenantOption[]>([]);
  const [tenantBillError, setTenantBillError] = useState<string | null>(null);
  const [tenantBillSuccess, setTenantBillSuccess] = useState<string | null>(null);
  const [tenantBills, setTenantBills] = useState<TenantBillRow[]>([]);
  const [tenantBillsLoading, setTenantBillsLoading] = useState(false);
  const [tenantBillsError, setTenantBillsError] = useState<string | null>(null);
  const [showVoidedTenantBills, setShowVoidedTenantBills] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; description: string } | null>(null);
  const [tenantBillPropertyFilter, setTenantBillPropertyFilter] = useState("");
  const [tenantBillStatusFilter, setTenantBillStatusFilter] = useState("");
  const [tenantBill, setTenantBill] = useState({
    propertyId: "",
    tenantId: "",
    amount: "",
    dueDate: "",
    billType: "rent",
    description: "",
    notifyTenant: true,
  });
  const [tenantInvoiceFile, setTenantInvoiceFile] = useState<File | null>(null);
  const [tenantInvoiceUploading, setTenantInvoiceUploading] = useState<Record<string, boolean>>({});
  const [tenantEdits, setTenantEdits] = useState<Record<string, { billType?: string; amount?: string; dueDate?: string; status?: string; description?: string; tenantId?: string; propertyId?: string }>>({});

  // Date sort helper for tenant bills
  const getDueDateTimestamp = (dateStr?: string | null) => {
    const date = parseDateOnly(dateStr);
    return date ? date.getTime() : null;
  };

  const compareDueDateAsc = (a: { dueDate?: string | null; id: string }, b: { dueDate?: string | null; id: string }) => {
    const aTime = getDueDateTimestamp(a.dueDate);
    const bTime = getDueDateTimestamp(b.dueDate);
    if (aTime === null && bTime === null) return a.id.localeCompare(b.id);
    if (aTime === null) return 1;
    if (bTime === null) return -1;
    if (aTime !== bTime) return aTime - bTime;
    return a.id.localeCompare(b.id);
  };

  if (process.env.NODE_ENV !== "production") {
    const sample = [
      { id: "a", dueDate: "2026-02-05" },
      { id: "b", dueDate: "2026-02-01" },
      { id: "c", dueDate: "2026-03-01" },
      { id: "d", dueDate: null },
    ];
    const sorted = [...sample].sort(compareDueDateAsc).map((row) => row.id).join(",");
    const expected = ["b", "a", "c", "d"].join(",");
    if (sorted !== expected) {
      console.warn("Due date sort check failed", { sorted, expected });
    }
  }

  const loadProperties = async () => {
    try {
      const res = await fetch("/api/properties", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load properties");
      setProperties(data.map((p: any) => ({ id: p.id, address: p.address })));
    } catch (err: any) {
      setError(err.message || "Failed to load properties");
    }
  };

  const loadTenantOptions = async () => {
    try {
      setTenantBillError(null);
      const [usersRes, propsRes] = await Promise.all([
        fetch("/api/admin/users", { cache: "no-store" }),
        fetch("/api/admin/user-properties", { cache: "no-store" }),
      ]);
      const usersData = await usersRes.json();
      const propsData = await propsRes.json();

      if (!usersRes.ok) throw new Error(usersData.error || "Failed to load users");
      if (!propsRes.ok) throw new Error(propsData.error || "Failed to load user properties");

      const emailMap = new Map<string, string>();
      (usersData || []).forEach((u: any) => {
        if (u?.id) emailMap.set(u.id, u.email || "");
      });

      const tenants: TenantOption[] = (propsData || [])
        .filter((row: any) => row.role === "tenant")
        .map((row: any) => ({
          userId: row.user_id,
          email: emailMap.get(row.user_id) || "",
          propertyId: row.property_id,
          propertyAddress: row.properties?.address || "",
        }));

      setTenantOptions(tenants);
    } catch (err: any) {
      setTenantBillError(err.message || "Failed to load tenant options");
    }
  };

  const loadTenantBills = async (includeVoided = false) => {
    try {
      setTenantBillsLoading(true);
      setTenantBillsError(null);
      const url = includeVoided ? "/api/admin/tenant-billing?includeVoided=true" : "/api/admin/tenant-billing";
      const res = await fetch(url, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load tenant bills");
      setTenantBills(data.rows || []);
    } catch (err: any) {
      setTenantBillsError(err.message || "Failed to load tenant bills");
    } finally {
      setTenantBillsLoading(false);
    }
  };

  useEffect(() => {
    const load = async () => {
      await Promise.all([loadProperties(), loadTenantOptions(), loadTenantBills()]);
    };
    load();
  }, []);

  useEffect(() => {
    loadTenantBills(showVoidedTenantBills);
  }, [showVoidedTenantBills]);

  const filteredTenants = useMemo(() => {
    if (!tenantBill.propertyId) return tenantOptions;
    return tenantOptions.filter((t) => t.propertyId === tenantBill.propertyId);
  }, [tenantOptions, tenantBill.propertyId]);

  // Show ALL bills (including paid) so admin can void/delete any bill
  // Apply property and status filters
  const displayedTenantBills = useMemo(() => {
    return tenantBills.filter((bill) => {
      // Voided filter
      if (!showVoidedTenantBills && bill.status === "voided") return false;
      // Property filter
      if (tenantBillPropertyFilter && bill.propertyId !== tenantBillPropertyFilter) return false;
      // Status filter
      if (tenantBillStatusFilter && bill.status !== tenantBillStatusFilter) return false;
      return true;
    }).sort((a, b) => compareDueDateAsc({ dueDate: a.due_date, id: a.id }, { dueDate: b.due_date, id: b.id }));
  }, [tenantBills, showVoidedTenantBills, tenantBillPropertyFilter, tenantBillStatusFilter]);

  useEffect(() => {
    if (!tenantBill.propertyId) return;
    const stillValid = filteredTenants.some((t) => t.userId === tenantBill.tenantId);
    if (!stillValid && tenantBill.tenantId) {
      setTenantBill((prev) => ({ ...prev, tenantId: "" }));
    }
  }, [filteredTenants, tenantBill.propertyId, tenantBill.tenantId]);

  const handleCreateTenantBill = async () => {
    if (!tenantBill.propertyId || !tenantBill.tenantId) {
      setTenantBillError("Select a property and tenant.");
      return;
    }
    if (!tenantBill.amount || !tenantBill.dueDate) {
      setTenantBillError("Amount and due date are required.");
      return;
    }
    try {
      setLoading(true);
      setTenantBillError(null);
      setTenantBillSuccess(null);
      const res = await fetch("/api/admin/tenant-billing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          propertyId: tenantBill.propertyId,
          tenantId: tenantBill.tenantId,
          billType: tenantBill.billType,
          amount: tenantBill.amount,
          dueDate: tenantBill.dueDate,
          description: tenantBill.description,
          notifyTenant: tenantBill.notifyTenant,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create tenant bill");
      if (tenantInvoiceFile && data?.bill?.id) {
        await uploadTenantInvoice(data.bill.id, tenantInvoiceFile);
        setTenantInvoiceFile(null);
      }
      setTenantBillSuccess("Tenant bill created.");
      setTenantBill((prev) => ({
        ...prev,
        amount: "",
        description: "",
      }));
      await loadTenantBills(showVoidedTenantBills);
    } catch (err: any) {
      setTenantBillError(err.message || "Failed to create tenant bill");
    } finally {
      setLoading(false);
    }
  };

  const handleMarkTenantBillPaid = async (billId: string) => {
    try {
      setTenantBillsError(null);
      const res = await fetch("/api/admin/tenant-billing", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: billId, status: "paid" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update tenant bill");
      await loadTenantBills(showVoidedTenantBills);
    } catch (err: any) {
      setTenantBillsError(err.message || "Failed to update tenant bill");
    }
  };

  const handleVoidTenantBill = async (billId: string, reason?: string) => {
    try {
      setTenantBillsError(null);
      const res = await fetch("/api/admin/tenant-billing", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: billId,
          action: "void",
          voidReason: reason || "Voided by admin",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to void tenant bill");
      await loadTenantBills(showVoidedTenantBills);
    } catch (err: any) {
      setTenantBillsError(err.message || "Failed to void tenant bill");
    }
  };

  const handleDeleteTenantBill = async (billId: string) => {
    try {
      setTenantBillsError(null);
      const res = await fetch(`/api/admin/tenant-billing?id=${billId}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to delete tenant bill");
      setConfirmDelete(null);
      await loadTenantBills(showVoidedTenantBills);
    } catch (err: any) {
      setTenantBillsError(err.message || "Failed to delete tenant bill");
    }
  };

  const handleSaveTenantBill = async (bill: TenantBillRow) => {
    const edits = tenantEdits[bill.id] || {};
    const billType = edits.billType ?? bill.bill_type;
    const amount = edits.amount ?? String(bill.amount ?? "");
    const dueDate = edits.dueDate ?? (bill.due_date ? bill.due_date.split("T")[0] : "");
    const status = edits.status ?? bill.status;
    const description = edits.description ?? (bill.description || "");
    const tenantId = edits.tenantId ?? bill.tenantId;
    const propertyId = edits.propertyId ?? bill.propertyId;
    try {
      setTenantBillsError(null);
      const res = await fetch("/api/admin/tenant-billing", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: bill.id,
          billType,
          amount,
          dueDate,
          status,
          description,
          tenantId,
          propertyId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update tenant bill");
      setTenantEdits((prev) => ({ ...prev, [bill.id]: {} }));
      await loadTenantBills(showVoidedTenantBills);
    } catch (err: any) {
      setTenantBillsError(err.message || "Failed to update tenant bill");
    }
  };

 

  const uploadTenantInvoice = async (billId: string, file: File) => {
    const key = billId;
    setTenantInvoiceUploading((prev) => ({ ...prev, [key]: true }));
    try {
      const formData = new FormData();
      formData.append("billId", billId);
      formData.append("file", file);
      const res = await fetch("/api/admin/tenant-billing/invoice", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to upload invoice");
      setTenantBills((prev) => prev.map((b) => (b.id === billId ? { ...b, invoiceUrl: data.invoiceUrl } : b)));
    } catch (err: any) {
      setTenantBillsError(err.message || "Failed to upload invoice");
    } finally {
      setTenantInvoiceUploading((prev) => ({ ...prev, [key]: false }));
    }
  };

  const removeTenantInvoice = async (billId: string) => {
    try {
      setTenantInvoiceUploading((prev) => ({ ...prev, [billId]: true }));
      const res = await fetch(`/api/admin/tenant-billing/invoice?billId=${billId}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to remove invoice");
      setTenantBills((prev) => prev.map((b) => (b.id === billId ? { ...b, invoiceUrl: undefined } : b)));
    } catch (err: any) {
      setTenantBillsError(err.message || "Failed to remove invoice");
    } finally {
      setTenantInvoiceUploading((prev) => ({ ...prev, [billId]: false }));
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto">
      {/* Confirmation Modal */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4 shadow-xl">
            <h3 className="text-lg font-semibold text-slate-900 mb-2">Confirm Hard Delete</h3>
            <p className="text-sm text-slate-600 mb-4">
              Are you sure you want to <strong>permanently delete</strong> this bill?
              <br />
              <span className="text-red-600 font-medium">{confirmDelete.description}</span>
              <br />
              <br />
              This action cannot be undone. The bill will be completely removed from the system.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setConfirmDelete(null)}
                className="px-4 py-2 text-sm rounded border border-slate-300 text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  handleDeleteTenantBill(confirmDelete.id);
                }}
                className="px-4 py-2 text-sm rounded bg-red-600 text-white hover:bg-red-700"
              >
                Delete Permanently
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-3xl font-semibold text-slate-900">Tenant Billing</h1>
          <p className="text-slate-600">Manage tenant billing. All billing is manual.</p>
        </div>
      </div>

      {/* Tenant Bills Creation Section */}
      <div className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden mt-8">
        <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Create Tenant Bill</h2>
            <p className="text-xs text-slate-500">
              Manually create charges that appear in the tenant Payments tab.
            </p>
          </div>
        </div>
        <div className="px-4 py-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex flex-col text-sm">
            <label className="text-slate-600 mb-1">Property</label>
            <select
              className="border border-slate-300 rounded px-3 py-2 text-sm bg-white"
              value={tenantBill.propertyId}
              onChange={(e) =>
                setTenantBill((prev) => ({ ...prev, propertyId: e.target.value }))
              }
            >
              <option value="">Select property...</option>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.address}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col text-sm">
            <label className="text-slate-600 mb-1">Tenant</label>
            <select
              className="border border-slate-300 rounded px-3 py-2 text-sm bg-white"
              value={tenantBill.tenantId}
              onChange={(e) =>
                setTenantBill((prev) => ({ ...prev, tenantId: e.target.value }))
              }
            >
              <option value="">Select tenant...</option>
              {filteredTenants.map((t) => (
                <option key={`${t.userId}-${t.propertyId}`} value={t.userId}>
                  {t.email || "Tenant"} {t.propertyAddress ? `- ${t.propertyAddress}` : ""}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col text-sm">
            <label className="text-slate-600 mb-1">Amount</label>
            <input
              type="number"
              step="0.01"
              className="border border-slate-300 rounded px-3 py-2 text-sm bg-white"
              value={tenantBill.amount}
              onChange={(e) => setTenantBill((prev) => ({ ...prev, amount: e.target.value }))}
              placeholder="0.00"
            />
          </div>
          <div className="flex flex-col text-sm">
            <label className="text-slate-600 mb-1">Due Date</label>
            <input
              type="date"
              className="border border-slate-300 rounded px-3 py-2 text-sm bg-white"
              value={tenantBill.dueDate}
              onChange={(e) => setTenantBill((prev) => ({ ...prev, dueDate: e.target.value }))}
            />
          </div>
          <div className="flex flex-col text-sm">
            <label className="text-slate-600 mb-1">Type</label>
            <select
              className="border border-slate-300 rounded px-3 py-2 text-sm bg-white"
              value={tenantBill.billType}
              onChange={(e) =>
                setTenantBill((prev) => ({ ...prev, billType: e.target.value }))
              }
            >
              {TENANT_BILL_TYPES.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col text-sm md:col-span-2">
            <label className="text-slate-600 mb-1">Description</label>
            <input
              type="text"
              className="border border-slate-300 rounded px-3 py-2 text-sm bg-white"
              value={tenantBill.description}
              onChange={(e) =>
                setTenantBill((prev) => ({ ...prev, description: e.target.value }))
              }
              placeholder="Optional details for the tenant."
            />
          </div>
          <div className="flex flex-col text-sm md:col-span-2">
            <label className="text-slate-600 mb-1">Invoice PDF (optional)</label>
            <input
              type="file"
              accept="application/pdf"
              className="border border-slate-300 rounded px-3 py-2 text-sm bg-white"
              onChange={(e) => setTenantInvoiceFile(e.target.files?.[0] || null)}
            />
            {tenantInvoiceFile && (
              <span className="text-xs text-slate-500 mt-1">{tenantInvoiceFile.name}</span>
            )}
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={tenantBill.notifyTenant}
              onChange={(e) =>
                setTenantBill((prev) => ({ ...prev, notifyTenant: e.target.checked }))
              }
            />
            Notify tenant by email
          </label>
        </div>
        {tenantBillError && (
          <div className="px-4 pb-3 text-sm text-red-600">{tenantBillError}</div>
        )}
        {tenantBillSuccess && (
          <div className="px-4 pb-3 text-sm text-emerald-700">{tenantBillSuccess}</div>
        )}
        <div className="px-4 pb-4">
          <button
            onClick={handleCreateTenantBill}
            disabled={loading}
            className="h-10 px-4 rounded bg-slate-900 text-white text-sm hover:bg-slate-800 disabled:opacity-60"
          >
            {loading ? "Saving..." : "Create tenant bill"}
          </button>
        </div>
      </div>

      {/* Tenant Bills Section */}
      <div className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden mt-8">
        <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Tenant Bills</h2>
            <p className="text-xs text-slate-500">
              Review tenant charges, mark as paid, void, or delete.
            </p>
          </div>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
              <input
                type="checkbox"
                checked={showVoidedTenantBills}
                onChange={(e) => setShowVoidedTenantBills(e.target.checked)}
                className="rounded"
              />
              Show voided
            </label>
            <button
              onClick={() => loadTenantBills(showVoidedTenantBills)}
              disabled={tenantBillsLoading}
              className="text-xs px-3 py-1 rounded border border-slate-300 text-slate-700 hover:bg-slate-50"
            >
              {tenantBillsLoading ? "Refreshing..." : "Refresh"}
            </button>
          </div>
        </div>
        {/* Filters */}
        <div className="px-4 py-3 border-b border-slate-200 flex flex-wrap gap-3 items-center bg-slate-50">
          <span className="text-xs text-slate-600 font-medium">Filters:</span>
          <select
            className="border border-slate-300 rounded px-2 py-1 text-xs bg-white"
            value={tenantBillPropertyFilter}
            onChange={(e) => setTenantBillPropertyFilter(e.target.value)}
          >
            <option value="">All Properties</option>
            {properties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.address}
              </option>
            ))}
          </select>
          <select
            className="border border-slate-300 rounded px-2 py-1 text-xs bg-white"
            value={tenantBillStatusFilter}
            onChange={(e) => setTenantBillStatusFilter(e.target.value)}
          >
            <option value="">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="due">Due</option>
            <option value="paid">Paid</option>
            <option value="overdue">Overdue</option>
            <option value="voided">Voided</option>
          </select>
          {(tenantBillPropertyFilter || tenantBillStatusFilter) && (
            <button
              onClick={() => {
                setTenantBillPropertyFilter("");
                setTenantBillStatusFilter("");
              }}
              className="text-xs px-2 py-1 text-slate-500 hover:text-slate-700"
            >
              Clear filters
            </button>
          )}
        </div>
        {tenantBillsError && (
          <div className="px-4 py-3 text-sm text-red-600">{tenantBillsError}</div>
        )}
        <div className="overflow-x-auto md:overflow-visible">
          <table className="w-full text-sm table-fixed">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-700">
              <tr>
                <th className="px-4 py-3 text-left whitespace-normal">Tenant</th>
                <th className="px-4 py-3 text-left whitespace-normal">Property</th>
                <th className="px-4 py-3 text-left whitespace-normal">Due</th>
                <th className="px-4 py-3 text-left whitespace-normal">Type</th>
                <th className="px-4 py-3 text-right whitespace-normal">Amount</th>
                <th className="px-4 py-3 text-left whitespace-normal">Status</th>
                <th className="px-4 py-3 text-left whitespace-normal">Invoice PDF</th>
                <th className="px-4 py-3 text-left whitespace-normal">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {displayedTenantBills.length === 0 ? (
                <tr>
                  <td className="px-4 py-4 text-slate-500" colSpan={8}>
                    No tenant bills found.
                  </td>
                </tr>
              ) : (
                displayedTenantBills.map((bill) => {
                  const isVoided = bill.status === "voided";
                  return (
                    <tr key={bill.id} className={`hover:bg-slate-50 ${isVoided ? "bg-gray-50 opacity-60" : ""}`}>
                      <td className="px-4 py-3 text-slate-900 break-words">
                        {isVoided ? (
                          bill.tenantEmail || "Tenant"
                        ) : (
                          <select
                            className="border border-slate-300 rounded px-2 py-1 text-xs bg-white w-full"
                            value={tenantEdits[bill.id]?.tenantId ?? bill.tenantId}
                            onChange={(e) =>
                              setTenantEdits((prev) => ({
                                ...prev,
                                [bill.id]: { ...prev[bill.id], tenantId: e.target.value },
                              }))
                            }
                          >
                            {tenantOptions.map((t) => (
                              <option key={`${t.userId}-${t.propertyId}`} value={t.userId}>
                                {t.email || "Tenant"} {t.propertyAddress ? `- ${t.propertyAddress}` : ""}
                              </option>
                            ))}
                          </select>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-700 break-words">
                        {isVoided ? (
                          bill.propertyAddress || bill.propertyId
                        ) : (
                          <select
                            className="border border-slate-300 rounded px-2 py-1 text-xs bg-white w-full"
                            value={tenantEdits[bill.id]?.propertyId ?? bill.propertyId}
                            onChange={(e) =>
                              setTenantEdits((prev) => ({
                                ...prev,
                                [bill.id]: { ...prev[bill.id], propertyId: e.target.value },
                              }))
                            }
                          >
                            {properties.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.address}
                              </option>
                            ))}
                          </select>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {isVoided ? (
                          formatDateOnly(bill.due_date) || "-"
                        ) : (
                          <input
                            type="date"
                            className="border border-slate-300 rounded px-2 py-1 text-xs bg-white w-full"
                            value={tenantEdits[bill.id]?.dueDate ?? (bill.due_date ? bill.due_date.split("T")[0] : "")}
                            onChange={(e) =>
                              setTenantEdits((prev) => ({
                                ...prev,
                                [bill.id]: { ...prev[bill.id], dueDate: e.target.value },
                              }))
                            }
                          />
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {isVoided ? (
                          <>
                            {TENANT_BILL_TYPES.find((t) => t.value === bill.bill_type)?.label || bill.bill_type}
                            {bill.description ? ` - ${bill.description}` : ""}
                          </>
                        ) : (
                          <div className="flex flex-col gap-1">
                            <select
                              className="border border-slate-300 rounded px-2 py-1 text-xs bg-white w-full"
                              value={tenantEdits[bill.id]?.billType ?? bill.bill_type}
                              onChange={(e) =>
                                setTenantEdits((prev) => ({
                                  ...prev,
                                  [bill.id]: { ...prev[bill.id], billType: e.target.value },
                                }))
                              }
                            >
                              {TENANT_BILL_TYPES.map((type) => (
                                <option key={type.value} value={type.value}>
                                  {type.label}
                                </option>
                              ))}
                            </select>
                            <input
                              type="text"
                              className="border border-slate-300 rounded px-2 py-1 text-xs bg-white w-full"
                              placeholder="Description"
                              value={tenantEdits[bill.id]?.description ?? (bill.description || "")}
                              onChange={(e) =>
                                setTenantEdits((prev) => ({
                                  ...prev,
                                  [bill.id]: { ...prev[bill.id], description: e.target.value },
                                }))
                              }
                            />
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-900">
                        {isVoided ? (
                          <span className="line-through">${Number(bill.amount || 0).toFixed(2)}</span>
                        ) : (
                          <input
                            type="number"
                            step="0.01"
                            className="border border-slate-300 rounded px-2 py-1 text-xs bg-white w-full text-right"
                            value={tenantEdits[bill.id]?.amount ?? String(bill.amount ?? "")}
                            onChange={(e) =>
                              setTenantEdits((prev) => ({
                                ...prev,
                                [bill.id]: { ...prev[bill.id], amount: e.target.value },
                              }))
                            }
                          />
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {isVoided ? (
                          <div>
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${getStatusBadgeClass("voided")}`}>
                              VOIDED
                            </span>
                            {bill.voidedReason && (
                              <div className="text-[10px] text-slate-500 mt-1">{bill.voidedReason}</div>
                            )}
                          </div>
                        ) : (
                          <select
                            className="border border-slate-300 rounded px-2 py-1 text-xs bg-white"
                            value={tenantEdits[bill.id]?.status ?? bill.status}
                            onChange={(e) =>
                              setTenantEdits((prev) => ({
                                ...prev,
                                [bill.id]: { ...prev[bill.id], status: e.target.value },
                              }))
                            }
                          >
                            <option value="pending">Pending</option>
                            <option value="due">Due</option>
                            <option value="paid">Paid</option>
                            <option value="overdue">Overdue</option>
                            <option value="voided">Voided</option>
                          </select>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1">
                          {bill.invoiceUrl ? (
                            <a
                              href={bill.invoiceUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="text-xs text-blue-600 hover:text-blue-700"
                            >
                              Invoice PDF
                            </a>
                          ) : (
                            <span className="text-xs text-slate-500">Not uploaded</span>
                          )}
                          {!isVoided && (
                            <div className="flex items-center gap-2">
                              <label className="text-xs px-2 py-1 rounded border border-slate-300 text-slate-700 hover:bg-slate-50 cursor-pointer">
                                {bill.invoiceUrl ? "Replace" : "Upload"}
                                <input
                                  type="file"
                                  accept="application/pdf"
                                  className="hidden"
                                  onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) uploadTenantInvoice(bill.id, file);
                                    e.currentTarget.value = "";
                                  }}
                                  disabled={!!tenantInvoiceUploading[bill.id]}
                                />
                              </label>
                              {bill.invoiceUrl && (
                                <button
                                  type="button"
                                  className="text-xs px-2 py-1 rounded border border-red-200 text-red-700 hover:bg-red-50"
                                  onClick={() => removeTenantInvoice(bill.id)}
                                  disabled={!!tenantInvoiceUploading[bill.id]}
                                >
                                  Remove
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2 flex-wrap">
                          {!isVoided && (
                            <>
                              <button
                                onClick={() => handleMarkTenantBillPaid(bill.id)}
                                className="text-xs px-2 py-1 rounded bg-emerald-600 text-white hover:bg-emerald-700"
                              >
                                Mark Paid
                              </button>
                              <button
                                onClick={() => handleVoidTenantBill(bill.id)}
                                className="text-xs px-2 py-1 rounded bg-amber-50 border border-amber-200 text-amber-700 hover:bg-amber-100"
                              >
                                Void
                              </button>
                              <button
                                onClick={() => handleSaveTenantBill(bill)}
                                className="text-xs px-2 py-1 rounded bg-white border border-slate-300 text-slate-700 hover:bg-slate-50"
                              >
                                Save
                              </button>
                            </>
                          )}
                          <button
                            onClick={() =>
                              setConfirmDelete({
                                id: bill.id,
                                description: `${bill.tenantEmail || "Tenant"} - ${bill.propertyAddress} - $${Number(bill.amount || 0).toFixed(2)}`,
                              })
                            }
                            className="text-xs px-2 py-1 rounded bg-red-50 border border-red-200 text-red-700 hover:bg-red-100"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

