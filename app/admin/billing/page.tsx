"use client";

import React, { useMemo, useEffect, useState } from "react";
import { formatDateOnly, parseDateOnly } from "@/lib/date-only";
import { getStatusBadgeClass } from "@/app/admin/billing/utils";
import { getShortPropertyName } from "@/lib/property-short-name";
import { buildLeaseBillDrafts, buildLeaseBillIdentityKey } from "@/lib/billing/lease-bill-generation";

type TenantOption = {
  userId: string;
  email: string;
  propertyId: string;
  propertyAddress: string;
};

type LeaseAgreementOption = {
  id: string;
  leaseStartDate: string;
  leaseEndDate: string;
  monthlyRent: number;
  status: string;
  tenantIds: string[];
  tenantNames: string[];
};

type TenantBillRow = {
  id: string;
  tenantId: string | null;
  tenantEmail: string;
  tenantName?: string;
  propertyId: string;
  propertyAddress: string;
  leaseAgreementId?: string | null;
  leaseStartDate?: string | null;
  leaseEndDate?: string | null;
  leaseTenantNames?: string[];
  leaseTenantEmails?: string[];
  billScope: "tenant" | "lease";
  bill_type: string;
  description: string | null;
  amount: number;
  due_date: string;
  status: string;
  month: number;
  year: number;
  invoiceUrl?: string | null;
  paymentLinkUrl?: string | null;
  stripeSessionId?: string | null;
  stripePaymentIntentId?: string | null;
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

const getCompactUserLabel = (email?: string | null, fallback = "Tenant") => {
  const normalized = String(email || "").trim();
  if (!normalized) return fallback;
  const localPart = normalized.split("@")[0]?.trim();
  return localPart || fallback;
};

const getLeaseTenantLabel = (names?: string[], emails?: string[]) => {
  if (names && names.length > 0) return names.join(", ");
  if (emails && emails.length > 0) return emails.map((email) => getCompactUserLabel(email)).join(", ");
  return "Lease tenants";
};

export default function AdminBilling() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [properties, setProperties] = useState<{ id: string; address: string }[]>([]);
  const [tenantOptions, setTenantOptions] = useState<TenantOption[]>([]);
  const [leaseOptionsByProperty, setLeaseOptionsByProperty] = useState<Record<string, LeaseAgreementOption[]>>({});
  const [tenantBillError, setTenantBillError] = useState<string | null>(null);
  const [tenantBillSuccess, setTenantBillSuccess] = useState<string | null>(null);
  const [tenantBills, setTenantBills] = useState<TenantBillRow[]>([]);
  const [tenantBillsLoading, setTenantBillsLoading] = useState(false);
  const [tenantBillsError, setTenantBillsError] = useState<string | null>(null);
  const [tenantBillsNotice, setTenantBillsNotice] = useState<string | null>(null);
  const [showVoidedTenantBills, setShowVoidedTenantBills] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; description: string } | null>(null);
  const [tenantBillPropertyFilter, setTenantBillPropertyFilter] = useState("");
  const [tenantBillStatusFilter, setTenantBillStatusFilter] = useState("");
  const [showPaidTenantBills, setShowPaidTenantBills] = useState(false);
  const [tenantBill, setTenantBill] = useState({
    billScope: "tenant" as "tenant" | "lease",
    propertyId: "",
    tenantId: "",
    leaseAgreementId: "",
    amount: "",
    dueDate: "",
    billType: "rent",
    description: "",
    notifyTenant: true,
  });
  const [leaseBillGenerator, setLeaseBillGenerator] = useState({
    propertyId: "",
    leaseAgreementId: "",
    securityDepositAmount: "",
  });
  const [leaseBillGenerationLoading, setLeaseBillGenerationLoading] = useState(false);
  const [leaseBillGenerationError, setLeaseBillGenerationError] = useState<string | null>(null);
  const [leaseBillGenerationSuccess, setLeaseBillGenerationSuccess] = useState<string | null>(null);
  const [tenantInvoiceFile, setTenantInvoiceFile] = useState<File | null>(null);
  const [tenantInvoiceUploading, setTenantInvoiceUploading] = useState<Record<string, boolean>>({});
  const [showDesktopSite, setShowDesktopSite] = useState(false);
  const [showGenerateLeaseBillsMobile, setShowGenerateLeaseBillsMobile] = useState(false);
  const [showCreateTenantBillMobile, setShowCreateTenantBillMobile] = useState(false);
  const [tenantEdits, setTenantEdits] = useState<Record<string, { billType?: string; amount?: string; dueDate?: string; status?: string; description?: string; tenantId?: string; propertyId?: string; billScope?: "tenant" | "lease"; leaseAgreementId?: string }>>({});

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

  const singleBillLeaseOptions = useMemo(
    () => leaseOptionsByProperty[tenantBill.propertyId] || [],
    [leaseOptionsByProperty, tenantBill.propertyId]
  );

  const generatorLeaseOptions = useMemo(
    () => leaseOptionsByProperty[leaseBillGenerator.propertyId] || [],
    [leaseOptionsByProperty, leaseBillGenerator.propertyId]
  );

  const selectedGeneratorLease = useMemo(
    () =>
      generatorLeaseOptions.find((lease) => lease.id === leaseBillGenerator.leaseAgreementId) || null,
    [generatorLeaseOptions, leaseBillGenerator.leaseAgreementId]
  );

  const leasePreviewDrafts = useMemo(() => {
    if (!selectedGeneratorLease) return [];
    return buildLeaseBillDrafts({
      leaseStartDate: selectedGeneratorLease.leaseStartDate,
      leaseEndDate: selectedGeneratorLease.leaseEndDate,
      monthlyRent: Number(selectedGeneratorLease.monthlyRent || 0),
      securityDepositAmount: parseFloat(leaseBillGenerator.securityDepositAmount || "0"),
    });
  }, [selectedGeneratorLease, leaseBillGenerator.securityDepositAmount]);

  const existingLeaseObligationKeys = useMemo(() => {
    if (!selectedGeneratorLease) return new Set<string>();
    const leaseTenantIds = new Set(selectedGeneratorLease.tenantIds || []);
    const keys = new Set<string>();
    tenantBills.forEach((bill) => {
      if (bill.propertyId !== leaseBillGenerator.propertyId) return;
      if (bill.status === "voided") return;
      if (bill.bill_type !== "rent" && bill.bill_type !== "security_deposit") return;
      if (bill.billScope === "lease" && bill.leaseAgreementId === selectedGeneratorLease.id) {
        keys.add(buildLeaseBillIdentityKey(bill.bill_type, bill.due_date));
        return;
      }
      if (bill.billScope === "tenant" && bill.tenantId && leaseTenantIds.has(bill.tenantId)) {
        keys.add(buildLeaseBillIdentityKey(bill.bill_type, bill.due_date));
      }
    });
    return keys;
  }, [selectedGeneratorLease, leaseBillGenerator.propertyId, tenantBills]);

  const leasePreviewRows = useMemo(
    () =>
      leasePreviewDrafts.map((draft) => ({
        ...draft,
        isDuplicate: existingLeaseObligationKeys.has(draft.key),
      })),
    [leasePreviewDrafts, existingLeaseObligationKeys]
  );

  // Show ALL bills (including paid) so admin can void/delete any bill
  // Apply property and status filters
  const displayedTenantBills = useMemo(() => {
    return tenantBills.filter((bill) => {
      // Voided filter
      if (!showVoidedTenantBills && bill.status === "voided") return false;
      // Property filter
      if (tenantBillPropertyFilter && bill.propertyId !== tenantBillPropertyFilter) return false;
      // Status filter
      if (tenantBillStatusFilter && getDisplayStatus(bill.status, bill.due_date) !== tenantBillStatusFilter) return false;
      return true;
    }).sort((a, b) => compareDueDateAsc({ dueDate: a.due_date, id: a.id }, { dueDate: b.due_date, id: b.id }));
  }, [tenantBills, showVoidedTenantBills, tenantBillPropertyFilter, tenantBillStatusFilter]);
  const paidTenantBills = useMemo(
    () => displayedTenantBills.filter((bill) => bill.status === "paid"),
    [displayedTenantBills]
  );
  const activeTenantBills = useMemo(
    () => displayedTenantBills.filter((bill) => bill.status !== "paid"),
    [displayedTenantBills]
  );
  const showPaidTenantBillsEffective = showPaidTenantBills || tenantBillStatusFilter === "paid";
  const visibleTenantBills = useMemo(
    () => (showPaidTenantBillsEffective ? [...activeTenantBills, ...paidTenantBills] : activeTenantBills),
    [showPaidTenantBillsEffective, activeTenantBills, paidTenantBills]
  );

  useEffect(() => {
    if (!tenantBill.propertyId) return;
    const stillValid = filteredTenants.some((t) => t.userId === tenantBill.tenantId);
    if (!stillValid && tenantBill.tenantId) {
      setTenantBill((prev) => ({ ...prev, tenantId: "" }));
    }
  }, [filteredTenants, tenantBill.propertyId, tenantBill.tenantId]);

  useEffect(() => {
    const loadSingleBillLeases = async () => {
      if (tenantBill.billScope !== "lease" || !tenantBill.propertyId) {
        return;
      }
      try {
        await ensureLeaseOptionsLoaded(tenantBill.propertyId);
      } catch (err: any) {
        setTenantBillError(err.message || "Failed to load lease agreements");
      }
    };
    loadSingleBillLeases();
  }, [tenantBill.billScope, tenantBill.propertyId]);

  useEffect(() => {
    if (tenantBill.billScope !== "lease" || !tenantBill.propertyId) return;
    const leaseOptions = leaseOptionsByProperty[tenantBill.propertyId] || [];
    if (!leaseOptions.some((lease) => lease.id === tenantBill.leaseAgreementId) && tenantBill.leaseAgreementId) {
      setTenantBill((prev) => ({ ...prev, leaseAgreementId: "" }));
    }
  }, [tenantBill.billScope, tenantBill.propertyId, tenantBill.leaseAgreementId, leaseOptionsByProperty]);

  useEffect(() => {
    const loadGeneratorLeases = async () => {
      if (!leaseBillGenerator.propertyId) return;
      try {
        await ensureLeaseOptionsLoaded(leaseBillGenerator.propertyId);
      } catch (err: any) {
        setLeaseBillGenerationError(err.message || "Failed to load lease agreements");
      }
    };
    loadGeneratorLeases();
  }, [leaseBillGenerator.propertyId]);

  const handleCreateTenantBill = async () => {
    if (!tenantBill.propertyId) {
      setTenantBillError("Select a property.");
      return;
    }
    if (tenantBill.billScope === "tenant" && !tenantBill.tenantId) {
      setTenantBillError("Select a tenant.");
      return;
    }
    if (tenantBill.billScope === "lease" && !tenantBill.leaseAgreementId) {
      setTenantBillError("Select a lease agreement.");
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
      setTenantBillsNotice(null);
      const res = await fetch("/api/admin/tenant-billing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          billScope: tenantBill.billScope,
          propertyId: tenantBill.propertyId,
          tenantId: tenantBill.tenantId,
          leaseAgreementId: tenantBill.leaseAgreementId,
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
        tenantId: prev.billScope === "tenant" ? prev.tenantId : "",
        leaseAgreementId: prev.billScope === "lease" ? prev.leaseAgreementId : "",
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
      setTenantBillsNotice(null);
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
      setTenantBillsNotice(null);
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
      setTenantBillsNotice(null);
      const res = await fetch(`/api/admin/tenant-billing?id=${billId}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to delete tenant bill");
      setConfirmDelete(null);
      await loadTenantBills(showVoidedTenantBills);
    } catch (err: any) {
      setTenantBillsError(err.message || "Failed to delete tenant bill");
    }
  };

  const handleGenerateLeaseBills = async () => {
    if (!leaseBillGenerator.propertyId || !leaseBillGenerator.leaseAgreementId) {
      setLeaseBillGenerationError("Select a property and lease agreement.");
      return;
    }
    try {
      setLeaseBillGenerationLoading(true);
      setLeaseBillGenerationError(null);
      setLeaseBillGenerationSuccess(null);
      const res = await fetch("/api/admin/tenant-billing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "generateLeaseBills",
          propertyId: leaseBillGenerator.propertyId,
          leaseAgreementId: leaseBillGenerator.leaseAgreementId,
          securityDepositAmount: leaseBillGenerator.securityDepositAmount || 0,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to generate lease bills");
      setLeaseBillGenerationSuccess(
        `${data.rentBillsCreated || 0} rent bill(s) created, ` +
          `${data.securityDepositCreated ? "security deposit created" : "security deposit skipped"}, ` +
          `${data.skipped || 0} duplicate/conflicting bill(s) skipped.`
      );
      await loadTenantBills(showVoidedTenantBills);
    } catch (err: any) {
      setLeaseBillGenerationError(err.message || "Failed to generate lease bills");
    } finally {
      setLeaseBillGenerationLoading(false);
    }
  };

  const ensureLeaseOptionsLoaded = async (propertyId: string) => {
    if (!propertyId || leaseOptionsByProperty[propertyId]) return;
    const res = await fetch(`/api/admin/lease-agreements?propertyId=${encodeURIComponent(propertyId)}`, {
      cache: "no-store",
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to load lease agreements");
    setLeaseOptionsByProperty((prev) => ({
      ...prev,
      [propertyId]: data.agreements || [],
    }));
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
    const billScope = edits.billScope ?? bill.billScope;
    const leaseAgreementId = edits.leaseAgreementId ?? bill.leaseAgreementId ?? "";
    try {
      setTenantBillsError(null);
      setTenantBillsNotice(null);
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
          billScope,
          leaseAgreementId,
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

  const handleBillEditPropertyChange = async (
    billId: string,
    propertyId: string,
    currentBillScope: "tenant" | "lease"
  ) => {
    try {
      await ensureLeaseOptionsLoaded(propertyId);
    } catch (err: any) {
      setTenantBillsError(err.message || "Failed to load lease agreements");
    }
    setTenantEdits((prev) => ({
      ...prev,
      [billId]: {
        ...prev[billId],
        propertyId,
        billScope: prev[billId]?.billScope ?? currentBillScope,
        tenantId: (prev[billId]?.billScope ?? currentBillScope) === "tenant" ? prev[billId]?.tenantId || "" : "",
        leaseAgreementId: "",
      },
    }));
  };

  const handleBillEditScopeChange = async (billId: string, billScope: "tenant" | "lease", propertyId: string) => {
    if (billScope === "lease" && propertyId) {
      try {
        await ensureLeaseOptionsLoaded(propertyId);
      } catch (err: any) {
        setTenantBillsError(err.message || "Failed to load lease agreements");
      }
    }
    setTenantEdits((prev) => ({
      ...prev,
      [billId]: {
        ...prev[billId],
        billScope,
        tenantId: billScope === "tenant" ? prev[billId]?.tenantId : "",
        leaseAgreementId: billScope === "lease" ? prev[billId]?.leaseAgreementId || "" : "",
      },
    }));
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
      <div className="md:hidden">
        <button
          type="button"
          onClick={() => setShowDesktopSite((prev) => !prev)}
          className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          {showDesktopSite ? "Back to Mobile View" : "View Desktop Site for More Options"}
        </button>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden mt-8">
        <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Generate Lease Bills</h2>
            <p className="text-xs text-slate-500">
              Create monthly rent bills and security deposit bill from lease agreement details.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowGenerateLeaseBillsMobile((prev) => !prev)}
            className="md:hidden inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-300 bg-white text-lg font-medium text-slate-700 hover:bg-slate-50"
            aria-label={showGenerateLeaseBillsMobile ? "Collapse generate lease bills" : "Expand generate lease bills"}
          >
            {showGenerateLeaseBillsMobile ? "−" : "+"}
          </button>
        </div>
        <div className={`${showGenerateLeaseBillsMobile ? "block" : "hidden"} md:block`}>
          <div className="px-4 py-4 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex flex-col text-sm">
              <label className="text-slate-600 mb-1">Property</label>
              <select
                className="border border-slate-300 rounded px-3 py-2 text-sm bg-white"
                value={leaseBillGenerator.propertyId}
                onChange={(e) =>
                  setLeaseBillGenerator((prev) => ({
                    ...prev,
                    propertyId: e.target.value,
                    leaseAgreementId: "",
                  }))
                }
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
              <label className="text-slate-600 mb-1">Lease Agreement</label>
              <select
                className="border border-slate-300 rounded px-3 py-2 text-sm bg-white"
                value={leaseBillGenerator.leaseAgreementId}
                onChange={(e) =>
                  setLeaseBillGenerator((prev) => ({ ...prev, leaseAgreementId: e.target.value }))
                }
                disabled={!leaseBillGenerator.propertyId}
              >
                <option value="">Select lease...</option>
                {generatorLeaseOptions.map((lease) => (
                  <option key={lease.id} value={lease.id}>
                    {formatDateOnly(lease.leaseStartDate)} - {formatDateOnly(lease.leaseEndDate)} | {lease.tenantNames.join(", ") || "No tenants"}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col text-sm">
              <label className="text-slate-600 mb-1">Lease Start</label>
              <input
                type="text"
                readOnly
                className="border border-slate-200 rounded px-3 py-2 text-sm bg-slate-50 text-slate-700"
                value={selectedGeneratorLease ? formatDateOnly(selectedGeneratorLease.leaseStartDate) || "" : ""}
              />
            </div>
            <div className="flex flex-col text-sm">
              <label className="text-slate-600 mb-1">Lease End</label>
              <input
                type="text"
                readOnly
                className="border border-slate-200 rounded px-3 py-2 text-sm bg-slate-50 text-slate-700"
                value={selectedGeneratorLease ? formatDateOnly(selectedGeneratorLease.leaseEndDate) || "" : ""}
              />
            </div>
            <div className="flex flex-col text-sm">
              <label className="text-slate-600 mb-1">Monthly Rent</label>
              <input
                type="text"
                readOnly
                className="border border-slate-200 rounded px-3 py-2 text-sm bg-slate-50 text-slate-700"
                value={selectedGeneratorLease ? `$${Number(selectedGeneratorLease.monthlyRent || 0).toFixed(2)}` : ""}
              />
            </div>
            <div className="flex flex-col text-sm">
              <label className="text-slate-600 mb-1">Security Deposit Amount</label>
              <input
                type="number"
                step="0.01"
                className="border border-slate-300 rounded px-3 py-2 text-sm bg-white"
                value={leaseBillGenerator.securityDepositAmount}
                onChange={(e) =>
                  setLeaseBillGenerator((prev) => ({ ...prev, securityDepositAmount: e.target.value }))
                }
                placeholder="Leave blank to skip deposit bill"
              />
            </div>
            <div className="md:col-span-2 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm">
              <div className="font-medium text-slate-900">Preview</div>
              {selectedGeneratorLease ? (
                <>
                  <div className="mt-2 text-slate-600">
                    Tenants: {selectedGeneratorLease.tenantNames.join(", ") || "No tenants linked"}
                  </div>
                  <div className="mt-2 text-slate-600">
                    {leasePreviewRows.filter((row) => row.billType === "rent").length} rent bill(s), total rent{" "}
                    ${leasePreviewRows
                      .filter((row) => row.billType === "rent")
                      .reduce((sum, row) => sum + row.amount, 0)
                      .toFixed(2)}
                    {parseFloat(leaseBillGenerator.securityDepositAmount || "0") > 0
                      ? `, security deposit $${parseFloat(leaseBillGenerator.securityDepositAmount || "0").toFixed(2)}`
                      : ", security deposit skipped"}
                  </div>
                  <div className="mt-3 space-y-2">
                    {leasePreviewRows.map((row) => (
                      <div key={row.key} className="flex flex-wrap items-center justify-between gap-2 rounded border border-slate-200 bg-white px-3 py-2 text-xs">
                        <div className="text-slate-700">
                          {row.description} - due {formatDateOnly(row.dueDate) || row.dueDate}
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="font-medium text-slate-900">${row.amount.toFixed(2)}</span>
                          <span className={row.isDuplicate ? "text-amber-700" : "text-emerald-700"}>
                            {row.isDuplicate ? "Skip existing/conflicting" : "Create"}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="mt-2 text-slate-500">Select a property and lease agreement to preview bills.</div>
              )}
            </div>
          </div>
          {leaseBillGenerationError && (
            <div className="px-4 pb-3 text-sm text-red-600">{leaseBillGenerationError}</div>
          )}
          {leaseBillGenerationSuccess && (
            <div className="px-4 pb-3 text-sm text-emerald-700">{leaseBillGenerationSuccess}</div>
          )}
          <div className="px-4 pb-4">
            <button
              onClick={handleGenerateLeaseBills}
              disabled={leaseBillGenerationLoading || !selectedGeneratorLease}
              className="h-10 px-4 rounded bg-slate-900 text-white text-sm hover:bg-slate-800 disabled:opacity-60"
            >
              {leaseBillGenerationLoading ? "Generating..." : "Generate bills"}
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden mt-8">
        <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Create Tenant Bill</h2>
            <p className="text-xs text-slate-500">
              Manually create charges that appear in the tenant Payments tab.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowCreateTenantBillMobile((prev) => !prev)}
            className="md:hidden inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-300 bg-white text-lg font-medium text-slate-700 hover:bg-slate-50"
            aria-label={showCreateTenantBillMobile ? "Collapse create tenant bill" : "Expand create tenant bill"}
          >
            {showCreateTenantBillMobile ? "−" : "+"}
          </button>
        </div>
        <div className={`${showCreateTenantBillMobile ? "block" : "hidden"} md:block`}>
        <div className="px-4 py-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex flex-col text-sm">
            <label className="text-slate-600 mb-1">Bill Scope</label>
            <select
              className="border border-slate-300 rounded px-3 py-2 text-sm bg-white"
              value={tenantBill.billScope}
              onChange={(e) =>
                setTenantBill((prev) => ({
                  ...prev,
                  billScope: e.target.value as "tenant" | "lease",
                  tenantId: e.target.value === "tenant" ? prev.tenantId : "",
                  leaseAgreementId: e.target.value === "lease" ? prev.leaseAgreementId : "",
                  notifyTenant: e.target.value === "tenant" ? prev.notifyTenant : false,
                }))
              }
            >
              <option value="tenant">Tenant-specific bill</option>
              <option value="lease">Lease-level bill</option>
            </select>
          </div>
          <div className="flex flex-col text-sm">
            <label className="text-slate-600 mb-1">Property</label>
            <select
              className="border border-slate-300 rounded px-3 py-2 text-sm bg-white"
              value={tenantBill.propertyId}
              onChange={(e) =>
                setTenantBill((prev) => ({
                  ...prev,
                  propertyId: e.target.value,
                  tenantId: prev.billScope === "tenant" ? prev.tenantId : "",
                  leaseAgreementId: "",
                }))
              }
            >
              <option value="">Select property...</option>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {getShortPropertyName(p.address)}
                </option>
              ))}
              </select>
            </div>
          {tenantBill.billScope === "tenant" ? (
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
          ) : (
            <div className="flex flex-col text-sm">
              <label className="text-slate-600 mb-1">Lease Agreement</label>
              <select
                className="border border-slate-300 rounded px-3 py-2 text-sm bg-white"
                value={tenantBill.leaseAgreementId}
                onChange={(e) =>
                  setTenantBill((prev) => ({ ...prev, leaseAgreementId: e.target.value }))
                }
                disabled={!tenantBill.propertyId}
              >
                <option value="">Select lease...</option>
                {singleBillLeaseOptions.map((lease) => (
                  <option key={lease.id} value={lease.id}>
                    {formatDateOnly(lease.leaseStartDate)} - {formatDateOnly(lease.leaseEndDate)} | {lease.tenantNames.join(", ") || "No tenants"}
                  </option>
                ))}
              </select>
            </div>
          )}
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
          {tenantBill.billScope === "tenant" ? (
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
          ) : (
            <div className="text-xs text-slate-500 md:col-span-2">
              Lease-level bills are shared across lease tenants. No email notifications are sent from this flow.
            </div>
          )}
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
            <button
              type="button"
              onClick={() => setShowPaidTenantBills((prev) => !prev)}
              className="text-xs px-3 py-1 rounded border border-slate-300 text-slate-700 hover:bg-slate-50"
            >
              {showPaidTenantBillsEffective
                ? `Hide paid (${paidTenantBills.length})`
                : `Show paid (${paidTenantBills.length})`}
            </button>
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
                {getShortPropertyName(p.address)}
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
            <option value="processing">Processing</option>
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
        {tenantBillsNotice && (
          <div className="px-4 py-3 text-sm text-slate-700">{tenantBillsNotice}</div>
        )}
        <div className={showDesktopSite ? "hidden" : "md:hidden"}>
          {visibleTenantBills.length === 0 ? (
            <div className="px-4 py-4 text-sm text-slate-500">No tenant bills found.</div>
          ) : (
            <div className="divide-y divide-slate-100">
              {visibleTenantBills.map((bill) => {
                const isVoided = bill.status === "voided";
                const currentBillScope = tenantEdits[bill.id]?.billScope ?? bill.billScope;
                return (
                  <div key={bill.id} className={`px-4 py-4 ${isVoided ? "bg-gray-50 opacity-70" : "bg-white"}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-slate-900" title={bill.propertyAddress || bill.propertyId}>
                          {getShortPropertyName(bill.propertyAddress) || bill.propertyId}
                        </div>
                        <div className="text-xs text-slate-500" title={currentBillScope === "lease" ? getLeaseTenantLabel(bill.leaseTenantNames, bill.leaseTenantEmails) : bill.tenantEmail || "Tenant"}>
                          {currentBillScope === "lease"
                            ? `Lease bill - ${getLeaseTenantLabel(bill.leaseTenantNames, bill.leaseTenantEmails)}`
                            : getCompactUserLabel(bill.tenantEmail)}
                        </div>
                      </div>
                      <div className="text-sm font-semibold text-slate-900">${Number(bill.amount || 0).toFixed(2)}</div>
                    </div>
                    <div className="mt-2 text-sm text-slate-700 whitespace-normal break-words">
                      {bill.description || TENANT_BILL_TYPES.find((t) => t.value === bill.bill_type)?.label || "Bill"}
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-3 text-xs">
                      <div className="text-slate-600">Due {formatDateOnly(bill.due_date) || "-"}</div>
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 font-medium ${getStatusBadgeClass(getDisplayStatus(bill.status, bill.due_date))}`}>
                        {getStatusLabel(bill.status, bill.due_date)}
                      </span>
                    </div>
                    {!isVoided && bill.status !== "paid" && (
                      <div className="mt-3">
                        <button
                          type="button"
                          onClick={() => handleMarkTenantBillPaid(bill.id)}
                          className="w-full rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700"
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
                <th className="px-3 py-3 text-left whitespace-normal w-[13%]">Tenant</th>
                <th className="px-3 py-3 text-left whitespace-normal w-[12%]">Property</th>
                <th className="px-3 py-3 text-left whitespace-normal w-[14%]">Due</th>
                <th className="px-3 py-3 text-left whitespace-normal w-[21%]">Bill</th>
                <th className="px-3 py-3 text-right whitespace-normal w-[10%]">Amount</th>
                <th className="px-3 py-3 text-left whitespace-normal w-[11%]">Status</th>
                <th className="px-3 py-3 text-left whitespace-normal w-[19%]">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visibleTenantBills.length === 0 ? (
                <tr>
                  <td className="px-3 py-4 text-slate-500" colSpan={7}>
                    No tenant bills found.
                  </td>
                </tr>
              ) : (
                visibleTenantBills.map((bill) => {
                  const isVoided = bill.status === "voided";
                  const displayStatus = tenantEdits[bill.id]?.status ?? getDisplayStatus(bill.status, bill.due_date);
                  const currentBillScope = tenantEdits[bill.id]?.billScope ?? bill.billScope;
                  const currentPropertyId = tenantEdits[bill.id]?.propertyId ?? bill.propertyId;
                  const currentLeaseAgreementId = tenantEdits[bill.id]?.leaseAgreementId ?? bill.leaseAgreementId ?? "";
                  const rowLeaseOptions = leaseOptionsByProperty[currentPropertyId] || [];
                  return (
                    <tr key={bill.id} className={`hover:bg-slate-50 ${isVoided ? "bg-gray-50 opacity-60" : ""}`}>
                      <td className="px-3 py-3 align-top text-slate-900 break-words">
                        {isVoided ? (
                          <div className="space-y-1">
                            <div className="text-[10px] uppercase tracking-wide text-slate-500">
                              {bill.billScope === "lease" ? "Lease-level" : "Tenant-specific"}
                            </div>
                            <span title={bill.billScope === "lease" ? getLeaseTenantLabel(bill.leaseTenantNames, bill.leaseTenantEmails) : bill.tenantEmail || "Tenant"}>
                              {bill.billScope === "lease"
                                ? getLeaseTenantLabel(bill.leaseTenantNames, bill.leaseTenantEmails)
                                : getCompactUserLabel(bill.tenantEmail)}
                            </span>
                          </div>
                        ) : (
                          <div className="flex flex-col gap-1">
                            <select
                              className="border border-slate-300 rounded px-2 py-1 text-xs bg-white w-full"
                              value={currentBillScope}
                              onChange={(e) =>
                                handleBillEditScopeChange(
                                  bill.id,
                                  e.target.value as "tenant" | "lease",
                                  currentPropertyId
                                )
                              }
                            >
                              <option value="tenant">Tenant-specific</option>
                              <option value="lease">Lease-level</option>
                            </select>
                            {currentBillScope === "tenant" ? (
                              <select
                                className="border border-slate-300 rounded px-2 py-1 text-xs bg-white w-full"
                                value={tenantEdits[bill.id]?.tenantId ?? bill.tenantId ?? ""}
                                onChange={(e) =>
                                  setTenantEdits((prev) => ({
                                    ...prev,
                                    [bill.id]: { ...prev[bill.id], tenantId: e.target.value },
                                  }))
                                }
                              >
                                <option value="">Select tenant</option>
                                {tenantOptions
                                  .filter((t) => t.propertyId === currentPropertyId)
                                  .map((t) => (
                                    <option key={`${t.userId}-${t.propertyId}`} value={t.userId} title={t.email || "Tenant"}>
                                      {getCompactUserLabel(t.email)}
                                    </option>
                                  ))}
                              </select>
                            ) : (
                              <select
                                className="border border-slate-300 rounded px-2 py-1 text-xs bg-white w-full"
                                value={currentLeaseAgreementId}
                                onFocus={() => ensureLeaseOptionsLoaded(currentPropertyId).catch(() => undefined)}
                                onChange={(e) =>
                                  setTenantEdits((prev) => ({
                                    ...prev,
                                    [bill.id]: { ...prev[bill.id], leaseAgreementId: e.target.value },
                                  }))
                                }
                              >
                                <option value="">Select lease</option>
                                {rowLeaseOptions.map((lease) => (
                                  <option key={lease.id} value={lease.id}>
                                    {formatDateOnly(lease.leaseStartDate)} - {formatDateOnly(lease.leaseEndDate)}
                                  </option>
                                ))}
                              </select>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-3 align-top text-slate-700 break-words">
                        {isVoided ? (
                          <span title={bill.propertyAddress || bill.propertyId}>
                            {getShortPropertyName(bill.propertyAddress) || bill.propertyId}
                          </span>
                        ) : (
                          <select
                            className="border border-slate-300 rounded px-2 py-1 text-xs bg-white w-full"
                            value={currentPropertyId}
                            onChange={(e) => handleBillEditPropertyChange(bill.id, e.target.value, currentBillScope)}
                          >
                            {properties.map((p) => (
                              <option key={p.id} value={p.id}>
                                {getShortPropertyName(p.address)}
                              </option>
                            ))}
                          </select>
                        )}
                      </td>
                      <td className="px-3 py-3 align-top text-slate-700">
                        {isVoided ? (
                          formatDateOnly(bill.due_date) || "-"
                        ) : (
                          <input
                            type="date"
                            className="border border-slate-300 rounded px-2 py-1 text-xs bg-white w-full min-w-[10rem]"
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
                      <td className="px-3 py-3 align-top text-slate-700">
                        {isVoided ? (
                          <div className="space-y-1">
                            <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                              {TENANT_BILL_TYPES.find((t) => t.value === bill.bill_type)?.label || bill.bill_type}
                            </div>
                            <div className="whitespace-normal break-words">{bill.description || "—"}</div>
                          </div>
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
                      <td className="px-3 py-3 align-top text-right text-slate-900">
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
                              setTenantEdits((prev) => ({
                                ...prev,
                                [bill.id]: { ...prev[bill.id], status: e.target.value },
                              }))
                            }
                          >
                            <option value="pending">Pending</option>
                            <option value="due">Due</option>
                            <option value="paid">Paid</option>
                            <option value="processing">Processing</option>
                            <option value="overdue">Overdue</option>
                            <option value="voided">Voided</option>
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
                          {!isVoided && (
                            <div className="flex gap-2 flex-wrap">
                              <button
                                onClick={() => handleMarkTenantBillPaid(bill.id)}
                                className="text-xs px-2 py-1 rounded bg-emerald-600 text-white hover:bg-emerald-700"
                              >
                                Paid
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
                            </div>
                          )}
                          <button
                            onClick={() =>
                              setConfirmDelete({
                                id: bill.id,
                                description: `${bill.billScope === "lease" ? getLeaseTenantLabel(bill.leaseTenantNames, bill.leaseTenantEmails) : bill.tenantEmail || "Tenant"} - ${bill.propertyAddress} - $${Number(bill.amount || 0).toFixed(2)}`,
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
    </div>
  );
}

