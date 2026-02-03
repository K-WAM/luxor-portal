"use client";

import { useEffect, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { useAuth } from "@/app/context/AuthContext";

type Property = {
  id: string;
  address: string;
  leaseStart?: string;
  leaseEnd?: string;
  role?: string;
};

type MaintenanceRequest = {
  id: string;
  propertyId: string | null;
  propertyAddress?: string;
  tenantName: string;
  tenantEmail: string;
  category: string | null;
  description: string;
  status: string;
  createdAt?: string;
  attachments?: { url: string; name: string; type?: string; size?: number }[];
};

export default function TenantMaintenance() {
  const { user, role, loading: authLoading } = useAuth();
  const [properties, setProperties] = useState<Property[]>([]);
  const [form, setForm] = useState({
    propertyId: "",
    tenantName: "",
    tenantEmail: "",
    category: "",
    description: "",
  });
  const [requests, setRequests] = useState<MaintenanceRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<File[]>([]);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);

  const MAX_FILE_MB = 10;
  const MAX_FILE_BYTES = MAX_FILE_MB * 1024 * 1024;
  const ACCEPTED_TYPES = new Set([
    "image/jpeg",
    "image/png",
    "image/heic",
    "video/mp4",
    "video/quicktime",
  ]);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);

      const propsRes = await fetch("/api/properties", { cache: "no-store" });
      if (!propsRes.ok) {
        const errorData = await propsRes.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to load properties");
      }
      const propsData = (await propsRes.json()) as Property[];
      setProperties(propsData || []);

      // Pre-fill form with user info and sensible default property
      setForm((prev) => {
        const defaultId =
          (prev.propertyId && propsData.some((p) => p.id === prev.propertyId))
            ? prev.propertyId
            : propsData[0]?.id || "";

        return {
          ...prev,
          tenantName: user?.user_metadata?.name || prev.tenantName || "",
          tenantEmail: user?.email || prev.tenantEmail || "",
          propertyId: defaultId,
        };
      });

      // Load maintenance requests with server-side scoping
      const requestsRes = await fetch("/api/maintenance", { cache: "no-store" });
      if (!requestsRes.ok) {
        const errorData = await requestsRes.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to load requests");
      }
      const requestsData = await requestsRes.json();
      setRequests(requestsData || []);
    } catch (err: any) {
      console.error("Error loading maintenance data:", err);
      setError(err.message || "Failed to load data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (authLoading) return;
    loadData();
  }, [authLoading, user?.id, role]);

  const handleChange = (
    e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
  };

  const handleAttachmentChange = (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) {
      setAttachments([]);
      setAttachmentError(null);
      return;
    }

    const invalidType = files.find((file) => !ACCEPTED_TYPES.has(file.type));
    if (invalidType) {
      setAttachments([]);
      setAttachmentError("Unsupported file type. Please upload images or videos.");
      e.target.value = "";
      return;
    }

    const tooLarge = files.find((file) => file.size > MAX_FILE_BYTES);
    if (tooLarge) {
      setAttachments([]);
      setAttachmentError(`File exceeds ${MAX_FILE_MB} MB limit.`);
      e.target.value = "";
      return;
    }

    setAttachments(files);
    setAttachmentError(null);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!form.propertyId) {
      setError("Please select a property");
      return;
    }

    setSubmitting(true);

    try {
      let uploadedAttachments: { url: string; name: string; type?: string; size?: number }[] = [];
      if (attachments.length > 0) {
        const formData = new FormData();
        formData.append("propertyId", form.propertyId);
        attachments.forEach((file) => formData.append("files", file));
        const uploadRes = await fetch("/api/maintenance/attachments", {
          method: "POST",
          body: formData,
        });
        const uploadData = await uploadRes.json();
        if (!uploadRes.ok) {
          throw new Error(uploadData.error || "Failed to upload attachments");
        }
        uploadedAttachments = uploadData.attachments || [];
      }

      const res = await fetch("/api/maintenance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, attachments: uploadedAttachments }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to submit");

      await loadData();
      setForm((f) => ({ ...f, description: "", category: "" }));
      setAttachments([]);
      setAttachmentError(null);
    } catch (err: any) {
      setError(err.message || "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  // Show loading while auth is loading or data is loading
  if (authLoading || loading) {
    return (
      <div className="p-8 max-w-3xl">
        <h1 className="text-3xl font-bold mb-4">Request Maintenance</h1>
        <p className="text-gray-600">Loading...</p>
      </div>
    );
  }

  // Show empty state if no properties
  if (properties.length === 0) {
    return (
      <div className="p-8 max-w-3xl">
        <h1 className="text-3xl font-bold mb-4">Request Maintenance</h1>
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
          <p className="text-yellow-800">
            You don't have any properties associated with your account yet.
            Please contact your property manager for access.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-3xl">
      <h1 className="text-3xl font-bold mb-4">Request Maintenance</h1>
      <p className="mb-6 text-gray-700">
        Submit a new maintenance request and review your past requests.
      </p>

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4 mb-10 bg-white border p-4 rounded-lg">
        <div>
          <label className="block text-sm font-medium mb-1">
            Property <span className="text-red-500">*</span>
          </label>
          <select
            name="propertyId"
            value={form.propertyId}
            onChange={handleChange}
            className="w-full border border-slate-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            required
            disabled={role === "tenant"}
          >
            <option value="">Select a property</option>
            {properties.map((prop) => (
              <option key={prop.id} value={prop.id}>
                {prop.address}
              </option>
            ))}
          </select>
          <p className="text-xs text-gray-500 mt-1">
            You can only submit requests for properties you're associated with.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">
            Category
          </label>
          <select
            name="category"
            value={form.category}
            onChange={handleChange}
            className="w-full border border-slate-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">General</option>
            <option value="plumbing">Plumbing</option>
            <option value="electrical">Electrical</option>
            <option value="appliance">Appliance</option>
            <option value="hvac">Heating / Cooling</option>
            <option value="other">Other</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">
            Description <span className="text-red-500">*</span>
          </label>
          <textarea
            name="description"
            value={form.description}
            onChange={handleChange}
            className="w-full border border-slate-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            rows={4}
            placeholder="Please describe the maintenance issue in detail..."
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">
            Attachments (optional)
          </label>
          <input
            type="file"
            multiple
            accept="image/jpeg,image/png,image/heic,video/mp4,video/quicktime"
            onChange={handleAttachmentChange}
            className="w-full border border-slate-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <p className="text-xs text-gray-500 mt-1">
            Max file size: {MAX_FILE_MB} MB per file. If your file exceeds this limit, please email it to connect@luxordev.com.
          </p>
          {attachmentError && (
            <p className="text-xs text-red-600 mt-1">{attachmentError}</p>
          )}
          {attachments.length > 0 && (
            <div className="mt-2 text-xs text-slate-600 space-y-1">
              {attachments.map((file) => (
                <div key={`${file.name}-${file.size}`}>{file.name}</div>
              ))}
            </div>
          )}
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="px-4 py-2 rounded bg-black text-white hover:bg-gray-800 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
        >
          {submitting ? "Submitting..." : "Submit Request"}
        </button>
      </form>

      <h2 className="text-2xl font-semibold mb-3">Your past requests</h2>

      {requests.length === 0 ? (
        <p className="text-gray-600">No requests yet.</p>
      ) : (
        <div className="space-y-3">
          {requests.map((r) => {
            const property = properties.find((p) => p.id === r.propertyId);
            const statusColors: Record<string, string> = {
              open: "bg-yellow-100 text-yellow-800",
              in_progress: "bg-blue-100 text-blue-800",
              closed: "bg-green-100 text-green-800",
            };

            return (
              <div key={r.id} className="bg-white border border-slate-200 rounded-lg p-4">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <div className="font-semibold text-slate-900 mb-1">
                      {property?.address || r.propertyAddress || "Unknown property"}
                    </div>
                    <div className="text-xs text-gray-500">
                      {r.createdAt
                        ? new Date(r.createdAt).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                            hour: "numeric",
                            minute: "2-digit",
                          })
                        : "Date unavailable"}
                    </div>
                  </div>
                  <span
                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      statusColors[r.status] || "bg-gray-100 text-gray-800"
                    }`}
                  >
                    {r.status === "in_progress" ? "In Progress" : r.status.charAt(0).toUpperCase() + r.status.slice(1)}
                  </span>
                </div>
                <div className="text-sm text-slate-600 mb-1">
                  <span className="font-medium">{r.category || "General"}</span>
                </div>
                <p className="text-sm text-slate-700">{r.description}</p>
                {r.attachments && r.attachments.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {r.attachments.map((att, index) => (
                      <a
                        key={`${att.url}-${index}`}
                        href={att.url}
                        target="_blank"
                        rel="noreferrer"
                        className="block text-xs text-blue-600 hover:text-blue-700"
                      >
                        {att.name || `Attachment ${index + 1}`}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
