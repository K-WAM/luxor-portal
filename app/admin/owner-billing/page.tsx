"use client";

import { useEffect, useMemo, useState } from "react";
import { formatDateOnly, parseDateOnly } from "@/lib/date-only";
import { getStatusBadgeClass } from "@/app/admin/billing/utils";

type BillRow = {
  id: string;
  ownerId?: string;
  ownerEmail: string;
  property: string;
  propertyAddress?: string;
  description: string;
  amount: number;
  dueDate: string;
  status: "due" | "paid" | "overdue" | "pending" | "voided";
  invoiceUrl?: string;
  invoiceNumber?: string;
  paymentLinkUrl?: string | null;
  feePercent?: number | null;
  feeAmount?: number | null;
  propertyId?: string;
  category?: string;
  voidedAt?: string;
  voidedBy?: string;
  voidedReason?: string;
};

type OwnerOption = {
  userId: string;
  email: string;
  propertyId: string;
  propertyAddress: string;
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

type OwnerBillingRow = {
  userId: string;
  ownerEmail: string;
  ownerName?: string;
  propertyId: string;
  propertyAddress: string;
  ownershipPercentage: number | null;
  zelleEmail: string | null;
  zellePhone: string | null;
};

type PropertyGroup = {
  propertyId: string;
  propertyAddress: string;
  owners: OwnerBillingRow[];
  activeOwner: OwnerBillingRow | null; // Owner with Zelle set
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^[+()\d\s.-]{7,}$/;

const isValidPhone = (value: string) => {
  if (!PHONE_REGEX.test(value)) return false;
  const digits = value.replace(/\D/g, "");
  return digits.length >= 7 && digits.length <= 15;
};

export default function OwnerBillingDetailsPage() {
  const [bills, setBills] = useState<BillRow[]>([]);
  const [ownerBillsLoading, setOwnerBillsLoading] = useState(false);
  const [ownerBillError, setOwnerBillError] = useState<string | null>(null);
  const [properties, setProperties] = useState<{ id: string; address: string }[]>([]);
  const [ownerOptions, setOwnerOptions] = useState<OwnerOption[]>([]);
  const [showVoidedOwnerBills, setShowVoidedOwnerBills] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; description: string } | null>(null);
  const [newBill, setNewBill] = useState<{
    propertyId: string;
    ownerId: string;
    feePercent: string;
    feeAmount: string;
    category: string;
    dueDate: string;
    description: string;
  }>({
    propertyId: "",
    ownerId: "",
    feePercent: "",
    feeAmount: "",
    category: "pm_fee",
    dueDate: "",
    description: "",
  });
  const [ownerInvoiceFile, setOwnerInvoiceFile] = useState<File | null>(null);
  const [invoiceUploading, setInvoiceUploading] = useState<Record<string, boolean>>({});
  const [invoiceGenerating, setInvoiceGenerating] = useState<Record<string, boolean>>({});
  const [editAmounts, setEditAmounts] = useState<
    Record<
      string,
      { feePercent?: string; feeAmount?: string; status?: string; ownerId?: string; dueDate?: string }
    >
  >({});
  const [ownerBillPropertyFilter, setOwnerBillPropertyFilter] = useState("");
  const [ownerBillStatusFilter, setOwnerBillStatusFilter] = useState("");
  const [rows, setRows] = useState<OwnerBillingRow[]>([]);
  const [warning, setWarning] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [selectedOwner, setSelectedOwner] = useState<string | null>(null);
  const [form, setForm] = useState<{ type: "email" | "phone"; value: string }>({
    type: "email",
    value: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

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

  const displayedOwnerBills = useMemo(() => {
    return bills
      .filter((bill) => {
        if (!showVoidedOwnerBills && bill.status === "voided") return false;
        if (ownerBillPropertyFilter && bill.propertyId !== ownerBillPropertyFilter) return false;
        if (ownerBillStatusFilter && bill.status !== ownerBillStatusFilter) return false;
        return true;
      })
      .sort(compareDueDateAsc);
  }, [bills, showVoidedOwnerBills, ownerBillPropertyFilter, ownerBillStatusFilter]);

  const loadBills = async (includeVoided = false) => {
    try {
      setOwnerBillsLoading(true);
      setOwnerBillError(null);
      const url = includeVoided ? "/api/admin/billing?includeVoided=true" : "/api/admin/billing";
      const res = await fetch(url, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load billing");
      setBills(data);
    } catch (err: any) {
      setOwnerBillError(err.message || "Failed to load billing");
    } finally {
      setOwnerBillsLoading(false);
    }
  };

  const loadProperties = async () => {
    try {
      const res = await fetch("/api/properties", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load properties");
      setProperties(data.map((p: any) => ({ id: p.id, address: p.address })));
    } catch (err: any) {
      setOwnerBillError(err.message || "Failed to load properties");
    }
  };

  const loadOwnerOptions = async () => {
    try {
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

      const owners: OwnerOption[] = (propsData || [])
        .filter((row: any) => row.role === "owner")
        .map((row: any) => ({
          userId: row.user_id,
          email: emailMap.get(row.user_id) || "",
          propertyId: row.property_id,
          propertyAddress: row.properties?.address || "",
        }));

      setOwnerOptions(owners);
    } catch (err: any) {
      setOwnerBillError(err.message || "Failed to load owner options");
    }
  };

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/admin/owner-billing", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load owner billing details");
      setRows(data.rows || []);
      setWarning(data.warning || null);
    } catch (err: any) {
      setError(err.message || "Failed to load owner billing details");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const load = async () => {
      await Promise.all([loadBills(), loadProperties(), loadOwnerOptions(), loadData()]);
    };
    load();
  }, []);

  useEffect(() => {
    loadBills(showVoidedOwnerBills);
  }, [showVoidedOwnerBills]);

  const filteredOwners = useMemo(() => {
    if (!newBill.propertyId) return [];
    return ownerOptions.filter((o) => o.propertyId === newBill.propertyId);
  }, [ownerOptions, newBill.propertyId]);

  const getOwnersForProperty = (propertyId: string) => {
    return ownerOptions.filter((o) => o.propertyId === propertyId);
  };

  useEffect(() => {
    if (!newBill.propertyId) {
      setNewBill((prev) => ({ ...prev, ownerId: "" }));
      return;
    }
    const stillValid = filteredOwners.some((o) => o.userId === newBill.ownerId);
    if (!stillValid) {
      setNewBill((prev) => ({ ...prev, ownerId: filteredOwners[0]?.userId || "" }));
    }
  }, [filteredOwners, newBill.propertyId]);

  // Group rows by property - show only ONE row per property
  const propertyGroups: PropertyGroup[] = (() => {
    const groupMap = new Map<string, PropertyGroup>();

    rows.forEach((row) => {
      if (!groupMap.has(row.propertyId)) {
        groupMap.set(row.propertyId, {
          propertyId: row.propertyId,
          propertyAddress: row.propertyAddress,
          owners: [],
          activeOwner: null,
        });
      }
      const group = groupMap.get(row.propertyId)!;
      group.owners.push(row);

      // If this owner has Zelle set, mark as active
      if (row.zelleEmail || row.zellePhone) {
        group.activeOwner = row;
      }
    });

    return Array.from(groupMap.values()).sort((a, b) =>
      a.propertyAddress.localeCompare(b.propertyAddress)
    );
  })();

  const handleCreate = async () => {
    if (!newBill.propertyId) {
      setOwnerBillError("Select a property for the bill");
      return;
    }
    try {
      setOwnerBillsLoading(true);
      setOwnerBillError(null);
      const res = await fetch("/api/admin/billing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          propertyId: newBill.propertyId,
          ownerId: newBill.ownerId || undefined,
          feePercent: newBill.feePercent || undefined,
          feeAmount: newBill.feeAmount || undefined,
          category: newBill.category,
          dueDate: newBill.dueDate || undefined,
          description: newBill.description || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create bill");
      if (ownerInvoiceFile) {
        await uploadOwnerInvoice(data.id, ownerInvoiceFile);
        setOwnerInvoiceFile(null);
      }
      await loadBills(showVoidedOwnerBills);
    } catch (err: any) {
      setOwnerBillError(err.message || "Failed to create bill");
    } finally {
      setOwnerBillsLoading(false);
    }
  };

  const handleSave = async (bill: BillRow) => {
    const edits = editAmounts[bill.id] || {};
    try {
      setOwnerBillsLoading(true);
      const res = await fetch("/api/admin/billing", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: bill.id,
          feePercent: edits.feePercent ?? bill.feePercent,
          feeAmount: edits.feeAmount ?? bill.feeAmount,
          status: edits.status ?? bill.status,
          ownerId: edits.ownerId,
          dueDate: edits.dueDate,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update");
      setEditAmounts((prev) => ({ ...prev, [bill.id]: {} }));
      await loadBills(showVoidedOwnerBills);
    } catch (err: any) {
      setOwnerBillError(err.message || "Failed to update billing");
    } finally {
      setOwnerBillsLoading(false);
    }
  };

  const handleVoidOwnerBill = async (billId: string, reason?: string) => {
    try {
      setOwnerBillsLoading(true);
      setOwnerBillError(null);
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
      setOwnerBillError(err.message || "Failed to void bill");
    } finally {
      setOwnerBillsLoading(false);
    }
  };

  const handleDeleteOwnerBill = async (billId: string) => {
    try {
      setOwnerBillsLoading(true);
      setOwnerBillError(null);
      const res = await fetch(`/api/admin/billing?id=${billId}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to delete");
      setConfirmDelete(null);
      await loadBills(showVoidedOwnerBills);
    } catch (err: any) {
      setOwnerBillError(err.message || "Failed to delete bill");
    } finally {
      setOwnerBillsLoading(false);
    }
  };

  const uploadOwnerInvoice = async (billId: string, file: File) => {
    const key = billId;
    setInvoiceUploading((prev) => ({ ...prev, [key]: true }));
    try {
      const formData = new FormData();
      formData.append("billId", billId);
      formData.append("file", file);
      const res = await fetch("/api/admin/billing/invoice", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to upload invoice");
      setBills((prev) =>
        prev.map((b) =>
          b.id === billId
            ? { ...b, invoiceUrl: data.invoiceUrl, invoiceNumber: data.invoiceNumber ?? b.invoiceNumber }
            : b
        )
      );
    } catch (err: any) {
      setOwnerBillError(err.message || "Failed to upload invoice");
    } finally {
      setInvoiceUploading((prev) => ({ ...prev, [key]: false }));
    }
  };

  const generateOwnerInvoice = async (billId: string) => {
    const key = billId;
    setInvoiceGenerating((prev) => ({ ...prev, [key]: true }));
    try {
      const res = await fetch("/api/admin/billing/invoice/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ billId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to generate invoice");
      setBills((prev) =>
        prev.map((b) =>
          b.id === billId
            ? { ...b, invoiceUrl: data.invoiceUrl, invoiceNumber: data.invoiceNumber ?? b.invoiceNumber }
            : b
        )
      );
    } catch (err: any) {
      setOwnerBillError(err.message || "Failed to generate invoice");
    } finally {
      setInvoiceGenerating((prev) => ({ ...prev, [key]: false }));
    }
  };

  const removeOwnerInvoice = async (billId: string) => {
    try {
      setInvoiceUploading((prev) => ({ ...prev, [billId]: true }));
      const res = await fetch(`/api/admin/billing/invoice?billId=${billId}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to remove invoice");
      setBills((prev) => prev.map((b) => (b.id === billId ? { ...b, invoiceUrl: undefined } : b)));
    } catch (err: any) {
      setOwnerBillError(err.message || "Failed to remove invoice");
    } finally {
      setInvoiceUploading((prev) => ({ ...prev, [billId]: false }));
    }
  };

  const getKey = (row: OwnerBillingRow) => `${row.userId}-${row.propertyId}`;

  const startEdit = (group: PropertyGroup) => {
    const row = group.activeOwner || group.owners[0];
    const type = row.zelleEmail ? "email" : row.zellePhone ? "phone" : "email";
    const value = row.zelleEmail || row.zellePhone || "";
    setEditingKey(group.propertyId);
    setSelectedOwner(row.userId);
    setForm({ type, value });
    setError(null);
    setSuccess(null);
  };

  const cancelEdit = () => {
    setEditingKey(null);
    setSelectedOwner(null);
    setForm({ type: "email", value: "" });
  };

  const saveZelle = async (group: PropertyGroup) => {
    const ownerUserId = selectedOwner || group.owners[0]?.userId;
    if (!ownerUserId) return;

    const trimmed = form.value.trim();
    if (trimmed) {
      if (form.type === "email" && !EMAIL_REGEX.test(trimmed)) {
        setError("Enter a valid email address.");
        return;
      }
      if (form.type === "phone" && !isValidPhone(trimmed)) {
        setError("Enter a valid phone number.");
        return;
      }
    }

    try {
      setSavingKey(group.propertyId);
      setError(null);
      setSuccess(null);
      const res = await fetch("/api/admin/owner-billing", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: ownerUserId,
          propertyId: group.propertyId,
          zelleType: form.type,
          zelleValue: trimmed,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save Zelle details");
      setSuccess("Zelle recipient updated for this property.");
      setEditingKey(null);
      setSelectedOwner(null);
      setForm({ type: "email", value: "" });
      await loadData();
    } catch (err: any) {
      setError(err.message || "Failed to save Zelle details");
    } finally {
      setSavingKey(null);
    }
  };

  const deleteZelle = async (group: PropertyGroup) => {
    if (!group.activeOwner) return;

    if (!confirm(`Clear Zelle details for ${group.propertyAddress}?`)) {
      return;
    }

    try {
      setSavingKey(group.propertyId);
      setError(null);
      setSuccess(null);
      const res = await fetch(
        `/api/admin/owner-billing?userId=${group.activeOwner.userId}&propertyId=${group.propertyId}`,
        { method: "DELETE" }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to delete Zelle details");
      setSuccess("Zelle details cleared for this property.");
      await loadData();
    } catch (err: any) {
      setError(err.message || "Failed to delete Zelle details");
    } finally {
      setSavingKey(null);
    }
  };

  if (loading) {
    return (
      <div className="p-8">
        <h1 className="text-3xl font-bold mb-6">Owner Billing</h1>
        <p className="text-gray-600">Loading...</p>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-7xl mx-auto">
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
                onClick={() => handleDeleteOwnerBill(confirmDelete.id)}
                className="px-4 py-2 text-sm rounded bg-red-600 text-white hover:bg-red-700"
              >
                Delete Permanently
              </button>
            </div>
          </div>
        </div>
      )}
      <h1 className="text-3xl font-bold mb-2">Owner Billing</h1>
      <p className="text-slate-600 mb-6">
        Manage owner billing. All billing is manual.
      </p>

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          {error}
        </div>
      )}
      {success && (
        <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg text-green-700">
          {success}
        </div>
      )}
      {warning && (
        <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-lg text-amber-700">
          {warning}
        </div>
      )}

      {propertyGroups.length === 0 ? (
        <div className="bg-white rounded-lg border border-slate-200 p-6 text-center text-gray-500">
          No properties found.
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">Property</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">Zelle Recipient</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">Zelle Details</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {propertyGroups.map((group) => {
                  const isEditing = editingKey === group.propertyId;
                  const isSaving = savingKey === group.propertyId;
                  const activeOwner = group.activeOwner;

                  const zelleLabel = activeOwner?.zelleEmail
                    ? `Email: ${activeOwner.zelleEmail}`
                    : activeOwner?.zellePhone
                      ? `Phone: ${activeOwner.zellePhone}`
                      : "Not set";

                  return (
                    <tr key={group.propertyId} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 text-sm text-slate-900">
                        {group.propertyAddress || group.propertyId}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-900">
                        {isEditing ? (
                          <select
                            value={selectedOwner || ""}
                            onChange={(e) => setSelectedOwner(e.target.value)}
                            className="border border-slate-300 rounded-md px-2 py-1 text-sm bg-white min-w-[200px]"
                          >
                            {group.owners.map((owner) => (
                              <option key={owner.userId} value={owner.userId}>
                                {owner.ownerEmail || owner.userId}
                              </option>
                            ))}
                          </select>
                        ) : (
                          activeOwner?.ownerName || (
                            <span className="text-slate-400 italic">None selected</span>
                          )
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-700">
                        {isEditing ? (
                          <div className="flex flex-col gap-2 max-w-sm">
                            <select
                              value={form.type}
                              onChange={(e) =>
                                setForm((prev) => ({
                                  ...prev,
                                  type: e.target.value as "email" | "phone",
                                }))
                              }
                              className="border border-slate-300 rounded-md px-2 py-1 text-sm bg-white"
                            >
                              <option value="email">Email</option>
                              <option value="phone">Phone</option>
                            </select>
                            <input
                              type="text"
                              value={form.value}
                              onChange={(e) =>
                                setForm((prev) => ({ ...prev, value: e.target.value }))
                              }
                              placeholder={form.type === "email" ? "owner@example.com" : "+1 555 123 4567"}
                              className="border border-slate-300 rounded-md px-2 py-1 text-sm"
                            />
                          </div>
                        ) : (
                          zelleLabel
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {isEditing ? (
                          <div className="flex gap-2">
                            <button
                              onClick={() => saveZelle(group)}
                              disabled={isSaving}
                              className="px-3 py-1.5 rounded-md bg-blue-600 text-white text-xs hover:bg-blue-700 disabled:bg-blue-300"
                            >
                              {isSaving ? "Saving..." : "Save"}
                            </button>
                            <button
                              onClick={cancelEdit}
                              disabled={isSaving}
                              className="px-3 py-1.5 rounded-md bg-slate-200 text-slate-700 text-xs hover:bg-slate-300"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <div className="flex gap-2">
                            <button
                              onClick={() => startEdit(group)}
                              className="px-3 py-1.5 rounded-md border border-slate-300 bg-white text-slate-700 text-xs hover:bg-slate-100"
                            >
                              {activeOwner ? "Edit" : "Add"}
                            </button>
                            {activeOwner && (
                              <button
                                onClick={() => deleteZelle(group)}
                                disabled={isSaving}
                                className="px-3 py-1.5 rounded-md bg-red-50 border border-red-200 text-red-700 text-xs hover:bg-red-100 disabled:opacity-50"
                              >
                                Delete
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200">
          <h2 className="text-lg font-semibold text-slate-900">Create Owner Bill</h2>
          <p className="text-xs text-slate-500">Create a new bill for a property owner.</p>
        </div>
        <div className="px-4 py-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
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
            <label className="text-slate-600 mb-1">Owner</label>
            <select
              className="border border-slate-300 rounded px-3 py-2 text-sm bg-white"
              value={newBill.ownerId}
              onChange={(e) => setNewBill((prev) => ({ ...prev, ownerId: e.target.value }))}
              disabled={!newBill.propertyId}
            >
              <option value="">Select owner...</option>
              {filteredOwners.map((o) => (
                <option key={o.userId} value={o.userId}>
                  {o.email || o.userId}
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
            <label className="text-slate-600 mb-1">% of rent</label>
            <input
              type="number"
              step="0.01"
              className="border border-slate-300 rounded px-3 py-2 text-sm bg-white"
              placeholder="e.g. 10"
              value={newBill.feePercent}
              onChange={(e) => setNewBill((prev) => ({ ...prev, feePercent: e.target.value, feeAmount: "" }))}
            />
          </div>
          <div className="flex flex-col text-sm">
            <label className="text-slate-600 mb-1">$ Amount (or)</label>
            <input
              type="number"
              step="0.01"
              className="border border-slate-300 rounded px-3 py-2 text-sm bg-white"
              placeholder="e.g. 500"
              value={newBill.feeAmount}
              onChange={(e) => setNewBill((prev) => ({ ...prev, feeAmount: e.target.value, feePercent: "" }))}
            />
          </div>
          <div className="flex flex-col text-sm">
            <label className="text-slate-600 mb-1">Due Date</label>
            <input
              type="date"
              className="border border-slate-300 rounded px-3 py-2 text-sm bg-white"
              value={newBill.dueDate}
              onChange={(e) => setNewBill((prev) => ({ ...prev, dueDate: e.target.value }))}
            />
          </div>
          <div className="flex flex-col text-sm lg:col-span-1">
            <label className="text-slate-600 mb-1">Description (visible to owner)</label>
            <input
              type="text"
              className="border border-slate-300 rounded px-3 py-2 text-sm bg-white"
              placeholder="Optional note"
              value={newBill.description}
              onChange={(e) => setNewBill((prev) => ({ ...prev, description: e.target.value }))}
            />
          </div>
          <div className="flex flex-col text-sm lg:col-span-2">
            <label className="text-slate-600 mb-1">Invoice PDF (optional)</label>
            <input
              type="file"
              accept="application/pdf"
              className="border border-slate-300 rounded px-3 py-2 text-sm bg-white"
              onChange={(e) => setOwnerInvoiceFile(e.target.files?.[0] || null)}
            />
            {ownerInvoiceFile && (
              <span className="text-xs text-slate-500 mt-1">{ownerInvoiceFile.name}</span>
            )}
          </div>
        </div>
        {ownerBillError && <div className="px-4 pb-3 text-sm text-red-600">{ownerBillError}</div>}
        <div className="px-4 pb-4">
          <button
            onClick={handleCreate}
            disabled={ownerBillsLoading}
            className="h-10 px-4 rounded bg-slate-900 text-white text-sm hover:bg-slate-800 disabled:opacity-60"
          >
            {ownerBillsLoading ? "Saving..." : "Create bill"}
          </button>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden mt-8">
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
        <div className="px-4 py-3 border-b border-slate-200 flex flex-wrap gap-3 items-center bg-slate-50">
          <span className="text-xs text-slate-600 font-medium">Filters:</span>
          <select
            className="border border-slate-300 rounded px-2 py-1 text-xs bg-white"
            value={ownerBillPropertyFilter}
            onChange={(e) => setOwnerBillPropertyFilter(e.target.value)}
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
            value={ownerBillStatusFilter}
            onChange={(e) => setOwnerBillStatusFilter(e.target.value)}
          >
            <option value="">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="due">Due</option>
            <option value="paid">Paid</option>
            <option value="overdue">Overdue</option>
            <option value="voided">Voided</option>
          </select>
          {(ownerBillPropertyFilter || ownerBillStatusFilter) && (
            <button
              onClick={() => {
                setOwnerBillPropertyFilter("");
                setOwnerBillStatusFilter("");
              }}
              className="text-xs px-2 py-1 text-slate-500 hover:text-slate-700"
            >
              Clear filters
            </button>
          )}
        </div>
        <div className="overflow-x-auto md:overflow-visible">
          <table className="w-full text-sm table-fixed">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-700">
              <tr>
                <th className="px-4 py-3 text-left whitespace-normal">Owner</th>
                <th className="px-4 py-3 text-left whitespace-normal">Property</th>
                <th className="px-4 py-3 text-left whitespace-normal">Category</th>
                <th className="px-4 py-3 text-right whitespace-normal">Amount</th>
                <th className="px-4 py-3 text-left whitespace-normal">Due</th>
                <th className="px-4 py-3 text-left whitespace-normal">Status</th>
                <th className="px-4 py-3 text-left whitespace-normal">Invoice PDF</th>
                <th className="px-4 py-3 text-left whitespace-normal">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {displayedOwnerBills.length === 0 ? (
                <tr>
                  <td className="px-4 py-4 text-slate-500" colSpan={8}>
                    No owner bills found.
                  </td>
                </tr>
              ) : (
                displayedOwnerBills.map((bill) => {
                  const edits = editAmounts[bill.id] || {};
                  const isVoided = bill.status === "voided";
                  return (
                    <tr key={bill.id} className={`hover:bg-slate-50 ${isVoided ? "bg-gray-50 opacity-60" : ""}`}>
                      <td className="px-4 py-3 text-slate-900 break-words">
                        {isVoided ? (
                          bill.ownerEmail
                        ) : (
                          <select
                            className="border border-slate-300 rounded px-2 py-1 text-xs bg-white w-full"
                            value={edits.ownerId ?? bill.ownerId ?? ""}
                            onChange={(e) =>
                              setEditAmounts((prev) => ({
                                ...prev,
                                [bill.id]: { ...prev[bill.id], ownerId: e.target.value },
                              }))
                            }
                          >
                            {getOwnersForProperty(bill.propertyId || "").map((o) => (
                              <option key={o.userId} value={o.userId}>
                                {o.email || o.userId}
                              </option>
                            ))}
                          </select>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-800 break-words">
                        {bill.propertyAddress || bill.property || bill.propertyId}
                      </td>
                      <td className="px-4 py-3 text-slate-700 break-words">
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
                        {isVoided ? (
                          formatDateOnly(bill.dueDate) || "-"
                        ) : (
                          <input
                            type="date"
                            className="border border-slate-300 rounded px-2 py-1 text-xs bg-white w-full"
                            value={edits.dueDate ?? (bill.dueDate ? bill.dueDate.split("T")[0] : "")}
                            onChange={(e) =>
                              setEditAmounts((prev) => ({
                                ...prev,
                                [bill.id]: { ...prev[bill.id], dueDate: e.target.value },
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
                            className="border border-slate-300 rounded px-2 py-1 text-xs bg-white w-full"
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
                              {bill.category === "pm_fee" ? (
                                <div className="flex flex-col gap-1">
                                  <button
                                    type="button"
                                    className="text-xs px-2 py-1 rounded border border-slate-300 text-slate-700 hover:bg-slate-50"
                                    onClick={() => generateOwnerInvoice(bill.id)}
                                    disabled={!!invoiceGenerating[bill.id] || bill.status === "paid" || bill.status === "voided"}
                                  >
                                    {bill.invoiceUrl ? "Regenerate Invoice" : "Generate Invoice"}
                                  </button>
                                  <span className="text-[11px] text-slate-500">
                                    For major corrections (amount/property/owner), void and reissue.
                                  </span>
                                </div>
                              ) : (
                                <label className="text-xs px-2 py-1 rounded border border-slate-300 text-slate-700 hover:bg-slate-50 cursor-pointer">
                                  {bill.invoiceUrl ? "Replace" : "Upload"}
                                  <input
                                    type="file"
                                    accept="application/pdf"
                                    className="hidden"
                                    onChange={(e) => {
                                      const file = e.target.files?.[0];
                                      if (file) uploadOwnerInvoice(bill.id, file);
                                      e.currentTarget.value = "";
                                    }}
                                    disabled={!!invoiceUploading[bill.id]}
                                  />
                                </label>
                              )}
                              {bill.invoiceUrl && (
                                <button
                                  type="button"
                                  className="text-xs px-2 py-1 rounded border border-red-200 text-red-700 hover:bg-red-50"
                                  onClick={() => removeOwnerInvoice(bill.id)}
                                  disabled={!!invoiceUploading[bill.id]}
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
                                onClick={() => handleVoidOwnerBill(bill.id)}
                                disabled={ownerBillsLoading}
                                className="text-xs px-2 py-1 rounded bg-amber-50 border border-amber-200 text-amber-700 hover:bg-amber-100"
                              >
                                Void
                              </button>
                              <button
                                onClick={() => handleSave(bill)}
                                disabled={ownerBillsLoading}
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
                                description: `${bill.propertyAddress || bill.property} - $${bill.amount?.toFixed(2)}`,
                              })
                            }
                            disabled={ownerBillsLoading}
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
