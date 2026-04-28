// app/admin/documents/page.tsx
"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { DOCUMENT_TYPES, getDefaultDocumentScope, getDocumentScopeLabel, isTenantSensitiveDocumentType } from "@/lib/document-scope";

type Property = {
  id: string;
  name?: string | null;
  address?: string | null;
};

type LeaseAgreementOption = {
  id: string;
  leaseStartDate: string;
  leaseEndDate: string;
  monthlyRent: number;
  status: string;
  tenantNames: string[];
};

type DocumentVisibility = "admin" | "owner" | "tenant" | "all";

type DocumentRecord = {
  id: string;
  property_id: string | null;
  lease_agreement_id?: string | null;
  document_type?: string | null;
  title: string;
  file_url: string;
  name: string;
  visibility: DocumentVisibility;
  created_at: string;
  lease_agreements?: {
    lease_start_date?: string | null;
    lease_end_date?: string | null;
  } | null;
};

type DocumentEditDraft = {
  property_id: string;
  title: string;
  document_type: string;
  visibility: DocumentVisibility;
  scope: "property" | "lease";
  lease_agreement_id: string;
};

const getVisibilityLabel = (visibility: DocumentVisibility) => {
  switch (visibility) {
    case "admin":
      return "Admin only";
    case "owner":
      return "Owner only";
    case "tenant":
      return "Tenant only";
    case "all":
      return "Owner & Tenant";
    default:
      return visibility;
  }
};

const requiresLeaseForTenantVisibility = (doc: Pick<DocumentRecord, "document_type" | "title" | "lease_agreement_id">) =>
  isTenantSensitiveDocumentType(doc.document_type || doc.title || "Other") && !doc.lease_agreement_id;

const isTenantVisibleVisibility = (visibility: DocumentVisibility) =>
  visibility === "tenant" || visibility === "all";

export default function AdminDocumentsPage() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [leaseOptionsByProperty, setLeaseOptionsByProperty] = useState<Record<string, LeaseAgreementOption[]>>({});
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>("");
  const [selectedLeaseAgreementId, setSelectedLeaseAgreementId] = useState<string>("");
  const [documentType, setDocumentType] = useState<string>("Lease Agreement");
  const [selectedScope, setSelectedScope] = useState<"property" | "lease">(getDefaultDocumentScope("Lease Agreement"));
  const [customTitle, setCustomTitle] = useState("");
  const [visibilitySelection, setVisibilitySelection] = useState({
    owner: true,
    tenant: true,
  });
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filterPropertyId, setFilterPropertyId] = useState<string>("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [visibilityDrafts, setVisibilityDrafts] = useState<Record<string, DocumentVisibility>>({});
  const [savingVisibilityId, setSavingVisibilityId] = useState<string | null>(null);
  const [editingDocumentId, setEditingDocumentId] = useState<string | null>(null);
  const [editDrafts, setEditDrafts] = useState<Record<string, DocumentEditDraft>>({});
  const [savingDocumentId, setSavingDocumentId] = useState<string | null>(null);

  const ensureLeaseOptionsLoaded = async (propertyId: string) => {
    if (!propertyId || leaseOptionsByProperty[propertyId]) return;

    const res = await fetch(`/api/admin/lease-agreements?propertyId=${encodeURIComponent(propertyId)}`);
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || "Failed to load lease agreements");
    }

    setLeaseOptionsByProperty((prev) => ({
      ...prev,
      [propertyId]: data.agreements || [],
    }));
  };

  useEffect(() => {
    const fetchProperties = async () => {
      try {
        const res = await fetch("/api/properties");
        if (!res.ok) throw new Error("Failed to load properties");
        const data = await res.json();
        setProperties(data);
      } catch (err) {
        console.error(err);
        setError("Could not load properties.");
      }
    };

    fetchProperties();
  }, []);

  useEffect(() => {
    const loadLeaseOptions = async () => {
      if (!selectedPropertyId || selectedScope !== "lease") {
        setSelectedLeaseAgreementId("");
        return;
      }

      try {
        await ensureLeaseOptionsLoaded(selectedPropertyId);
      } catch (err) {
        console.error(err);
        setError("Could not load lease agreements.");
      }
    };

    loadLeaseOptions();
  }, [selectedPropertyId, documentType, selectedScope]);

  const loadDocuments = async () => {
    try {
      setLoadingDocs(true);
      setError(null);

      const res = await fetch("/api/admin/documents");
      if (!res.ok) throw new Error("Failed to load documents");
      const data = await res.json();
      setDocuments(data);
      setVisibilityDrafts(Object.fromEntries((data || []).map((doc: DocumentRecord) => [doc.id, doc.visibility])));
    } catch (err) {
      console.error(err);
      setError("Could not load documents.");
    } finally {
      setLoadingDocs(false);
    }
  };

  useEffect(() => {
    loadDocuments();
  }, []);

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!file) {
      setError("Please choose a file to upload.");
      return;
    }

    if (!selectedPropertyId) {
      setError("Please select a property.");
      return;
    }

    if (selectedScope === "lease" && !selectedLeaseAgreementId) {
      setError("Please select a lease agreement for a lease-specific document.");
      return;
    }

    const visibilityValue = (() => {
      const hasOwner = visibilitySelection.owner;
      const hasTenant = visibilitySelection.tenant;

      if (hasOwner && hasTenant) return "all";
      if (hasOwner && !hasTenant) return "owner";
      if (!hasOwner && hasTenant) return "tenant";
      return "admin";
    })() as DocumentVisibility;

    const finalTitle = documentType === "Other" ? customTitle.trim() : documentType;
    if (documentType === "Other" && !finalTitle) {
      setError("Please enter a custom document name.");
      return;
    }

    if (selectedScope === "property" && isTenantSensitiveDocumentType(documentType) && isTenantVisibleVisibility(visibilityValue)) {
      setError("Tenant-visible lease-related documents must be assigned to a lease.");
      return;
    }

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("title", finalTitle || file.name);
      formData.append("property_id", selectedPropertyId);
      formData.append("document_type", documentType);
      formData.append("visibility", visibilityValue);
      if (selectedScope === "lease" && selectedLeaseAgreementId) {
        formData.append("lease_agreement_id", selectedLeaseAgreementId);
      }

      const res = await fetch("/api/documents", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: "Upload failed" }));
        setError(errorData.error || "Upload failed");
        throw new Error(errorData.error || "Upload failed");
      }

      setDocumentType("Lease Agreement");
      setSelectedScope(getDefaultDocumentScope("Lease Agreement"));
      setCustomTitle("");
      setFile(null);
      setSelectedPropertyId("");
      setSelectedLeaseAgreementId("");
      setVisibilitySelection({ owner: true, tenant: true });
      const fileInput = document.getElementById("file-input") as HTMLInputElement | null;
      if (fileInput) fileInput.value = "";

      await loadDocuments();
    } catch (err) {
      console.error(err);
      setError("Upload failed. Check console for details.");
    } finally {
      setIsUploading(false);
    }
  };

  const handleDelete = async (documentId: string) => {
    if (!confirm("Are you sure you want to delete this document? This action cannot be undone.")) {
      return;
    }

    try {
      setDeletingId(documentId);
      setError(null);

      const res = await fetch(`/api/documents?id=${documentId}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: "Delete failed" }));
        setError(errorData.error || "Failed to delete document");
        throw new Error(errorData.error || "Delete failed");
      }

      await loadDocuments();
    } catch (err) {
      console.error(err);
      setError("Failed to delete document. Check console for details.");
    } finally {
      setDeletingId(null);
    }
  };

  const handleVisibilityChange = (documentId: string, value: DocumentVisibility) => {
    setVisibilityDrafts((prev) => ({ ...prev, [documentId]: value }));
  };

  const handleUpdateVisibility = async (documentId: string) => {
    const documentRecord = documents.find((d) => d.id === documentId);
    const nextVisibility = visibilityDrafts[documentId] || documentRecord?.visibility;

    if (!documentRecord || !nextVisibility) {
      setError("Choose a visibility before saving.");
      return;
    }

    if (documentRecord.visibility === nextVisibility) {
      return;
    }

    if (
      requiresLeaseForTenantVisibility(documentRecord) &&
      (nextVisibility === "tenant" || nextVisibility === "all")
    ) {
      setError("This document must be assigned to a lease in Edit before it can be visible to tenants.");
      return;
    }

    try {
      setSavingVisibilityId(documentId);
      setError(null);

      const res = await fetch("/api/admin/documents", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: documentId,
          property_id: documentRecord.property_id,
          title: documentRecord.title,
          document_type: documentRecord.document_type || documentRecord.title || "Other",
          visibility: nextVisibility,
          scope: documentRecord.lease_agreement_id ? "lease" : "property",
          lease_agreement_id: documentRecord.lease_agreement_id || null,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: "Failed to update visibility" }));
        setError(errorData.error || "Failed to update visibility");
        throw new Error(errorData.error || "Failed to update visibility");
      }

      const updated = await res.json();
      setDocuments((prev) => prev.map((doc) => (doc.id === documentId ? { ...doc, ...updated } : doc)));
      setVisibilityDrafts((prev) => ({ ...prev, [documentId]: updated.visibility }));
    } catch (err: any) {
      console.error(err);
      setError(err?.message || "Failed to update visibility. Check console for details.");
    } finally {
      setSavingVisibilityId(null);
    }
  };

  const buildDocumentDraft = (doc: DocumentRecord): DocumentEditDraft => ({
    property_id: doc.property_id || "",
    title: doc.title || "",
    document_type: doc.document_type || doc.title || "Other",
    visibility: doc.visibility,
    scope: doc.lease_agreement_id ? "lease" : "property",
    lease_agreement_id: doc.lease_agreement_id || "",
  });

  const startEditing = async (doc: DocumentRecord) => {
    try {
      const draft = buildDocumentDraft(doc);
      setEditDrafts((prev) => ({ ...prev, [doc.id]: draft }));
      setEditingDocumentId(doc.id);
      await ensureLeaseOptionsLoaded(draft.property_id);
    } catch (err) {
      console.error(err);
      setError("Could not load lease options for editing.");
    }
  };

  const cancelEditing = (docId: string) => {
    setEditingDocumentId((current) => (current === docId ? null : current));
    setEditDrafts((prev) => {
      const next = { ...prev };
      delete next[docId];
      return next;
    });
  };

  const updateEditDraft = (docId: string, updates: Partial<DocumentEditDraft>) => {
    setEditDrafts((prev) => {
      const current = prev[docId];
      if (!current) return prev;
      return {
        ...prev,
        [docId]: {
          ...current,
          ...updates,
        },
      };
    });
  };

  const handleEditPropertyChange = async (docId: string, propertyId: string) => {
    const current = editDrafts[docId];
    if (!current) return;

    try {
      await ensureLeaseOptionsLoaded(propertyId);
      const leases = leaseOptionsByProperty[propertyId] || [];
      const currentLeaseStillValid = leases.some((lease) => lease.id === current.lease_agreement_id);
      updateEditDraft(docId, {
        property_id: propertyId,
        lease_agreement_id: currentLeaseStillValid ? current.lease_agreement_id : "",
      });
    } catch (err) {
      console.error(err);
      setError("Could not refresh lease options for the selected property.");
    }
  };

  const handleEditDocumentTypeChange = async (docId: string, value: string) => {
    const draft = editDrafts[docId];
    if (!draft) return;

    const defaultScope = getDefaultDocumentScope(value);
    const updates: Partial<DocumentEditDraft> = { document_type: value, scope: defaultScope };
    if (defaultScope === "lease") {
      await ensureLeaseOptionsLoaded(draft.property_id);
    } else {
      updates.lease_agreement_id = "";
    }

    updateEditDraft(docId, updates);
  };

  const handleEditScopeChange = async (docId: string, scope: "property" | "lease") => {
    const draft = editDrafts[docId];
    if (!draft) return;

    if (scope === "lease") {
      await ensureLeaseOptionsLoaded(draft.property_id);
      updateEditDraft(docId, { scope });
      return;
    }

    updateEditDraft(docId, {
      scope,
      lease_agreement_id: "",
    });
  };

  const handleSaveDocumentMetadata = async (docId: string) => {
    const draft = editDrafts[docId];
    if (!draft) return;

    if (!draft.property_id) {
      setError("Property is required.");
      return;
    }

    if (!draft.title.trim()) {
      setError("Document name is required.");
      return;
    }

    if (!draft.document_type.trim()) {
      setError("Document type is required.");
      return;
    }

    if (draft.scope === "lease" && !draft.lease_agreement_id) {
      setError("Lease-specific documents must have a lease.");
      return;
    }

    if (
      draft.scope === "property" &&
      isTenantSensitiveDocumentType(draft.document_type) &&
      isTenantVisibleVisibility(draft.visibility)
    ) {
      setError("Tenant-visible lease-related documents must be assigned to a lease.");
      return;
    }

    try {
      setSavingDocumentId(docId);
      setError(null);

      const res = await fetch("/api/admin/documents", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: docId,
          property_id: draft.property_id,
          title: draft.title.trim(),
          document_type: draft.document_type.trim(),
          visibility: draft.visibility,
          scope: draft.scope,
          lease_agreement_id: draft.scope === "lease" ? draft.lease_agreement_id : null,
        }),
      });

      const updated = await res.json().catch(() => null);
      if (!res.ok) {
        setError(updated?.error || "Failed to update document.");
        throw new Error(updated?.error || "Failed to update document.");
      }

      setDocuments((prev) => prev.map((doc) => (doc.id === docId ? updated : doc)));
      setVisibilityDrafts((prev) => ({ ...prev, [docId]: updated.visibility }));
      cancelEditing(docId);
    } catch (err) {
      console.error(err);
      setError("Failed to update document metadata. Check console for details.");
    } finally {
      setSavingDocumentId(null);
    }
  };

  const getPropertyLabel = (doc: DocumentRecord) => {
    const property = properties.find((prop) => prop.id === doc.property_id);
    if (!property) return "Unassigned";
    return property.name || property.address || "Property";
  };

  const getLeaseLabel = (doc: DocumentRecord) => {
    if (!doc.lease_agreement_id) return "-";
    const lease = doc.lease_agreements;
    if (!lease?.lease_start_date || !lease?.lease_end_date) return "Lease-specific";
    return `${lease.lease_start_date} to ${lease.lease_end_date}`;
  };

  const isVisibleToOwner = (visibility: DocumentVisibility) =>
    visibility === "owner" || visibility === "all";
  const isVisibleToTenant = (visibility: DocumentVisibility) =>
    visibility === "tenant" || visibility === "all";

  const filteredDocuments = useMemo(
    () => documents.filter((doc) => !filterPropertyId || doc.property_id === filterPropertyId),
    [documents, filterPropertyId]
  );

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Documents (Admin)</h1>
        <p className="mt-1 text-sm text-slate-500">
          Upload leases, insurance, HOA rules, and reports. Admins always see every document; use visibility to control owner/tenant access.
        </p>
      </div>

      <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Upload a document</h2>

        {error && (
          <div className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-600">
            {error}
          </div>
        )}

        <form onSubmit={handleUpload} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-slate-700">Property</label>
              <select
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                value={selectedPropertyId}
                onChange={(e) => setSelectedPropertyId(e.target.value)}
                required
              >
                <option value="">Select a property</option>
                {properties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name || p.address || `Property ${p.id}`}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-slate-700">Visibility (admins always see)</label>
              <div className="flex items-center gap-4">
                {["owner", "tenant"].map((role) => (
                  <label key={role} className="inline-flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-500"
                      checked={(visibilitySelection as Record<string, boolean>)[role]}
                      onChange={(e) =>
                        setVisibilitySelection((prev) => ({
                          ...prev,
                          [role]: e.target.checked,
                        }))
                      }
                    />
                    <span className="capitalize">{role}</span>
                  </label>
                ))}
              </div>
              <p className="text-xs text-slate-500">
                Select Owner and/or Tenant to share with them. Leave both unchecked for admin-only.
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-slate-700">Document Type</label>
            <select
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              value={documentType}
              onChange={(e) => {
                const nextType = e.target.value;
                const nextScope = getDefaultDocumentScope(nextType);
                setDocumentType(nextType);
                setSelectedScope(nextScope);
                if (nextScope !== "lease") {
                  setSelectedLeaseAgreementId("");
                }
              }}
              required
            >
              {DOCUMENT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-slate-700">Scope</label>
            <select
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
              value={selectedScope}
              onChange={async (e) => {
                const nextScope = e.target.value as "property" | "lease";
                setSelectedScope(nextScope);
                if (nextScope === "lease" && selectedPropertyId) {
                  try {
                    await ensureLeaseOptionsLoaded(selectedPropertyId);
                  } catch (err) {
                    console.error(err);
                    setError("Could not load lease agreements.");
                  }
                } else {
                  setSelectedLeaseAgreementId("");
                }
              }}
            >
              <option value="property">Property-wide</option>
              <option value="lease">Lease-specific</option>
            </select>
            <p className="text-xs text-slate-500">
              {isTenantSensitiveDocumentType(documentType)
                ? "Defaults to lease-specific for this document type, but you can override it when appropriate."
                : "Defaults to property-wide for this document type."}
            </p>
          </div>

          {selectedScope === "lease" && (
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-slate-700">Select Lease</label>
              <select
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                value={selectedLeaseAgreementId}
                onChange={(e) => setSelectedLeaseAgreementId(e.target.value)}
                required
              >
                <option value="">Select a lease agreement</option>
                {(leaseOptionsByProperty[selectedPropertyId] || []).map((lease) => (
                  <option key={lease.id} value={lease.id}>
                    {lease.leaseStartDate} to {lease.leaseEndDate} | {lease.tenantNames.join(", ") || "No tenants"} | ${lease.monthlyRent}
                  </option>
                ))}
              </select>
              <p className="text-xs text-slate-500">
                Lease-specific documents are scoped to a specific lease so future tenants do not inherit prior lease files.
              </p>
            </div>
          )}

          {documentType === "Other" && (
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-slate-700">Custom Document Name</label>
              <input
                type="text"
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                placeholder="Enter custom document name"
                value={customTitle}
                onChange={(e) => setCustomTitle(e.target.value)}
                required
              />
            </div>
          )}

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-slate-700">File (PDF, image, etc.)</label>
            <div className="flex items-center gap-3">
              <label
                htmlFor="file-input"
                className="inline-flex cursor-pointer items-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Choose File
              </label>
              <span className="text-sm text-slate-600">{file ? file.name : "No file selected"}</span>
              <input
                id="file-input"
                type="file"
                className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                required
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isUploading}
            className="inline-flex items-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {isUploading ? "Uploading..." : "Upload document"}
          </button>
        </form>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">All documents</h2>
          <div className="flex items-center gap-3">
            <select
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm"
              value={filterPropertyId}
              onChange={(e) => setFilterPropertyId(e.target.value)}
            >
              <option value="">All properties</option>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name || p.address || `Property ${p.id}`}
                </option>
              ))}
            </select>
            <button
              onClick={loadDocuments}
              className="rounded-full border border-slate-300 px-3 py-1 text-xs text-slate-600 hover:bg-slate-50"
            >
              Refresh
            </button>
          </div>
        </div>

        {loadingDocs ? (
          <p className="text-sm text-slate-500">Loading documents...</p>
        ) : documents.length === 0 ? (
          <p className="text-sm text-slate-500">
            No documents uploaded yet. Use the form above to add leases, insurance, HOA rules, or performance reports.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-500">
                  <th className="py-2 pr-4">Property</th>
                  <th className="py-2 pr-4">Name</th>
                  <th className="py-2 pr-4">Type</th>
                  <th className="py-2 pr-4">Scope</th>
                  <th className="py-2 pr-4">Lease</th>
                  <th className="py-2 pr-4">Visibility</th>
                  <th className="py-2 pr-4">Created</th>
                  <th className="py-2 pr-4">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredDocuments.map((doc) => {
                  const currentVisibility = visibilityDrafts[doc.id] ?? doc.visibility;
                  const ownerVisible = isVisibleToOwner(doc.visibility);
                  const tenantVisible = isVisibleToTenant(doc.visibility);
                  const tenantVisibilityBlocked = requiresLeaseForTenantVisibility(doc);
                  const draft = editDrafts[doc.id];
                  const leaseOptions = draft ? leaseOptionsByProperty[draft.property_id] || [] : [];

                  return (
                    <Fragment key={doc.id}>
                      <tr className="border-b border-slate-100 last:border-0">
                        <td className="py-2 pr-4 text-slate-700">{getPropertyLabel(doc)}</td>
                        <td className="py-2 pr-4 text-slate-800">{doc.title || "Untitled document"}</td>
                        <td className="py-2 pr-4 text-slate-700">{doc.document_type || doc.title || "Other"}</td>
                        <td className="py-2 pr-4 text-slate-700">{getDocumentScopeLabel(doc.lease_agreement_id)}</td>
                        <td className="py-2 pr-4 text-slate-700">{getLeaseLabel(doc)}</td>
                        <td className="py-2 pr-4 text-slate-700">
                          <div className="flex flex-col gap-2">
                            <div className="flex items-center gap-2">
                              <span
                                className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs ${
                                  ownerVisible
                                    ? "border-green-200 bg-green-100 text-green-700"
                                    : "border-slate-200 bg-slate-100 text-slate-500"
                                }`}
                              >
                                Owner
                              </span>
                              <span
                                className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs ${
                                  tenantVisible
                                    ? "border-green-200 bg-green-100 text-green-700"
                                    : "border-slate-200 bg-slate-100 text-slate-500"
                                }`}
                              >
                                Tenant
                              </span>
                              {doc.visibility === "admin" && (
                                <span className="inline-flex items-center gap-1 rounded-full border border-slate-800 bg-slate-900 px-2 py-1 text-xs text-white">
                                  Admin only
                                </span>
                              )}
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              <select
                                className="rounded border border-slate-300 bg-white px-2 py-1 text-xs"
                                value={currentVisibility}
                                onChange={(e) => handleVisibilityChange(doc.id, e.target.value as DocumentVisibility)}
                              >
                                <option value="admin">Admin only (hidden from owner/tenant)</option>
                                <option value="owner">Owner only</option>
                                <option value="tenant" disabled={tenantVisibilityBlocked}>Tenant only</option>
                                <option value="all" disabled={tenantVisibilityBlocked}>Owner & Tenant</option>
                              </select>
                              <button
                                onClick={() => handleUpdateVisibility(doc.id)}
                                disabled={savingVisibilityId === doc.id || currentVisibility === doc.visibility}
                                className="rounded-full bg-slate-900 px-3 py-1 text-xs text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {savingVisibilityId === doc.id ? "Saving..." : "Update"}
                              </button>
                            </div>
                            {tenantVisibilityBlocked ? (
                              <p className="text-xs text-amber-700">
                                Lease-specific assignment required before tenant visibility. Use `Edit` to select the lease.
                              </p>
                            ) : null}
                          </div>
                        </td>
                        <td className="py-2 pr-4 text-slate-500">{new Date(doc.created_at).toLocaleDateString()}</td>
                        <td className="py-2 pr-4">
                          <div className="flex items-center gap-2">
                            <a
                              href={doc.file_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="rounded-full bg-slate-900 px-3 py-1 text-xs text-white hover:bg-slate-800"
                            >
                              View
                            </a>
                            <button
                              onClick={() => startEditing(doc)}
                              className="rounded-full border border-slate-300 px-3 py-1 text-xs text-slate-700 hover:bg-slate-50"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => handleDelete(doc.id)}
                              disabled={deletingId === doc.id}
                              className="rounded-full bg-red-600 px-3 py-1 text-xs text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {deletingId === doc.id ? "Deleting..." : "Delete"}
                            </button>
                          </div>
                        </td>
                      </tr>
                      {editingDocumentId === doc.id && draft ? (
                        <tr className="border-b border-slate-100 bg-slate-50">
                          <td colSpan={8} className="px-4 py-4">
                            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                              <div className="flex flex-col gap-1">
                                <label className="text-xs font-medium uppercase tracking-wide text-slate-500">
                                  Document Name
                                </label>
                                <input
                                  type="text"
                                  value={draft.title}
                                  onChange={(e) => updateEditDraft(doc.id, { title: e.target.value })}
                                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                                />
                              </div>

                              <div className="flex flex-col gap-1">
                                <label className="text-xs font-medium uppercase tracking-wide text-slate-500">
                                  Document Type
                                </label>
                                <select
                                  value={draft.document_type}
                                  onChange={(e) => handleEditDocumentTypeChange(doc.id, e.target.value)}
                                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                                >
                                  {DOCUMENT_TYPES.map((type) => (
                                    <option key={type} value={type}>
                                      {type}
                                    </option>
                                  ))}
                                </select>
                                {isTenantSensitiveDocumentType(draft.document_type) ? (
                                  <p className="text-xs text-amber-700">
                                    Lease-related documents default to lease-specific. Keep them property-wide only when you intentionally do not want tenant lease scoping.
                                  </p>
                                ) : null}
                              </div>

                              <div className="flex flex-col gap-1">
                                <label className="text-xs font-medium uppercase tracking-wide text-slate-500">
                                  Property
                                </label>
                                <select
                                  value={draft.property_id}
                                  onChange={(e) => handleEditPropertyChange(doc.id, e.target.value)}
                                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                                >
                                  <option value="">Select a property</option>
                                  {properties.map((p) => (
                                    <option key={p.id} value={p.id}>
                                      {p.name || p.address || `Property ${p.id}`}
                                    </option>
                                  ))}
                                </select>
                              </div>

                              <div className="flex flex-col gap-1">
                                <label className="text-xs font-medium uppercase tracking-wide text-slate-500">
                                  Scope
                                </label>
                                <select
                                  value={draft.scope}
                                  onChange={(e) => handleEditScopeChange(doc.id, e.target.value as "property" | "lease")}
                                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                                >
                                  <option value="property">Property-wide</option>
                                  <option value="lease">Lease-specific</option>
                                </select>
                              </div>

                              <div className="flex flex-col gap-1">
                                <label className="text-xs font-medium uppercase tracking-wide text-slate-500">
                                  Lease
                                </label>
                                <select
                                  value={draft.lease_agreement_id}
                                  onChange={(e) => updateEditDraft(doc.id, { lease_agreement_id: e.target.value })}
                                  disabled={draft.scope !== "lease"}
                                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm disabled:bg-slate-100 disabled:text-slate-400"
                                >
                                  <option value="">
                                    {draft.scope === "lease" ? "Select a lease agreement" : "Property-wide document"}
                                  </option>
                                  {leaseOptions.map((lease) => (
                                    <option key={lease.id} value={lease.id}>
                                      {lease.leaseStartDate} to {lease.leaseEndDate} | {lease.tenantNames.join(", ") || "No tenants"} | ${lease.monthlyRent}
                                    </option>
                                  ))}
                                </select>
                              </div>

                              <div className="flex flex-col gap-1">
                                <label className="text-xs font-medium uppercase tracking-wide text-slate-500">
                                  Visibility
                                </label>
                                <select
                                  value={draft.visibility}
                                  onChange={(e) => updateEditDraft(doc.id, { visibility: e.target.value as DocumentVisibility })}
                                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                                >
                                  <option value="admin">Admin only</option>
                                  <option value="owner">Owner only</option>
                                  <option value="tenant">Tenant only</option>
                                  <option value="all">Owner & Tenant</option>
                                </select>
                                <p className="text-xs text-slate-500">Current: {getVisibilityLabel(draft.visibility)}</p>
                              </div>
                            </div>

                            <div className="mt-4 flex items-center justify-end gap-2">
                              <button
                                onClick={() => cancelEditing(doc.id)}
                                className="rounded-full border border-slate-300 px-4 py-2 text-xs font-medium text-slate-700 hover:bg-white"
                              >
                                Cancel
                              </button>
                              <button
                                onClick={() => handleSaveDocumentMetadata(doc.id)}
                                disabled={savingDocumentId === doc.id}
                                className="rounded-full bg-slate-900 px-4 py-2 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-60"
                              >
                                {savingDocumentId === doc.id ? "Saving..." : "Save changes"}
                              </button>
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
