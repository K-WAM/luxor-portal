"use client";

import { useEffect, useMemo, useState } from "react";
import { formatDateOnly, parseDateOnly } from "@/lib/date-only";
import { getStatusBadgeClass } from "@/app/admin/billing/utils";
import { getShortPropertyName } from "@/lib/property-short-name";

type BillRow = {
  id: string;
  ownerId?: string;
  ownerEmail: string;
  property: string;
  propertyAddress?: string;
  description: string;
  amount: number;
  dueDate: string;
  status: "due" | "paid" | "overdue" | "pending" | "processing" | "voided";
  invoiceUrl?: string;
  invoiceNumber?: string;
  paymentLinkUrl?: string | null;
  recipientEmail?: string | null;
  recipientName?: string | null;
  recipientSource?: "auth_user" | "pending_invite" | "manual" | null;
  recipientInviteId?: string | null;
  recipientUserId?: string | null;
  stripeSessionId?: string | null;
  stripePaymentIntentId?: string | null;
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

type OwnerPaymentDetailsRow = {
  propertyId: string;
  propertyAddress: string;
  recipient: string;
  zelleEmail: string | null;
  zellePhone: string | null;
  stripeConnectedAccountId: string;
};

type PendingInviteOption = {
  id: string;
  email: string;
  name?: string | null;
  role: string;
  property_id: string;
  status: string;
  expires_at?: string | null;
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^[+()\d\s.-]{7,}$/;

const isValidPhone = (value: string) => {
  if (!PHONE_REGEX.test(value)) return false;
  const digits = value.replace(/\D/g, "");
  return digits.length >= 7 && digits.length <= 15;
};

const getCompactUserLabel = (email?: string | null, fallback = "Owner") => {
  const normalized = String(email || "").trim();
  if (!normalized) return fallback;
  const localPart = normalized.split("@")[0]?.trim();
  return localPart || fallback;
};

export default function OwnerBillingDetailsPage() {
  const [bills, setBills] = useState<BillRow[]>([]);
  const [ownerBillsLoading, setOwnerBillsLoading] = useState(false);
  const [ownerBillError, setOwnerBillError] = useState<string | null>(null);
  const [properties, setProperties] = useState<{ id: string; address: string }[]>([]);
  const [ownerOptions, setOwnerOptions] = useState<OwnerOption[]>([]);
  const [pendingInvites, setPendingInvites] = useState<PendingInviteOption[]>([]);
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
    recipientChoice: string;
    manualRecipientEmail: string;
  }>({
    propertyId: "",
    ownerId: "",
    feePercent: "",
    feeAmount: "",
    category: "pm_fee",
    dueDate: "",
    description: "",
    recipientChoice: "linked",
    manualRecipientEmail: "",
  });
  const [ownerInvoiceFile, setOwnerInvoiceFile] = useState<File | null>(null);
  const [invoiceUploading, setInvoiceUploading] = useState<Record<string, boolean>>({});
  const [invoiceGenerating, setInvoiceGenerating] = useState<Record<string, boolean>>({});
  const [showDesktopSite, setShowDesktopSite] = useState(false);
  const [showCreateOwnerBillMobile, setShowCreateOwnerBillMobile] = useState(false);
  const [editAmounts, setEditAmounts] = useState<
    Record<
      string,
      {
        feePercent?: string;
        feeAmount?: string;
        status?: string;
        ownerId?: string;
        dueDate?: string;
        description?: string;
        recipientChoice?: string;
        manualRecipientEmail?: string;
      }
    >
  >({});
  const [ownerBillPropertyFilter, setOwnerBillPropertyFilter] = useState("");
  const [ownerBillStatusFilter, setOwnerBillStatusFilter] = useState("");
  const [showPaidOwnerBills, setShowPaidOwnerBills] = useState(false);
  const [rows, setRows] = useState<OwnerPaymentDetailsRow[]>([]);
  const [warning, setWarning] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [form, setForm] = useState<{ type: "email" | "phone"; value: string; recipient: string; stripeAccountId: string }>(
    {
      type: "email",
      value: "",
      recipient: "",
      stripeAccountId: "",
    }
  );
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

  const getDisplayStatus = (status?: string | null, dueDate?: string | null) => {
    const normalized = String(status || "").toLowerCase();
    if (normalized !== "due") return normalized || "due";
    const due = parseDateOnly(dueDate);
    if (!due) return normalized;
    const now = new Date();
    const todayUtcMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    return due.getTime() < todayUtcMs ? "overdue" : normalized;
  };

  const getStatusLabel = (status?: string | null, dueDate?: string | null) => {
    const displayStatus = getDisplayStatus(status, dueDate);
    switch (displayStatus) {
      case "paid":
        return "Paid";
      case "processing":
        return "Processing";
      case "overdue":
        return "Overdue";
      case "voided":
        return "Voided";
      case "pending":
        return "Pending";
      default:
        return "Due";
    }
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
        if (ownerBillStatusFilter && getDisplayStatus(bill.status, bill.dueDate) !== ownerBillStatusFilter) return false;
        return true;
      })
      .sort(compareDueDateAsc);
  }, [bills, showVoidedOwnerBills, ownerBillPropertyFilter, ownerBillStatusFilter]);
  const paidOwnerBills = useMemo(
    () => displayedOwnerBills.filter((bill) => bill.status === "paid"),
    [displayedOwnerBills]
  );
  const activeOwnerBills = useMemo(
    () => displayedOwnerBills.filter((bill) => bill.status !== "paid"),
    [displayedOwnerBills]
  );
  const showPaidOwnerBillsEffective = showPaidOwnerBills || ownerBillStatusFilter === "paid";
  const visibleOwnerBills = useMemo(
    () => (showPaidOwnerBillsEffective ? [...activeOwnerBills, ...paidOwnerBills] : activeOwnerBills),
    [showPaidOwnerBillsEffective, activeOwnerBills, paidOwnerBills]
  );

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

  const loadPendingInvites = async () => {
    try {
      const res = await fetch("/api/invites", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load invites");
      const now = Date.now();
      setPendingInvites(
        (data || []).filter(
          (invite: any) =>
            invite.role === "owner" &&
            invite.status === "pending" &&
            invite.expires_at &&
            new Date(invite.expires_at).getTime() > now
        )
      );
    } catch (err: any) {
      setOwnerBillError(err.message || "Failed to load pending invites");
    }
  };

  useEffect(() => {
    const load = async () => {
      await Promise.all([loadBills(), loadProperties(), loadOwnerOptions(), loadPendingInvites(), loadData()]);
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

  const getOwnerInviteOptions = (propertyId: string) =>
    pendingInvites.filter((invite) => invite.property_id === propertyId);

  const buildRecipientPayload = (
    choice: string,
    manualEmail: string,
    propertyId: string,
    ownerId?: string | null
  ) => {
    if (choice === "manual") {
      return {
        recipientSource: "manual",
        recipientEmail: manualEmail.trim() || null,
        recipientName: null,
        recipientInviteId: null,
        recipientUserId: null,
      };
    }
    if (choice.startsWith("invite:")) {
      const inviteId = choice.slice("invite:".length);
      const invite = getOwnerInviteOptions(propertyId).find((item) => item.id === inviteId);
      return {
        recipientSource: "pending_invite",
        recipientEmail: invite?.email || null,
        recipientName: invite?.name || null,
        recipientInviteId: inviteId || null,
        recipientUserId: null,
      };
    }
    if (choice.startsWith("auth:")) {
      const userId = choice.slice("auth:".length);
      const owner = ownerOptions.find((item) => item.userId === userId && item.propertyId === propertyId);
      return {
        recipientSource: "auth_user",
        recipientEmail: owner?.email || null,
        recipientName: null,
        recipientInviteId: null,
        recipientUserId: userId || ownerId || null,
      };
    }
    return {};
  };

  const getBillRecipientChoice = (bill: BillRow) => {
    if (bill.recipientSource === "manual") return "manual";
    if (bill.recipientSource === "pending_invite" && bill.recipientInviteId) return `invite:${bill.recipientInviteId}`;
    if (bill.recipientSource === "auth_user" && bill.recipientUserId) return `auth:${bill.recipientUserId}`;
    return "linked";
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

  const paymentDetailsRows = useMemo(
    () =>
      [...rows].sort((a, b) =>
        (a.propertyAddress || "").localeCompare(b.propertyAddress || "")
      ),
    [rows]
  );

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
          ...buildRecipientPayload(
            newBill.recipientChoice,
            newBill.manualRecipientEmail,
            newBill.propertyId,
            newBill.ownerId
          ),
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
    const recipientChoice = edits.recipientChoice ?? getBillRecipientChoice(bill);
    const manualRecipientEmail = edits.manualRecipientEmail ?? (bill.recipientSource === "manual" ? bill.recipientEmail || "" : "");
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
          description: edits.description ?? bill.description,
          ...buildRecipientPayload(
            recipientChoice,
            manualRecipientEmail,
            bill.propertyId || "",
            edits.ownerId ?? bill.ownerId
          ),
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

  const handleMarkOwnerBillPaid = async (billId: string) => {
    try {
      setOwnerBillsLoading(true);
      setOwnerBillError(null);
      const res = await fetch("/api/admin/billing", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: billId, status: "paid" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update bill");
      await loadBills(showVoidedOwnerBills);
    } catch (err: any) {
      setOwnerBillError(err.message || "Failed to update bill");
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

  const startEdit = (row: OwnerPaymentDetailsRow) => {
    const type = row.zelleEmail ? "email" : row.zellePhone ? "phone" : "email";
    const value = row.zelleEmail || row.zellePhone || "";
    const recipient = row.recipient || "";
    setEditingKey(row.propertyId);
    setForm({
      type,
      value,
      recipient,
      stripeAccountId: row.stripeConnectedAccountId || "",
    });
    setError(null);
    setSuccess(null);
  };

  const cancelEdit = () => {
    setEditingKey(null);
    setForm({ type: "email", value: "", recipient: "", stripeAccountId: "" });
  };

  const savePaymentDetails = async (row: OwnerPaymentDetailsRow) => {
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
      setSavingKey(row.propertyId);
      setError(null);
      setSuccess(null);
      const res = await fetch("/api/admin/owner-billing", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          propertyId: row.propertyId,
          zelleType: form.type,
          zelleValue: trimmed,
          zelleRecipient: form.recipient,
          stripeConnectedAccountId: form.stripeAccountId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save Zelle details");
      setSuccess("Owner payment details updated for this property.");
      setEditingKey(null);
      setForm({ type: "email", value: "", recipient: "", stripeAccountId: "" });
      await loadData();
    } catch (err: any) {
      setError(err.message || "Failed to save owner payment details");
    } finally {
      setSavingKey(null);
    }
  };

  const clearPaymentDetails = async (row: OwnerPaymentDetailsRow) => {
    if (!confirm(`Clear payment details for ${row.propertyAddress}?`)) {
      return;
    }

    try {
      setSavingKey(row.propertyId);
      setError(null);
      setSuccess(null);
      const res = await fetch(
        `/api/admin/owner-billing?propertyId=${row.propertyId}`,
        { method: "DELETE" }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to clear payment details");
      setSuccess("Owner payment details cleared for this property.");
      await loadData();
    } catch (err: any) {
      setError(err.message || "Failed to clear payment details");
    } finally {
      setSavingKey(null);
    }
  };

  if (loading) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-semibold text-slate-900 mb-2">Owner Billing</h1>
        <p className="text-slate-500 text-sm">Loading...</p>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-8">
      {confirmDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4 shadow-2xl border border-slate-200">
            <h3 className="text-base font-semibold text-slate-900 mb-1">Confirm Permanent Delete</h3>
            <p className="text-sm text-slate-500 mb-4">
              This cannot be undone. The bill will be permanently removed.
            </p>
            <div className="rounded-lg bg-red-50 border border-red-100 px-4 py-2 text-sm text-red-700 font-medium mb-5">
              {confirmDelete.description}
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setConfirmDelete(null)}
                className="px-4 py-2 text-sm rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteOwnerBill(confirmDelete.id)}
                className="px-4 py-2 text-sm rounded-lg bg-red-600 text-white hover:bg-red-700"
              >
                Delete Permanently
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Page header */}
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Owner Billing</h1>
        <p className="text-slate-500 text-sm mt-1">Manage owner payment details and owner invoices.</p>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">{error}</div>
      )}
      {success && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-700">{success}</div>
      )}
      {warning && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-700">{warning}</div>
      )}

      {/* Zelle settings */}
      <div className="md:hidden">
        <button
          type="button"
          onClick={() => setShowDesktopSite((prev) => !prev)}
          className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          {showDesktopSite ? "Back to Mobile View" : "View Desktop Site for More Options"}
        </button>
      </div>

      <section className="hidden md:block">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">Owner Payment Details</h2>
            <p className="text-xs text-slate-400 mt-0.5">Property-level payment details shown to tenants for each property</p>
          </div>
        </div>
        {paymentDetailsRows.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 p-6 text-center text-slate-400 text-sm">
            No properties found.
          </div>
        ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Property</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Recipient</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Zelle Contact</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Stripe Account ID</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paymentDetailsRows.map((row) => {
                  const isEditing = editingKey === row.propertyId;
                  const isSaving = savingKey === row.propertyId;
                  const zelleLabel = row.zelleEmail
                    ? row.zelleEmail
                    : row.zellePhone
                      ? row.zellePhone
                      : null;
                  const recipientLabel = row.recipient || "-";

                  return (
                    <tr key={row.propertyId} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-5 py-3.5 text-sm font-medium text-slate-900">
                        <span title={row.propertyAddress || row.propertyId}>
                          {getShortPropertyName(row.propertyAddress) || row.propertyId}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-sm text-slate-600">
                        {isEditing ? (
                          <div className="flex flex-col gap-2 min-w-[220px]">
                            <input
                              type="text"
                              value={form.recipient}
                              onChange={(e) =>
                                setForm((prev) => ({ ...prev, recipient: e.target.value }))
                              }
                              placeholder="e.g. Owner name"
                              className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm bg-white"
                            />
                          </div>
                        ) : (
                          <span className={recipientLabel === "-" ? "text-slate-400" : ""}>{recipientLabel}</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-sm text-slate-600">
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
                              className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm bg-white"
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
                              className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm"
                            />
                          </div>
                        ) : zelleLabel ? (
                          <span className="inline-flex items-center gap-1.5 text-sm text-slate-700">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 inline-block" />
                            {zelleLabel}
                          </span>
                        ) : (
                          <span className="text-slate-400 text-xs">Not configured</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-sm text-slate-600">
                        {isEditing ? (
                          <input
                            type="text"
                            value={form.stripeAccountId}
                            onChange={(e) =>
                              setForm((prev) => ({ ...prev, stripeAccountId: e.target.value }))
                            }
                            placeholder="acct_..."
                            className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm bg-white w-full"
                          />
                        ) : row.stripeConnectedAccountId ? (
                          <span className="font-mono text-xs text-slate-700">{row.stripeConnectedAccountId}</span>
                        ) : (
                          <span className="text-slate-400 text-xs">Not configured</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-sm">
                        {isEditing ? (
                          <div className="flex gap-2">
                            <button
                              onClick={() => savePaymentDetails(row)}
                              disabled={isSaving}
                              className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 disabled:opacity-50"
                            >
                              {isSaving ? "Saving..." : "Save"}
                            </button>
                            <button
                              onClick={cancelEdit}
                              disabled={isSaving}
                              className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-600 text-xs hover:bg-slate-50"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <div className="flex gap-2">
                            <button
                              onClick={() => startEdit(row)}
                              className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-slate-700 text-xs font-medium hover:bg-slate-50"
                            >
                              {zelleLabel || row.stripeConnectedAccountId ? "Edit" : "Add"}
                            </button>
                            {(zelleLabel || row.stripeConnectedAccountId) && (
                              <button
                                onClick={() => clearPaymentDetails(row)}
                                disabled={isSaving}
                                className="px-3 py-1.5 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs hover:bg-red-100 disabled:opacity-50"
                              >
                                Clear
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
      </section>

      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">Create Owner Bill</h2>
            <p className="text-xs text-slate-400 mt-0.5">Create a new bill for a property owner.</p>
          </div>
          <button
            type="button"
            onClick={() => setShowCreateOwnerBillMobile((prev) => !prev)}
            className="md:hidden inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-300 bg-white text-lg font-medium text-slate-700 hover:bg-slate-50"
            aria-label={showCreateOwnerBillMobile ? "Collapse create owner bill" : "Expand create owner bill"}
          >
            {showCreateOwnerBillMobile ? "Ã¢Ë†â€™" : "+"}
          </button>
        </div>
        <div className={`${showCreateOwnerBillMobile ? "block" : "hidden"} md:block`}>
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
                      {getShortPropertyName(p.address)}
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
            <label className="text-slate-600 mb-1">Billing Email Recipient</label>
            <select
              className="border border-slate-300 rounded px-3 py-2 text-sm bg-white"
              value={newBill.recipientChoice}
              onChange={(e) =>
                setNewBill((prev) => ({
                  ...prev,
                  recipientChoice: e.target.value,
                  manualRecipientEmail: e.target.value === "manual" ? prev.manualRecipientEmail : "",
                }))
              }
              disabled={!newBill.propertyId}
            >
              <option value="linked">Linked account email</option>
              {newBill.ownerId && <option value={`auth:${newBill.ownerId}`}>Selected owner account</option>}
              {getOwnerInviteOptions(newBill.propertyId).map((invite) => (
                <option key={invite.id} value={`invite:${invite.id}`}>
                  Pending invite - {invite.email}
                </option>
              ))}
              <option value="manual">Manual email</option>
            </select>
          </div>
          {newBill.recipientChoice === "manual" && (
            <div className="flex flex-col text-sm">
              <label className="text-slate-600 mb-1">Manual Recipient Email</label>
              <input
                type="email"
                className="border border-slate-300 rounded px-3 py-2 text-sm bg-white"
                value={newBill.manualRecipientEmail}
                onChange={(e) => setNewBill((prev) => ({ ...prev, manualRecipientEmail: e.target.value }))}
                placeholder="owner@example.com"
              />
            </div>
          )}
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
      </div>

      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">Owner Bills</h2>
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => setShowPaidOwnerBills((prev) => !prev)}
              className="text-xs px-3 py-1 rounded border border-slate-300 text-slate-700 hover:bg-slate-50"
            >
              {showPaidOwnerBillsEffective
                ? `Hide paid (${paidOwnerBills.length})`
                : `Show paid (${paidOwnerBills.length})`}
            </button>
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
                {getShortPropertyName(p.address)}
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
            <option value="processing">Processing</option>
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
        <div className={showDesktopSite ? "hidden" : "md:hidden"}>
          {visibleOwnerBills.length === 0 ? (
            <div className="px-4 py-4 text-sm text-slate-500">No owner bills found.</div>
          ) : (
            <div className="divide-y divide-slate-100">
              {visibleOwnerBills.map((bill) => {
                const isVoided = bill.status === "voided";
                return (
                  <div key={bill.id} className={`px-4 py-4 ${isVoided ? "bg-gray-50 opacity-70" : "bg-white"}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-slate-900" title={bill.propertyAddress || bill.property || bill.propertyId}>
                          {getShortPropertyName(bill.propertyAddress || bill.property) || bill.propertyId}
                        </div>
                        <div className="text-xs text-slate-500" title={bill.ownerEmail || "Owner"}>
                          {getCompactUserLabel(bill.ownerEmail)}
                        </div>
                      </div>
                      <div className="text-sm font-semibold text-slate-900">${Number(bill.amount || 0).toFixed(2)}</div>
                    </div>
                    <div className="mt-2 text-sm text-slate-700 whitespace-normal break-words">
                      {bill.description || OWNER_BILL_CATEGORIES.find((c) => c.value === bill.category)?.label || "Bill"}
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-3 text-xs">
                      <div className="text-slate-600">Due {formatDateOnly(bill.dueDate) || "-"}</div>
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 font-medium ${getStatusBadgeClass(getDisplayStatus(bill.status, bill.dueDate))}`}>
                        {getStatusLabel(bill.status, bill.dueDate)}
                      </span>
                    </div>
                    {!isVoided && bill.status !== "paid" && (
                      <div className="mt-3">
                        <button
                          type="button"
                          onClick={() => handleMarkOwnerBillPaid(bill.id)}
                          disabled={ownerBillsLoading}
                          className="w-full rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                        >
                          Mark Paid
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <div className={showDesktopSite ? "block" : "hidden md:block"}>
        <div className="overflow-x-auto">
          <table className="w-full table-fixed text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-700">
              <tr>
                <th className="px-3 py-3 text-left whitespace-normal w-[14%]">Owner</th>
                <th className="px-3 py-3 text-left whitespace-normal w-[11%]">Property</th>
                <th className="px-3 py-3 text-left whitespace-normal w-[27%]">Bill</th>
                <th className="px-3 py-3 text-right whitespace-normal w-[12%]">Amount</th>
                <th className="px-3 py-3 text-left whitespace-normal w-[11%]">Due</th>
                <th className="px-3 py-3 text-left whitespace-normal w-[11%]">Status</th>
                <th className="px-3 py-3 text-left whitespace-normal w-[14%]">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visibleOwnerBills.length === 0 ? (
                <tr>
                  <td className="px-3 py-4 text-slate-500" colSpan={7}>
                    No owner bills found.
                  </td>
                </tr>
              ) : (
                visibleOwnerBills.map((bill) => {
                  const edits = editAmounts[bill.id] || {};
                  const displayStatus = edits.status ?? getDisplayStatus(bill.status, bill.dueDate);
                  const isVoided = bill.status === "voided";
                  return (
                    <tr key={bill.id} className={`hover:bg-slate-50 ${isVoided ? "bg-gray-50 opacity-60" : ""}`}>
                      <td className="px-3 py-3 align-top text-slate-900 break-words">
                        {isVoided ? (
                          <span title={bill.ownerEmail}>{getCompactUserLabel(bill.ownerEmail)}</span>
                        ) : (
                          <div>
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
                                <option key={o.userId} value={o.userId} title={o.email || o.userId}>
                                  {getCompactUserLabel(o.email, o.userId)}
                                </option>
                              ))}
                            </select>
                            <select
                              className="mt-1 border border-slate-300 rounded px-2 py-1 text-xs bg-white w-full"
                              value={edits.recipientChoice ?? getBillRecipientChoice(bill)}
                              onChange={(e) =>
                                setEditAmounts((prev) => ({
                                  ...prev,
                                  [bill.id]: {
                                    ...prev[bill.id],
                                    recipientChoice: e.target.value,
                                    manualRecipientEmail:
                                      e.target.value === "manual"
                                        ? prev[bill.id]?.manualRecipientEmail ?? (bill.recipientSource === "manual" ? bill.recipientEmail || "" : "")
                                        : "",
                                  },
                                }))
                              }
                            >
                              <option value="linked">Email: linked account</option>
                              {(edits.ownerId ?? bill.ownerId) && (
                                <option value={`auth:${edits.ownerId ?? bill.ownerId}`}>Email: selected owner</option>
                              )}
                              {getOwnerInviteOptions(bill.propertyId || "").map((invite) => (
                                <option key={invite.id} value={`invite:${invite.id}`}>
                                  Email: invite {getCompactUserLabel(invite.email)}
                                </option>
                              ))}
                              <option value="manual">Email: manual</option>
                            </select>
                            {(edits.recipientChoice ?? getBillRecipientChoice(bill)) === "manual" && (
                              <input
                                type="email"
                                className="mt-1 border border-slate-300 rounded px-2 py-1 text-xs bg-white w-full"
                                placeholder="owner@example.com"
                                value={edits.manualRecipientEmail ?? (bill.recipientSource === "manual" ? bill.recipientEmail || "" : "")}
                                onChange={(e) =>
                                  setEditAmounts((prev) => ({
                                    ...prev,
                                    [bill.id]: { ...prev[bill.id], manualRecipientEmail: e.target.value },
                                  }))
                                }
                              />
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-3 align-top text-slate-800 break-words">
                        <span title={bill.propertyAddress || bill.property || bill.propertyId}>
                          {getShortPropertyName(bill.propertyAddress || bill.property) || bill.propertyId}
                        </span>
                      </td>
                      <td className="px-3 py-3 align-top text-slate-700 break-words">
                        {isVoided ? (
                          <div className="space-y-1">
                            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                              {OWNER_BILL_CATEGORIES.find((c) => c.value === bill.category)?.label || bill.category || "PM fee"}
                            </div>
                            <div className="whitespace-normal break-words">{bill.description || "Ã¢â‚¬â€"}</div>
                          </div>
                        ) : (
                          <div className="space-y-1">
                            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                              {OWNER_BILL_CATEGORIES.find((c) => c.value === bill.category)?.label || bill.category || "PM fee"}
                            </div>
                            <textarea
                              rows={2}
                              className="border border-slate-300 rounded px-2 py-1 text-xs bg-white w-full resize-none"
                              value={edits.description ?? bill.description ?? ""}
                              onChange={(e) =>
                                setEditAmounts((prev) => ({
                                  ...prev,
                                  [bill.id]: { ...prev[bill.id], description: e.target.value },
                                }))
                              }
                            />
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-3 align-top text-right text-slate-900">
                        <span className={isVoided ? "line-through" : ""}>
                          ${bill.amount?.toFixed(2)}
                        </span>
                        {!isVoided && (
                          <div className="mt-1 flex justify-end text-[11px] text-slate-600">
                            <input
                              type="number"
                              step="0.01"
                              placeholder="$ override"
                              className="w-full max-w-[92px] border border-slate-300 rounded px-2 py-1 text-right"
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
                      <td className="px-3 py-3 align-top text-slate-700">
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
                      <td className="px-3 py-3 align-top">
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
                            value={displayStatus}
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
                            <option value="processing">Processing</option>
                          </select>
                        )}
                      </td>
                      <td className="px-3 py-3 align-top">
                        <div className="flex flex-col gap-2">
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
                            <div className="flex items-center gap-2 flex-wrap">
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
                          {!isVoided && (
                            <div className="flex gap-2 flex-wrap">
                              <button
                                onClick={() => handleMarkOwnerBillPaid(bill.id)}
                                disabled={ownerBillsLoading}
                                className="text-xs px-2 py-1 rounded bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
                              >
                                Paid
                              </button>
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
                            </div>
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

    </div>
  );
}
