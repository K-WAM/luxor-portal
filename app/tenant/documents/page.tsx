"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/app/context/AuthContext";

type Property = {
  id: string;
  address?: string | null;
  name?: string | null;
};

type DocumentRecord = {
  id: string;
  property_id: string | null;
  title: string;
  file_url: string;
  created_at: string;
  visibility: string;
};

export default function TenantDocuments() {
  const { user, role, loading: authLoading } = useAuth();
  const [properties, setProperties] = useState<Property[]>([]);
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadDocs = async () => {
      try {
        setLoading(true);
        setError(null);

        if (authLoading) return;

        // Fetch properties linked to this tenant (server enforces scope)
        const propRes = await fetch(`/api/properties`, { cache: "no-store" });
        if (!propRes.ok) throw new Error("Failed to load properties");
        const propsData = await propRes.json();
        setProperties(propsData || []);

        if (!propsData || propsData.length === 0) {
          setDocuments([]);
          setError("No properties available.");
          setLoading(false);
          return;
        }

        // Fetch documents for each property (server enforces visibility)
        const docPromises = (propsData || []).map(async (p: Property) => {
          const res = await fetch(
            `/api/documents?propertyId=${p.id}`,
            { cache: "no-store" }
          );
          if (!res.ok) return [];
          const docs = await res.json();
          return docs as DocumentRecord[];
        });

        const docResults = await Promise.all(docPromises);
        const merged = docResults.flat().sort((a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
        setDocuments(merged);
      } catch (err: any) {
        console.error(err);
        setError(err.message || "Failed to load documents.");
      } finally {
        setLoading(false);
      }
    };

    loadDocs();
  }, [user?.id, role, authLoading]);

  const getPropertyLabel = (propertyId: string | null) => {
    const p = properties.find((prop) => prop.id === propertyId);
    return p?.name || p?.address || "Unassigned";
  };

  return (
    <div className="p-8 max-w-4xl">
      <h1 className="text-3xl font-bold mb-4">Documents</h1>
      <p className="mb-6 text-gray-700">
        View and download your lease agreements, notices, and other important documents.
      </p>

      <div className="bg-white rounded-lg border p-6">
        {authLoading || loading ? (
          <p className="text-gray-600">Loading documents…</p>
        ) : error ? (
          <p className="text-red-600">{error}</p>
        ) : documents.length === 0 ? (
          <p className="text-gray-500">No documents available yet.</p>
        ) : (
          <div className="space-y-4">
            {documents.map((doc) => (
              <div
                key={doc.id}
                className="border border-slate-200 rounded-lg p-4 flex items-center justify-between"
              >
                <div>
                  <div className="font-semibold text-slate-900">
                    {doc.title || "Untitled document"}
                  </div>
                  <div className="text-sm text-slate-600">
                    {getPropertyLabel(doc.property_id)}
                  </div>
                  <div className="text-xs text-slate-500">
                    Uploaded: {new Date(doc.created_at).toLocaleDateString()}
                  </div>
                </div>
                <a
                  href={doc.file_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm px-3 py-2 rounded-md bg-slate-900 text-white hover:bg-slate-800"
                >
                  View
                </a>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
