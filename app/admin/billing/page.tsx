"use client";

import React, { useMemo, useEffect, useState } from "react";
import { formatDateOnly, parseDateOnly } from "@/lib/date-only";

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
  paymentLinkUrl?: string | null;
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

type OwnerOption = {
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
  const [editAmounts, setEditAmounts] = useState<Record<string, { feePercent?: string; feeAmount?: string; status?: string; ownerId?: string; dueDate?: string; paymentLinkUrl?: string }>>({});
  const [properties, setProperties] = useState<{ id: string; address: string }[]>([]);
  const [tenantOptions, setTenantOptions] = useState<TenantOption[]>([]);
  const [ownerOptions, setOwnerOptions] = useState<OwnerOption[]>([]);
  const [tenantBillError, setTenantBillError] = useState<string | null>(null);
  const [tenantBillSuccess, setTenantBillSuccess] = useState<string | null>(null);
  const [tenantBills, setTenantBills] = useState<TenantBillRow[]>([]);
  const [tenantBillsLoading, setTenantBillsLoading] = useState(false);
  const [tenantBillsError, setTenantBillsError] = useState<string | null>(null);
  const [showVoidedOwnerBills, setShowVoidedOwnerBills] = useState(false);
  const [showVoidedTenantBills, setShowVoidedTenantBills] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<{ type: "owner" | "tenant"; id: string; description: string } | null>(null);
  const [newBill, setNewBill] = useState<{ propertyId: string; ownerId: string; feePercent: string; feeAmount: string; category: string; dueDate: string; description: string; paymentLinkUrl: string }>({
    propertyId: "",
    ownerId: "",
    feePercent: "",
    feeAmount: "",
    category: "pm_fee",
    dueDate: "",
    description: "",
    paymentLinkUrl: "",
  });
  // Tenant bill filters
  const [tenantBillPropertyFilter, setTenantBillPropertyFilter] = useState("");
  const [tenantBillStatusFilter, setTenantBillStatusFilter] = useState("");
  // Owner bill filters
  const [ownerBillPropertyFilter, setOwnerBillPropertyFilter] = useState("");
  const [ownerBillStatusFilter, setOwnerBillStatusFilter] = useState("");
  const [tenantBill, setTenantBill] = useState({
    propertyId: "",
    tenantId: "",
    amount: "",
    dueDate: "",
    billType: "rent",
    description: "",
    notifyTenant: true,
    paymentLinkUrl: "",
  });
  const [ownerInvoiceFile, setOwnerInvoiceFile] = useState<File | null>(null);
  const [tenantInvoiceFile, setTenantInvoiceFile] = useState<File | null>(null);
  const [invoiceUploading, setInvoiceUploading] = useState<Record<string, boolean>>({});
  const [tenantInvoiceUploading, setTenantInvoiceUploading] = useState<Record<string, boolean>>({});
  const [tenantEdits, setTenantEdits] = useState<Record<string, { paymentLinkUrl?: string; billType?: string }>>({});

  // Filter out voided bills for totals calculation
  // Only include bills in "Balance due" if due date has elapsed (is today or past)
  const totals = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const activeBills = bills.filter((b) => b.status !== "voided");
    const due = activeBills
      .filter((b) => {
        if (b.status !== "due" && b.status !== "overdue") return false;
        // Only count as "due" if dueDate has elapsed or is not set
        const dueDate = parseDateOnly(b.dueDate);
        if (!dueDate) return true; // No due date = count it
        return dueDate <= today;
      })
      .reduce((s, b) => s + (b.amount || 0), 0);
    const paid = activeBills.filter((b) => b.status === "paid").reduce((s, b) => s + (b.amount || 0), 0);
    return { due, paid };
  }, [bills]);

  // Filter owner bills by property and status
  const displayedOwnerBills = useMemo(() => {
    return bills.filter((bill) => {
      // Voided filter
      if (!showVoidedOwnerBills && bill.status === "voided") return false;
      // Property filter
      if (ownerBillPropertyFilter && bill.propertyId !== ownerBillPropertyFilter) return false;
      // Status filter
      if (ownerBillStatusFilter && bill.status !== ownerBillStatusFilter) return false;
      return true;
    });
  }, [bills, showVoidedOwnerBills, ownerBillPropertyFilter, ownerBillStatusFilter]);

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

      const tenants: TenantOption[] = (propsData || [])
        .filter((row: any) => row.role === "tenant")
        .map((row: any) => ({
          userId: row.user_id,
          email: emailMap.get(row.user_id) || "",
          propertyId: row.property_id,
          propertyAddress: row.properties?.address || "",
        }));

      const owners: OwnerOption[] = (propsData || [])
        .filter((row: any) => row.role === "owner")
        .map((row: any) => ({
          userId: row.user_id,
          email: emailMap.get(row.user_id) || "",
          propertyId: row.property_id,
          propertyAddress: row.properties?.address || "",
        }));

      setTenantOptions(tenants);
      setOwnerOptions(owners);
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
    if (!isValidUrl(newBill.paymentLinkUrl)) {
      setError("Payment link must be a valid URL.");
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
          ownerId: newBill.ownerId || undefined,
          feePercent: newBill.feePercent || undefined,
          feeAmount: newBill.feeAmount || undefined,
          category: newBill.category,
          dueDate: newBill.dueDate || undefined,
          description: newBill.description || undefined,
          paymentLinkUrl: newBill.paymentLinkUrl || undefined,
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

  // Owners for the selected property in Create Owner Bill
  const filteredOwners = useMemo(() => {
    if (!newBill.propertyId) return [];
    return ownerOptions.filter((o) => o.propertyId === newBill.propertyId);
  }, [ownerOptions, newBill.propertyId]);

  // Helper to get owners for a specific property (used in edit table)
  const getOwnersForProperty = (propertyId: string) => {
    return ownerOptions.filter((o) => o.propertyId === propertyId);
  };

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
    });
  }, [tenantBills, showVoidedTenantBills, tenantBillPropertyFilter, tenantBillStatusFilter]);

  useEffect(() => {
    if (!tenantBill.propertyId) return;
    const stillValid = filteredTenants.some((t) => t.userId === tenantBill.tenantId);
    if (!stillValid && tenantBill.tenantId) {
      setTenantBill((prev) => ({ ...prev, tenantId: "" }));
    }
  }, [filteredTenants, tenantBill.propertyId, tenantBill.tenantId]);

  // Auto-select first owner when property changes for Create Owner Bill
  useEffect(() => {
    if (!newBill.propertyId) {
      setNewBill((prev) => ({ ...prev, ownerId: "" }));
      return;
    }
    const stillValid = filteredOwners.some((o) => o.userId === newBill.ownerId);
    if (!stillValid) {
      // Auto-select first owner if available
      setNewBill((prev) => ({ ...prev, ownerId: filteredOwners[0]?.userId || "" }));
    }
  }, [filteredOwners, newBill.propertyId]);

  const handleCreateTenantBill = async () => {
    if (!tenantBill.propertyId || !tenantBill.tenantId) {
      setTenantBillError("Select a property and tenant.");
      return;
    }
    if (!tenantBill.amount || !tenantBill.dueDate) {
      setTenantBillError("Amount and due date are required.");
      return;
    }
    if (!isValidUrl(tenantBill.paymentLinkUrl)) {
      setTenantBillError("Payment link must be a valid URL.");
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
          paymentLinkUrl: tenantBill.paymentLinkUrl || undefined,
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
        paymentLinkUrl: "",
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
    const paymentLinkUrl = edits.paymentLinkUrl ?? bill.paymentLinkUrl ?? "";
    if (!isValidUrl(paymentLinkUrl)) {
      setError("Payment link must be a valid URL.");
      return;
    }
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
          ownerId: edits.ownerId,
          dueDate: edits.dueDate,
          paymentLinkUrl: paymentLinkUrl || null,
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

  const handleSaveTenantBill = async (bill: TenantBillRow) => {
    const edits = tenantEdits[bill.id] || {};
    const paymentLinkUrl = edits.paymentLinkUrl ?? bill.paymentLinkUrl ?? "";
    if (!isValidUrl(paymentLinkUrl)) {
      setTenantBillsError("Payment link must be a valid URL.");
      return;
    }
    const billType = edits.billType ?? bill.bill_type;
    try {
      setTenantBillsError(null);
      const res = await fetch("/api/admin/tenant-billing", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: bill.id,
          paymentLinkUrl: paymentLinkUrl || null,
          billType,
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

  const isValidUrl = (value: string) => {
    if (!value) return true;
    try {
      const parsed = new URL(value);
      return parsed.protocol === "http:" || parsed.protocol === "https:";
    } catch {
      return false;
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
      setBills((prev) => prev.map((b) => (b.id === billId ? { ...b, invoiceUrl: data.invoiceUrl } : b)));
    } catch (err: any) {
      setError(err.message || "Failed to upload invoice");
    } finally {
      setInvoiceUploading((prev) => ({ ...prev, [key]: false }));
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
      setError(err.message || "Failed to remove invoice");
    } finally {
      setInvoiceUploading((prev) => ({ ...prev, [billId]: false }));
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

      {/* Create Owner Bill Section */}
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
            <label className="text-slate-600 mb-1">Payment Link (optional)</label>
            <input
              type="url"
              className="border border-slate-300 rounded px-3 py-2 text-sm bg-white"
              placeholder="https://"
              value={newBill.paymentLinkUrl}
              onChange={(e) => setNewBill((prev) => ({ ...prev, paymentLinkUrl: e.target.value }))}
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
        {error && <div className="px-4 pb-3 text-sm text-red-600">{error}</div>}
        <div className="px-4 pb-4">
          <button
            onClick={handleCreate}
            disabled={loading}
            className="h-10 px-4 rounded bg-slate-900 text-white text-sm hover:bg-slate-800 disabled:opacity-60"
          >
            {loading ? "Saving..." : "Create bill"}
          </button>
        </div>
      </div>

      {/* Owner Bills List Section */}
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
        {/* Filters */}
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
                <th className="px-4 py-3 text-left">Payment Link</th>
                <th className="px-4 py-3 text-left">Invoice PDF</th>
                <th className="px-4 py-3 text-left">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {displayedOwnerBills.length === 0 ? (
                <tr>
                  <td className="px-4 py-4 text-slate-500" colSpan={9}>
                    No owner bills found.
                  </td>
                </tr>
              ) : (
                displayedOwnerBills.map((bill) => {
                  const edits = editAmounts[bill.id] || {};
                  const isVoided = bill.status === "voided";
                  return (
                    <tr key={bill.id} className={`hover:bg-slate-50 ${isVoided ? "bg-gray-50 opacity-60" : ""}`}>
                      <td className="px-4 py-3 text-slate-900">
                        {isVoided ? (
                          bill.ownerEmail
                        ) : (
                          <select
                            className="border border-slate-300 rounded px-2 py-1 text-xs bg-white min-w-[150px]"
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
                        {isVoided ? (
                          formatDateOnly(bill.dueDate) || "-"
                        ) : (
                          <input
                            type="date"
                            className="border border-slate-300 rounded px-2 py-1 text-xs bg-white w-32"
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
                      <td className="px-4 py-3 text-slate-700">
                        {isVoided ? (
                          <span className="text-xs text-slate-400">-</span>
                        ) : (
                          <input
                            type="url"
                            placeholder="https://"
                            className="border border-slate-300 rounded px-2 py-1 text-xs bg-white w-56"
                            value={edits.paymentLinkUrl ?? bill.paymentLinkUrl ?? ""}
                            onChange={(e) =>
                              setEditAmounts((prev) => ({
                                ...prev,
                                [bill.id]: { ...prev[bill.id], paymentLinkUrl: e.target.value },
                              }))
                            }
                          />
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
                                    if (file) uploadOwnerInvoice(bill.id, file);
                                    e.currentTarget.value = "";
                                  }}
                                  disabled={!!invoiceUploading[bill.id]}
                                />
                              </label>
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
          <div className="flex flex-col text-sm md:col-span-2">
            <label className="text-slate-600 mb-1">Payment Link (optional)</label>
            <input
              type="url"
              className="border border-slate-300 rounded px-3 py-2 text-sm bg-white"
              value={tenantBill.paymentLinkUrl}
              onChange={(e) =>
                setTenantBill((prev) => ({ ...prev, paymentLinkUrl: e.target.value }))
              }
              placeholder="https://"
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
                <th className="px-4 py-3 text-left">Payment Link</th>
                <th className="px-4 py-3 text-left">Invoice PDF</th>
                <th className="px-4 py-3 text-left">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {displayedTenantBills.length === 0 ? (
                <tr>
                  <td className="px-4 py-4 text-slate-500" colSpan={9}>
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
                        {formatDateOnly(bill.due_date) || "-"}
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
                              className="border border-slate-300 rounded px-2 py-1 text-xs bg-white"
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
                            {bill.description ? (
                              <span className="text-[11px] text-slate-500">{bill.description}</span>
                            ) : null}
                          </div>
                        )}
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
                      <td className="px-4 py-3 text-slate-700">
                        {isVoided ? (
                          <span className="text-xs text-slate-400">-</span>
                        ) : (
                          <input
                            type="url"
                            placeholder="https://"
                            className="border border-slate-300 rounded px-2 py-1 text-xs bg-white w-56"
                            value={tenantEdits[bill.id]?.paymentLinkUrl ?? bill.paymentLinkUrl ?? ""}
                            onChange={(e) =>
                              setTenantEdits((prev) => ({
                                ...prev,
                                [bill.id]: { ...prev[bill.id], paymentLinkUrl: e.target.value },
                              }))
                            }
                          />
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
