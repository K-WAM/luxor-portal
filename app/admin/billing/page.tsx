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
  status: "due" | "paid" | "overdue" | "pending";
  invoiceUrl?: string;
  feePercent?: number | null;
  feeAmount?: number | null;
  propertyId?: string;
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
};

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
  const [newBill, setNewBill] = useState<{ propertyId: string; month: number; year: number; feePercent: string }>({
    propertyId: "",
    month: new Date().getMonth() + 1,
    year: new Date().getFullYear(),
    feePercent: "10",
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

  const totals = useMemo(() => {
    const due = bills.filter((b) => b.status === "due" || b.status === "overdue").reduce((s, b) => s + (b.amount || 0), 0);
    const paid = bills.filter((b) => b.status === "paid").reduce((s, b) => s + (b.amount || 0), 0);
    return { due, paid };
  }, [bills]);

  const loadBills = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/admin/billing", { cache: "no-store" });
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

  const loadTenantBills = async () => {
    try {
      setTenantBillsLoading(true);
      setTenantBillsError(null);
      const res = await fetch("/api/admin/tenant-billing", { cache: "no-store" });
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
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create bill");
      await loadBills();
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

  const filteredTenants = useMemo(() => {
    if (!tenantBill.propertyId) return tenantOptions;
    return tenantOptions.filter((t) => t.propertyId === tenantBill.propertyId);
  }, [tenantOptions, tenantBill.propertyId]);

  const pendingTenantBills = useMemo(
    () => tenantBills.filter((bill) => bill.status !== "paid"),
    [tenantBills]
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
      await loadTenantBills();
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
      await loadBills();
    } catch (err: any) {
      setError(err.message || "Failed to update billing");
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
      await loadTenantBills();
    } catch (err: any) {
      setTenantBillsError(err.message || "Failed to update tenant bill");
    }
  };

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
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span>Stripe collection coming soon</span>
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
                <th className="px-4 py-3 text-left">Description</th>
                <th className="px-4 py-3 text-right">Amount</th>
                <th className="px-4 py-3 text-left">Due</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Invoice</th>
                <th className="px-4 py-3 text-left">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {bills.map((bill) => {
                const edits = editAmounts[bill.id] || {};
                return (
                  <tr key={bill.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-slate-900">{bill.ownerEmail}</td>
                    <td className="px-4 py-3 text-slate-800">
                      {bill.propertyAddress || bill.property || bill.propertyId}
                    </td>
                    <td className="px-4 py-3 text-slate-700">{bill.description || "PM fee"}</td>
                    <td className="px-4 py-3 text-right text-slate-900">
                      ${bill.amount?.toFixed(2)}
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
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {formatDateOnly(bill.dueDate) || "-"}
                    </td>
                    <td className="px-4 py-3">
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
                        <button
                          onClick={async () => {
                            if (loading) return;
                            setLoading(true);
                            setError(null);
                            try {
                              const res = await fetch(`/api/admin/billing?id=${bill.id}`, { method: "DELETE" });
                              const data = await res.json();
                              if (!res.ok) throw new Error(data.error || "Failed to delete");
                              await loadBills();
                            } catch (err: any) {
                              setError(err.message || "Failed to delete bill");
                            } finally {
                              setLoading(false);
                            }
                          }}
                          className="text-xs px-2 py-1 rounded bg-red-50 border border-red-200 text-red-700 hover:bg-red-100"
                        >
                          Delete
                        </button>
                        <button
                          onClick={() => handleSave(bill)}
                          disabled={loading}
                          className="text-xs px-2 py-1 rounded bg-white border border-slate-300 text-slate-700 hover:bg-slate-50"
                        >
                          {loading ? "Saving..." : "Save"}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden mt-8">
        <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Tenant Bills</h2>
            <p className="text-xs text-slate-500">
              Create one-time charges that appear in the tenant Payments tab.
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
                  {t.email || "Tenant"} {t.propertyAddress ? `• ${t.propertyAddress}` : ""}
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
            <label className="text-slate-600 mb-1">For</label>
            <select
              className="border border-slate-300 rounded px-3 py-2 text-sm bg-white"
              value={tenantBill.billType}
              onChange={(e) =>
                setTenantBill((prev) => ({ ...prev, billType: e.target.value }))
              }
            >
              <option value="rent">Rent</option>
              <option value="fee">Fee</option>
              <option value="late_fee">Late Fee</option>
              <option value="security_deposit">Security Deposit</option>
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

      <div className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden mt-8">
        <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Pending Tenant Bills</h2>
            <p className="text-xs text-slate-500">
              Review unpaid tenant charges and mark them as paid.
            </p>
          </div>
          <button
            onClick={loadTenantBills}
            disabled={tenantBillsLoading}
            className="text-xs px-3 py-1 rounded border border-slate-300 text-slate-700 hover:bg-slate-50"
          >
            {tenantBillsLoading ? "Refreshing..." : "Refresh"}
          </button>
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
                <th className="px-4 py-3 text-left">For</th>
                <th className="px-4 py-3 text-right">Amount</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pendingTenantBills.length === 0 ? (
                <tr>
                  <td className="px-4 py-4 text-slate-500" colSpan={7}>
                    No pending tenant bills.
                  </td>
                </tr>
              ) : (
                pendingTenantBills.map((bill) => (
                  <tr key={bill.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-slate-900">{bill.tenantEmail || "Tenant"}</td>
                    <td className="px-4 py-3 text-slate-700">{bill.propertyAddress || bill.propertyId}</td>
                    <td className="px-4 py-3 text-slate-700">
                      {formatDateOnly(bill.due_date) || "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {bill.bill_type}
                      {bill.description ? ` - ${bill.description}` : ""}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-900">
                      ${Number(bill.amount || 0).toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-slate-700">{bill.status}</td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleMarkTenantBillPaid(bill.id)}
                        className="text-xs px-3 py-1 rounded bg-emerald-600 text-white hover:bg-emerald-700"
                      >
                        Mark Paid
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
