// app/owner/documents/page.tsx
"use client";

import { useEffect, useState, ChangeEvent } from "react";

type Property = {
  id: string;
  name?: string | null;
  address: string;
};

type DocumentRow = {
  id: string;
  property_id: string | null;
  title: string;
  file_url: string;
  storage_path: string;
  visibility: "admin" | "owner" | "tenant" | "all";
  created_at: string;
};

export default function OwnerDocumentsPage() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>("");
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [loadingProps, setLoadingProps] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load properties
  useEffect(() => {
    const loadProps = async () => {
      try {
        setLoadingProps(true);
        setError(null);
        const res = await fetch("/api/properties");
        if (!res.ok) {
          const text = await res.text();
          throw new Error(text || "Failed to load properties");
        }
        const data: Property[] = await res.json();
        setProperties(data);

        // Auto-select the first property
        if (data.length > 0) {
          setSelectedPropertyId(data[0].id);
        }
      } catch (err) {
        console.error(err);
        setError("Failed to load properties");
      } finally {
        setLoadingProps(false);
      }
    };

    loadProps();
  }, []);

  // Load documents whenever selectedPropertyId changes
  useEffect(() => {
    const loadDocuments = async () => {
      if (!selectedPropertyId) {
        setDocuments([]);
        return;
      }

      try {
        setLoadingDocs(true);
        setError(null);

        const res = await fetch(
          `/api/documents?propertyId=${encodeURIComponent(selectedPropertyId)}&role=owner`
        );

        if (!res.ok) {
          const text = await res.text();
          console.error("Documents error:", text);
          throw new Error(text || "Failed to load documents");
        }

        const data: DocumentRow[] = await res.json();
        setDocuments(data);
      } catch (err) {
        console.error(err);
        setError("Failed to load documents");
      } finally {
        setLoadingDocs(false);
      }
    };

    loadDocuments();
  }, [selectedPropertyId]);

  const handlePropertyChange = (e: ChangeEvent<HTMLSelectElement>) => {
    setSelectedPropertyId(e.target.value);
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString();
  };

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-semibold mb-2">My documents</h1>
      <p className="text-sm text-gray-600 mb-4">
        View and download documents associated with your properties.
      </p>

      {error && (
        <p className="mb-4 text-sm text-red-600">
          {error}
        </p>
      )}

      <div className="mb-4">
        <label className="block text-sm font-medium mb-1">
          Select property
        </label>
        {loadingProps ? (
          <p className="text-sm text-gray-500">Loading properties…</p>
        ) : properties.length === 0 ? (
          <p className="text-sm text-gray-500">
            No properties found yet.
          </p>
        ) : (
          <select
            value={selectedPropertyId}
            onChange={handlePropertyChange}
            className="border rounded px-3 py-2 text-sm w-full max-w-md"
          >
            {properties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name || p.address}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="border rounded-lg bg-white">
        <div className="px-4 py-3 border-b flex items-center justify-between">
          <h2 className="font-medium text-sm">Documents</h2>
        </div>

        <div className="p-4">
          {loadingDocs && (
            <p className="text-sm text-gray-500">Loading documents…</p>
          )}

          {!loadingDocs && (!selectedPropertyId || documents.length === 0) && (
            <p className="text-sm text-gray-500">
              No documents found for this property yet.
            </p>
          )}

          {!loadingDocs && documents.length > 0 && (
            <ul className="divide-y text-sm">
              {documents.map((doc) => (
                <li
                  key={doc.id}
                  className="py-2 flex items-center justify-between"
                >
                  <div>
                    <div className="font-medium">{doc.title}</div>
                    <div className="text-xs text-gray-500">
                      Uploaded: {formatDate(doc.created_at)}
                    </div>
                  </div>
                  <a
                    href={doc.file_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs border px-2 py-1 rounded hover:bg-gray-50"
                  >
                    Download
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}