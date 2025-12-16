// app/admin/documents/page.tsx
"use client";

import { useEffect, useState } from "react";

type Property = {
  id: string;
  name?: string | null;
  address?: string | null;
};

type DocumentRecord = {
  id: string;
  property_id: string | null;
  title: string;
  file_url: string;
  name: string;
  visibility: "admin" | "owner" | "tenant" | "all";
  created_at: string;
};

const documentTypes = [
  "Lease Agreement",
  "HOA Rules",
  "Welcome Package",
  "Tenant Insurance Confirmation",
  "Other",
];

export default function AdminDocumentsPage() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>("");
  const [documentType, setDocumentType] = useState<string>("Lease Agreement");
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
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [visibilityDrafts, setVisibilityDrafts] = useState<Record<string, DocumentRecord["visibility"]>>({});
  const [savingVisibilityId, setSavingVisibilityId] = useState<string | null>(null);

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

  const loadDocuments = async () => {
    try {
      setLoadingDocs(true);
      setError(null);

      const res = await fetch("/api/admin/documents");
      if (!res.ok) throw new Error("Failed to load documents");
      const data = await res.json();
      setDocuments(data);
      setVisibilityDrafts(
        Object.fromEntries(
          (data || []).map((doc: DocumentRecord) => [doc.id, doc.visibility])
        )
      );
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

    const visibilityValue = (() => {
      const hasOwner = visibilitySelection.owner;
      const hasTenant = visibilitySelection.tenant;

      if (hasOwner && hasTenant) return "all";
      if (hasOwner && !hasTenant) return "owner";
      if (!hasOwner && hasTenant) return "tenant";
      return "admin"; // admin-only if neither audience selected
    })() as DocumentRecord["visibility"];

    const finalTitle = documentType === "Other" ? customTitle.trim() : documentType;
    if (documentType === "Other" && !finalTitle) {
      setError("Please enter a custom document name.");
      return;
    }

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("title", finalTitle || file.name);
      formData.append("property_id", selectedPropertyId);
      formData.append("visibility", visibilityValue);

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
      setCustomTitle("");
      setFile(null);
      setSelectedPropertyId("");
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

  const handleVisibilityChange = (
    documentId: string,
    value: DocumentRecord["visibility"]
  ) => {
    setVisibilityDrafts((prev) => ({ ...prev, [documentId]: value }));
  };

  const handleUpdateVisibility = async (documentId: string) => {
    const nextVisibility =
      visibilityDrafts[documentId] ||
      documents.find((d) => d.id === documentId)?.visibility;

    if (!nextVisibility) {
      setError("Choose a visibility before saving.");
      return;
    }

    const current = documents.find((d) => d.id === documentId)?.visibility;
    if (current === nextVisibility) {
      return;
    }

    try {
      setSavingVisibilityId(documentId);
      setError(null);

      const res = await fetch("/api/documents", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: documentId, visibility: nextVisibility }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: "Failed to update visibility" }));
        setError(errorData.error || "Failed to update visibility");
        throw new Error(errorData.error || "Failed to update visibility");
      }

      const updated = await res.json();
      setDocuments((prev) =>
        prev.map((doc) =>
          doc.id === documentId ? { ...doc, visibility: updated.visibility } : doc
        )
      );
      setVisibilityDrafts((prev) => ({ ...prev, [documentId]: updated.visibility }));
    } catch (err) {
      console.error(err);
      setError("Failed to update visibility. Check console for details.");
    } finally {
      setSavingVisibilityId(null);
    }
  };

  const getPropertyLabel = (doc: DocumentRecord) => {
    const p = properties.find((prop) => prop.id === doc.property_id);
    if (!p) return "Unassigned";
    return p.name || p.address || "Property";
  };

  const isVisibleToOwner = (visibility: DocumentRecord["visibility"]) =>
    visibility === "owner" || visibility === "all";
  const isVisibleToTenant = (visibility: DocumentRecord["visibility"]) =>
    visibility === "tenant" || visibility === "all";

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">
          Documents (Admin)
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Upload leases, insurance, HOA rules, and reports. Admins always see every document; use visibility to control owner/tenant access.
        </p>
      </div>

      <section className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 space-y-4">
        <h2 className="text-lg font-semibold text-slate-900">
          Upload a document
        </h2>

        {error && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
            {error}
          </div>
        )}

        <form onSubmit={handleUpload} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-slate-700">
                Property
              </label>
              <select
                className="border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white"
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
              <label className="text-sm font-medium text-slate-700">
                Visibility (admins always see)
              </label>
              <div className="flex items-center gap-4">
                {["owner", "tenant"].map((role) => (
                  <label
                    key={role}
                    className="inline-flex items-center gap-2 text-sm text-slate-700"
                  >
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-500"
                      checked={(visibilitySelection as any)[role]}
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
            <label className="text-sm font-medium text-slate-700">
              Document Type
            </label>
            <select
              className="border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white"
              value={documentType}
              onChange={(e) => setDocumentType(e.target.value)}
              required
            >
              {documentTypes.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>

          {documentType === "Other" && (
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-slate-700">
                Custom Document Name
              </label>
              <input
                type="text"
                className="border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white"
                placeholder="Enter custom document name"
                value={customTitle}
                onChange={(e) => setCustomTitle(e.target.value)}
                required
              />
            </div>
          )}

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-slate-700">
              File (PDF, image, etc.)
            </label>
            <div className="flex items-center gap-3">
              <label
                htmlFor="file-input"
                className="inline-flex items-center px-4 py-2 rounded-lg text-sm font-medium bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                Choose File
              </label>
              <span className="text-sm text-slate-600">
                {file ? file.name : "No file selected"}
              </span>
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
            className="inline-flex items-center px-4 py-2 rounded-lg text-sm font-medium bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {isUploading ? "Uploading..." : "Upload document"}
          </button>
        </form>
      </section>

      <section className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-900">
            All documents
          </h2>
          <button
            onClick={loadDocuments}
            className="text-xs px-3 py-1 rounded-full border border-slate-300 text-slate-600 hover:bg-slate-50"
          >
            Refresh
          </button>
        </div>

        {loadingDocs ? (
          <p className="text-sm text-slate-500">Loading documents...</p>
        ) : documents.length === 0 ? (
          <p className="text-sm text-slate-500">
            No documents uploaded yet. Use the form above to add leases,
            insurance, HOA rules, or performance reports.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left border-b border-slate-200 text-slate-500">
                  <th className="py-2 pr-4">Property</th>
                  <th className="py-2 pr-4">Name</th>
                  <th className="py-2 pr-4">Visibility</th>
                  <th className="py-2 pr-4">Created</th>
                  <th className="py-2 pr-4">Actions</th>
                </tr>
              </thead>
              <tbody>
                {documents.map((doc) => {
                  const currentVisibility = visibilityDrafts[doc.id] ?? doc.visibility;
                  const ownerVisible = isVisibleToOwner(doc.visibility);
                  const tenantVisible = isVisibleToTenant(doc.visibility);

                  return (
                    <tr
                      key={doc.id}
                      className="border-b border-slate-100 last:border-0"
                    >
                      <td className="py-2 pr-4 text-slate-700">
                        {getPropertyLabel(doc)}
                      </td>
                      <td className="py-2 pr-4 text-slate-800">
                        {doc.title || "Untitled document"}
                      </td>
                      <td className="py-2 pr-4 text-slate-700">
                        <div className="flex flex-col gap-2">
                          <div className="flex items-center gap-2">
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs ${
                                ownerVisible
                                  ? "bg-green-100 text-green-700 border border-green-200"
                                  : "bg-slate-100 text-slate-500 border border-slate-200"
                              }`}
                            >
                              Owner
                            </span>
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs ${
                                tenantVisible
                                  ? "bg-green-100 text-green-700 border border-green-200"
                                  : "bg-slate-100 text-slate-500 border border-slate-200"
                              }`}
                            >
                              Tenant
                            </span>
                            {doc.visibility === "admin" && (
                              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-slate-900 text-white border border-slate-800">
                                Admin only
                              </span>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <select
                              className="border border-slate-300 rounded px-2 py-1 text-xs bg-white"
                              value={currentVisibility}
                              onChange={(e) =>
                                handleVisibilityChange(
                                  doc.id,
                                  e.target.value as DocumentRecord["visibility"]
                                )
                              }
                            >
                              <option value="admin">Admin only (hidden from owner/tenant)</option>
                              <option value="owner">Owner only</option>
                              <option value="tenant">Tenant only</option>
                              <option value="all">Owner & Tenant</option>
                            </select>
                            <button
                              onClick={() => handleUpdateVisibility(doc.id)}
                              disabled={
                                savingVisibilityId === doc.id ||
                                currentVisibility === doc.visibility
                              }
                              className="text-xs px-3 py-1 rounded-full bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-60 disabled:cursor-not-allowed"
                            >
                              {savingVisibilityId === doc.id ? "Saving..." : "Update"}
                            </button>
                          </div>
                        </div>
                      </td>
                      <td className="py-2 pr-4 text-slate-500">
                        {new Date(doc.created_at).toLocaleDateString()}
                      </td>
                      <td className="py-2 pr-4">
                        <div className="flex items-center gap-2">
                          <a
                            href={doc.file_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs px-3 py-1 rounded-full bg-slate-900 text-white hover:bg-slate-800"
                          >
                            View
                          </a>
                          <button
                            onClick={() => handleDelete(doc.id)}
                            disabled={deletingId === doc.id}
                            className="text-xs px-3 py-1 rounded-full bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {deletingId === doc.id ? "Deleting..." : "Delete"}
                          </button>
                        </div>
                      </td>
                    </tr>
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
