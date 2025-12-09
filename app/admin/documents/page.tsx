// app/admin/documents/page.tsx
"use client";

import { useEffect, useState } from "react";

type Property = {
  id: string;
  name: string;
  address?: string | null;
};

type DocumentRecord = {
  id: string;
  property_id: string | null;
  title: string;
  file_url: string;
  file_type: string | null;
  visibility: "admin" | "owner" | "tenant" | "all";
  created_at: string;
  property_name?: string; // optional if your API joins this
};

export default function AdminDocumentsPage() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>("");
  const [title, setTitle] = useState("");
  const [visibility, setVisibility] =
    useState<DocumentRecord["visibility"]>("owner");
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch properties for the dropdown
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

  // Fetch documents list
  const loadDocuments = async () => {
    try {
      setLoadingDocs(true);
      const res = await fetch("/api/documents");
      if (!res.ok) throw new Error("Failed to load documents");
      const data = await res.json();
      setDocuments(data);
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

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("title", title || file.name);
      formData.append("property_id", selectedPropertyId);
      formData.append("visibility", visibility);

      const res = await fetch("/api/documents", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const text = await res.text();
        console.error("Upload failed:", text);
        throw new Error("Upload failed");
      }

      // Clear form
      setTitle("");
      setFile(null);
      (document.getElementById("file-input") as HTMLInputElement | null)?.value &&
        ((document.getElementById("file-input") as HTMLInputElement).value = "");

      // Reload list
      await loadDocuments();
    } catch (err) {
      console.error(err);
      setError("Upload failed. Check console for details.");
    } finally {
      setIsUploading(false);
    }
  };

  const getPropertyLabel = (doc: DocumentRecord) => {
    if (doc.property_name) return doc.property_name;
    const p = properties.find((prop) => prop.id === doc.property_id);
    if (!p) return "Unassigned";
    return p.name || p.address || "Property";
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">
          Documents (Admin)
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Upload leases, insurance, HOA rules, and reports. Files are stored in
          Supabase and shown to owners/tenants based on visibility.
        </p>
      </div>

      {/* Upload card */}
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
            {/* Property selector */}
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-slate-700">
                Property
              </label>
              <select
                className="border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white"
                value={selectedPropertyId}
                onChange={(e) => setSelectedPropertyId(e.target.value)}
              >
                <option value="">Select a property</option>
                {properties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name || p.address || `Property ${p.id}`}
                  </option>
                ))}
              </select>
            </div>

            {/* Visibility */}
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-slate-700">
                Visibility
              </label>
              <select
                className="border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white"
                value={visibility}
                onChange={(e) =>
                  setVisibility(e.target.value as DocumentRecord["visibility"])
                }
              >
                <option value="admin">Admin only</option>
                <option value="owner">Owner</option>
                <option value="tenant">Tenant</option>
                <option value="all">Owner + Tenant</option>
              </select>
            </div>
          </div>

          {/* Title */}
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-slate-700">
              Document name (optional)
            </label>
            <input
              type="text"
              className="border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white"
              placeholder="e.g. 2025 Lease Agreement, HOA Rules, Insurance"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          {/* File input */}
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-slate-700">
              File (PDF, image, etc.)
            </label>
            <input
              id="file-input"
              type="file"
              className="text-sm"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
          </div>

          <button
            type="submit"
            disabled={isUploading}
            className="inline-flex items-center px-4 py-2 rounded-lg text-sm font-medium bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {isUploading ? "Uploading…" : "Upload document"}
          </button>
        </form>
      </section>

      {/* Documents list */}
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
          <p className="text-sm text-slate-500">Loading documents…</p>
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
                  <th className="py-2 pr-4">Type</th>
                  <th className="py-2 pr-4">Created</th>
                  <th className="py-2 pr-4">Actions</th>
                </tr>
              </thead>
              <tbody>
                {documents.map((doc) => (
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
                    <td className="py-2 pr-4 text-slate-600 capitalize">
                      {doc.visibility}
                    </td>
                    <td className="py-2 pr-4 text-slate-600">
                      {doc.file_type || "Unknown"}
                    </td>
                    <td className="py-2 pr-4 text-slate-500">
                      {new Date(doc.created_at).toLocaleDateString()}
                    </td>
                    <td className="py-2 pr-4">
                      <a
                        href={doc.file_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs px-3 py-1 rounded-full bg-slate-900 text-white hover:bg-slate-800"
                      >
                        Download / View
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
