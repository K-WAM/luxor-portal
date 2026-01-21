"use client";

import React, { useMemo, useEffect, useState } from "react";
import { formatDateOnly } from "@/lib/date-only";

type BillRow = {
  id: string;
  ownerEmail: string;
  property: string;
  propertyAddress?: string;
  description: string;
  amount: number;
  dueDate: string;
  status: "due" | "paid" | "overdue" | "pending" | "voided";
  invoiceUrl?: string;
  feePercent?: number | null;
  feeAmount?: number | null;
  propertyId?: string;
  category?: string;
  voidedAt?: string;
  voidedBy?: string;
  voidedReason?: string;
};

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
  voidedAt?: string;
  voidedBy?: string;
  voidedReason?: string;
};

const OWNER_BILL_CATEGORIES = [
  { value: "pm_fee", label: "Property Management Fee" },
  { value: "maintenance", label: "Maintenance" },
  { value: "hoa", label: "HOA" },
  { value: "pool", label: "Pool" },
  { value: "garden", label: "Garden" },
  { value: "insurance", label: "Insurance" },
  { value: "property_tax", label: "Property Tax" },
  { value: "repairs", label: "Repairs" },
  { value: "other", label: "Other" },
];

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
  const [bills, setBills] = useState<BillRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editAmounts, setEditAmounts] = useState<Record<string, { feePercent?: string; feeAmount?: string; status?: string }>>({});
  const [properties, setProperties] = useState<{ id: string; address: string }[]>([]);
  const [tenantOptions, setTenantOptions] = useState<TenantOption[]>([]);
  const [tenantBillError, setTenantBillError] = useState<string | null>(null);
  const [tenantBillSuccess, setTenantBillSuccess] = useState<string | null>(null);
  const [tenantBills, setTenantBills] = useState<TenantBillRow[]>([]);
  const [tenantBillsLoading, setTenantBillsLoading] = useState(false);
  const [tenantBillsError, setTenantBillsError] = useState<string | null>(null);
  const [showVoidedOwnerBills, setShowVoidedOwnerBills] = useState(false);
  const [showVoidedTenantBills, setShowVoidedTenantBills] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<{ type: "owner" | "tenant"; id: string; description: string } | null>(null);
  const [newBill, setNewBill] = useState<{ propertyId: string; month: number; year: number; feePercent: string; category: string }>({
    propertyId: "",
    month: new Date().getMonth() + 1,
    year: new Date().getFullYear(),
    feePercent: "10",
    category: "pm_fee",
  });
  const [tenantBill, setTenantBill] = useState({
    propertyId: "",
    tenantId: "",
    amount: "",
    dueDate: "",
    billType: "rent",
    description: "",
    notifyTenant: true,
  });

  // Filter out voided bills for totals calculation
  const totals = useMemo(() => {
    const activeBills = bills.filter((b) => b.status !== "voided");
    const due = activeBills.filter((b) => b.status === "due" || b.status === "overdue").reduce((s, b) => s + (b.amount || 0), 0);
    const paid = activeBills.filter((b) => b.status === "paid").reduce((s, b) => s + (b.amount || 0), 0);
    return { due, paid };
  }, [bills]);

  const loadBills = async (includeVoided = false) => {
    try {
      setLoading(true);
      setError(null);
      const url = includeVoided ? "/api/admin/billing?includeVoided=true" : "/api/admin/billing";
      const res = await fetch(url, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load billing");
      setBills(data);
    } catch (err: any) {
      setError(err.message || "Failed to load billing");
    } finally {
      setLoading(false);
    }
  };

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

      const options: TenantOption[] = (propsData || [])
        .filter((row: any) => row.role === "tenant")
        .map((row: any) => ({
          userId: row.user_id,
          email: emailMap.get(row.user_id) || "",
          propertyId: row.property_id,
          propertyAddress: row.properties?.address || "",
        }));

      setTenantOptions(options);
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

  const handleCreate = async () => {
    if (!newBill.propertyId) {
      setError("Select a property for the bill");
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/admin/billing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          propertyId: newBill.propertyId,
          month: newBill.month,
          year: newBill.year,
          feePercent: newBill.feePercent,
          category: newBill.category,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create bill");
      await loadBills(showVoidedOwnerBills);
    } catch (err: any) {
      setError(err.message || "Failed to create bill");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const load = async () => {
      await Promise.all([loadBills(), loadProperties(), loadTenantOptions(), loadTenantBills()]);
    };
    load();
  }, []);

  // Reload bills when toggle changes
  useEffect(() => {
    loadBills(showVoidedOwnerBills);
  }, [showVoidedOwnerBills]);

  useEffect(() => {
    loadTenantBills(showVoidedTenantBills);
  }, [showVoidedTenantBills]);

  const filteredTenants = useMemo(() => {
    if (!tenantBill.propertyId) return tenantOptions;
    return tenantOptions.filter((t) => t.propertyId === tenantBill.propertyId);
  }, [tenantOptions, tenantBill.propertyId]);

  // Show ALL bills (including paid) so admin can void/delete any bill
  // Only filter voided bills if toggle is off
  const displayedTenantBills = useMemo(
    () => tenantBills.filter((bill) => showVoidedTenantBills || bill.status !== "voided"),
    [tenantBills, showVoidedTenantBills]
  );

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

  const handleSave = async (bill: BillRow) => {
    const edits = editAmounts[bill.id] || {};
    try {
      setLoading(true);
      const res = await fetch("/api/admin/billing", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: bill.id,
          feePercent: edits.feePercent ?? bill.feePercent,
          feeAmount: edits.feeAmount ?? bill.feeAmount,
          status: edits.status ?? bill.status,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update");
      setEditAmounts((prev) => ({ ...prev, [bill.id]: {} }));
      await loadBills(showVoidedOwnerBills);
    } catch (err: any) {
      setError(err.message || "Failed to update billing");
    } finally {
      setLoading(false);
    }
  };

  const handleVoidOwnerBill = async (billId: string, reason?: string) => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/admin/billing", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: billId,
          action: "void",
          voidReason: reason || "Voided by admin",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to void bill");
      await loadBills(showVoidedOwnerBills);
    } catch (err: any) {
      setError(err.message || "Failed to void bill");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteOwnerBill = async (billId: string) => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/admin/billing?id=${billId}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to delete");
      setConfirmDelete(null);
      await loadBills(showVoidedOwnerBills);
    } catch (err: any) {
      setError(err.message || "Failed to delete bill");
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

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case "paid":
        return "bg-emerald-100 text-emerald-700";
      case "due":
        return "bg-yellow-100 text-yellow-700";
      case "overdue":
        return "bg-red-100 text-red-700";
      case "voided":
        return "bg-gray-200 text-gray-600 line-through";
      default:
        return "bg-slate-100 text-slate-700";
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
                  if (confirmDelete.type === "owner") {
                    handleDeleteOwnerBill(confirmDelete.id);
                  } else {
                    handleDeleteTenantBill(confirmDelete.id);
                  }
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
          <h1 className="text-3xl font-semibold text-slate-900">Billing</h1>
          <p className="text-slate-600">Manage owner and tenant billing. All billing is manual.</p>
        </div>
        <div className="text-sm text-slate-700 space-y-1">
          <div className="font-medium">Balance due</div>
          <div className="text-xl font-semibold text-red-600">${totals.due.toFixed(2)}</div>
          <div className="text-xs text-slate-500">Paid to date: ${totals.paid.toFixed(2)}</div>
        </div>
      </div>

      {/* Owner Bills Section */}
      <div className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Owner Bills</h2>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
              <input
                type="checkbox"
                checked={showVoidedOwnerBills}
                onChange={(e) => setShowVoidedOwnerBills(e.target.checked)}
                className="rounded"
              />
              Show voided
            </label>
          </div>
        </div>
        <div className="px-4 py-3 border-b border-slate-200 flex flex-wrap gap-3 items-end">
          <div className="flex flex-col text-sm">
            <label className="text-slate-600 mb-1">Property</label>
            <select
              className="border border-slate-300 rounded px-3 py-2 text-sm bg-white"
              value={newBill.propertyId}
              onChange={(e) => setNewBill((prev) => ({ ...prev, propertyId: e.target.value }))}
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
            <label className="text-slate-600 mb-1">Category</label>
            <select
              className="border border-slate-300 rounded px-3 py-2 text-sm bg-white"
              value={newBill.category}
              onChange={(e) => setNewBill((prev) => ({ ...prev, category: e.target.value }))}
            >
              {OWNER_BILL_CATEGORIES.map((cat) => (
                <option key={cat.value} value={cat.value}>
                  {cat.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col text-sm">
            <label className="text-slate-600 mb-1">Month</label>
            <input
              type="number"
              min={1}
              max={12}
              className="border border-slate-300 rounded px-3 py-2 text-sm bg-white w-24"
              value={newBill.month}
              onChange={(e) => setNewBill((prev) => ({ ...prev, month: Number(e.target.value) }))}
            />
          </div>
          <div className="flex flex-col text-sm">
            <label className="text-slate-600 mb-1">Year</label>
            <input
              type="number"
              className="border border-slate-300 rounded px-3 py-2 text-sm bg-white w-28"
              value={newBill.year}
              onChange={(e) => setNewBill((prev) => ({ ...prev, year: Number(e.target.value) }))}
            />
          </div>
          <div className="flex flex-col text-sm">
            <label className="text-slate-600 mb-1">% of rent</label>
            <input
              type="number"
              step="0.01"
              className="border border-slate-300 rounded px-3 py-2 text-sm bg-white w-28"
              value={newBill.feePercent}
              onChange={(e) => setNewBill((prev) => ({ ...prev, feePercent: e.target.value }))}
            />
          </div>
          <button
            onClick={handleCreate}
            disabled={loading}
            className="h-10 px-4 rounded bg-slate-900 text-white text-sm hover:bg-slate-800 disabled:opacity-60"
          >
            {loading ? "Saving..." : "Create bill"}
          </button>
        </div>
        {error && <div className="px-4 py-3 text-sm text-red-600">{error}</div>}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-700">
              <tr>
                <th className="px-4 py-3 text-left">Owner</th>
                <th className="px-4 py-3 text-left">Property</th>
                <th className="px-4 py-3 text-left">Category</th>
                <th className="px-4 py-3 text-right">Amount</th>
                <th className="px-4 py-3 text-left">Due</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {bills.length === 0 ? (
                <tr>
                  <td className="px-4 py-4 text-slate-500" colSpan={7}>
                    No owner bills found.
                  </td>
                </tr>
              ) : (
                bills.map((bill) => {
                  const edits = editAmounts[bill.id] || {};
                  const isVoided = bill.status === "voided";
                  return (
                    <tr key={bill.id} className={`hover:bg-slate-50 ${isVoided ? "bg-gray-50 opacity-60" : ""}`}>
                      <td className="px-4 py-3 text-slate-900">{bill.ownerEmail}</td>
                      <td className="px-4 py-3 text-slate-800">
                        {bill.propertyAddress || bill.property || bill.propertyId}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {OWNER_BILL_CATEGORIES.find((c) => c.value === bill.category)?.label || bill.category || "PM fee"}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-900">
                        <span className={isVoided ? "line-through" : ""}>
                          ${bill.amount?.toFixed(2)}
                        </span>
                        {!isVoided && (
                          <div className="flex items-center gap-1 mt-1 justify-end text-[11px] text-slate-600">
                            <input
                              type="number"
                              step="0.01"
                              placeholder="%"
                              className="w-16 border border-slate-300 rounded px-2 py-1"
                              value={edits.feePercent ?? (bill.feePercent ?? "")}
                              onChange={(e) =>
                                setEditAmounts((prev) => ({
                                  ...prev,
                                  [bill.id]: { ...prev[bill.id], feePercent: e.target.value },
                                }))
                              }
                            />
                            <input
                              type="number"
                              step="0.01"
                              placeholder="$ override"
                              className="w-20 border border-slate-300 rounded px-2 py-1"
                              value={edits.feeAmount ?? (bill.feeAmount ?? "")}
                              onChange={(e) =>
                                setEditAmounts((prev) => ({
                                  ...prev,
                                  [bill.id]: { ...prev[bill.id], feeAmount: e.target.value },
                                }))
                              }
                            />
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {formatDateOnly(bill.dueDate) || "-"}
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
                            value={edits.status ?? bill.status}
                            onChange={(e) =>
                              setEditAmounts((prev) => ({
                                ...prev,
                                [bill.id]: { ...prev[bill.id], status: e.target.value },
                              }))
                            }
                          >
                            <option value="due">Due</option>
                            <option value="overdue">Overdue</option>
                            <option value="paid">Paid</option>
                            <option value="pending">Pending</option>
                          </select>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2 flex-wrap">
                          {!isVoided && (
                            <>
                              <button
                                onClick={() => handleVoidOwnerBill(bill.id)}
                                disabled={loading}
                                className="text-xs px-2 py-1 rounded bg-amber-50 border border-amber-200 text-amber-700 hover:bg-amber-100"
                              >
                                Void
                              </button>
                              <button
                                onClick={() => handleSave(bill)}
                                disabled={loading}
                                className="text-xs px-2 py-1 rounded bg-white border border-slate-300 text-slate-700 hover:bg-slate-50"
                              >
                                Save
                              </button>
                            </>
                          )}
                          <button
                            onClick={() =>
                              setConfirmDelete({
                                type: "owner",
                                id: bill.id,
                                description: `${bill.propertyAddress || bill.property} - $${bill.amount?.toFixed(2)}`,
                              })
                            }
                            disabled={loading}
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

      {/* Pending Tenant Bills Section */}
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
        {tenantBillsError && (
          <div className="px-4 py-3 text-sm text-red-600">{tenantBillsError}</div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-700">
              <tr>
                <th className="px-4 py-3 text-left">Tenant</th>
                <th className="px-4 py-3 text-left">Property</th>
                <th className="px-4 py-3 text-left">Due</th>
                <th className="px-4 py-3 text-left">Type</th>
                <th className="px-4 py-3 text-right">Amount</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {displayedTenantBills.length === 0 ? (
                <tr>
                  <td className="px-4 py-4 text-slate-500" colSpan={7}>
                    No tenant bills found.
                  </td>
                </tr>
              ) : (
                displayedTenantBills.map((bill) => {
                  const isVoided = bill.status === "voided";
                  return (
                    <tr key={bill.id} className={`hover:bg-slate-50 ${isVoided ? "bg-gray-50 opacity-60" : ""}`}>
                      <td className="px-4 py-3 text-slate-900">{bill.tenantEmail || "Tenant"}</td>
                      <td className="px-4 py-3 text-slate-700">{bill.propertyAddress || bill.propertyId}</td>
                      <td className="px-4 py-3 text-slate-700">
                        {formatDateOnly(bill.due_date) || "—"}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {TENANT_BILL_TYPES.find((t) => t.value === bill.bill_type)?.label || bill.bill_type}
                        {bill.description ? ` - ${bill.description}` : ""}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-900">
                        <span className={isVoided ? "line-through" : ""}>
                          ${Number(bill.amount || 0).toFixed(2)}
                        </span>
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
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${getStatusBadgeClass(bill.status)}`}>
                            {bill.status}
                          </span>
                        )}
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
                            </>
                          )}
                          <button
                            onClick={() =>
                              setConfirmDelete({
                                type: "tenant",
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
