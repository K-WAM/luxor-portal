"use client";

import { useEffect, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { useAuth } from "@/app/context/AuthContext";
import { getShortPropertyName } from "@/lib/property-short-name";

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
  schedulingDetails?: {
    availability_options: { date: string; window: string }[];
    is_flexible: boolean;
    vendor_can_enter_without_tenant: boolean;
    confirmed?: { date: string; window: string; note?: string } | null;
  } | null;
};

const TIME_BLOCK_OPTIONS = [
  { value: "morning", label: "Morning: 8–12" },
  { value: "midday", label: "Midday: 12–3" },
  { value: "afternoon", label: "Afternoon: 3–5" },
  { value: "evening", label: "Evening: 5–8" },
];

export default function TenantMaintenance() {
  const { user, role, loading: authLoading } = useAuth();
  const [properties, setProperties] = useState<Property[]>([]);
  const [form, setForm] = useState({
    propertyId: "",
    tenantName: "",
    tenantEmail: "",
    category: "",
    description: "",
    availability1Date: "",
    availability1Window: "morning",
    availability2Date: "",
    availability2Window: "midday",
    availability3Date: "",
    availability3Window: "afternoon",
    isFlexible: false,
    vendorCanEnterWithoutTenant: false,
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
    const target = e.target as HTMLInputElement;
    const value = target.type === "checkbox" ? target.checked : target.value;
    setForm((f) => ({ ...f, [target.name]: value }));
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

    const availabilityOptions = [
      { date: form.availability1Date, window: form.availability1Window },
      { date: form.availability2Date, window: form.availability2Window },
      { date: form.availability3Date, window: form.availability3Window },
    ];
    if (availabilityOptions.some((opt) => !opt.date || !opt.window)) {
      setError("Please provide all three availability options.");
      return;
    }
    const unique = new Set(availabilityOptions.map((opt) => `${opt.date}|${opt.window}`));
    if (unique.size !== availabilityOptions.length) {
      setError("Availability options must be unique.");
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
        body: JSON.stringify({
          ...form,
          attachments: uploadedAttachments,
          schedulingDetails: {
            availability_options: availabilityOptions,
            is_flexible: form.isFlexible,
            vendor_can_enter_without_tenant: form.vendorCanEnterWithoutTenant,
          },
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to submit");

      await loadData();
      setForm((f) => ({
        ...f,
        description: "",
        category: "",
        availability1Date: "",
        availability1Window: "morning",
        availability2Date: "",
        availability2Window: "midday",
        availability3Date: "",
        availability3Window: "afternoon",
        isFlexible: false,
        vendorCanEnterWithoutTenant: false,
      }));
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
                {getShortPropertyName(prop.address)}
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

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {[1, 2, 3].map((idx) => (
            <div key={idx} className="border border-slate-200 rounded-md p-3">
              <div className="text-sm font-medium mb-2">
                Availability option {idx} <span className="text-red-500">*</span>
              </div>
              <input
                type="date"
                name={`availability${idx}Date`}
                value={(form as any)[`availability${idx}Date`]}
                onChange={handleChange}
                className="w-full border border-slate-300 rounded-md px-3 py-2 mb-2"
                required
              />
              <select
                name={`availability${idx}Window`}
                value={(form as any)[`availability${idx}Window`]}
                onChange={handleChange}
                className="w-full border border-slate-300 rounded-md px-3 py-2"
                required
              >
                {TIME_BLOCK_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="isFlexible"
              checked={form.isFlexible}
              onChange={handleChange}
              className="h-4 w-4"
            />
            I&apos;m flexible
          </label>
          <div>
            <label className="block text-sm font-medium mb-1">
              Can vendor enter if tenant is not home? <span className="text-red-500">*</span>
            </label>
            <select
              name="vendorCanEnterWithoutTenant"
              value={form.vendorCanEnterWithoutTenant ? "yes" : "no"}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  vendorCanEnterWithoutTenant: e.target.value === "yes",
                }))
              }
              className="w-full border border-slate-300 rounded-md px-3 py-2"
            >
              <option value="no">No</option>
              <option value="yes">Yes</option>
            </select>
          </div>
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
            const isScheduled = r.status === "in_progress" && !!r.schedulingDetails?.confirmed;
            const displayStatus = r.status === "open"
              ? "Submitted"
              : isScheduled
              ? "Scheduled"
              : r.status === "in_progress"
              ? "Scheduling in progress"
              : r.status === "closed"
              ? "Completed"
              : r.status.charAt(0).toUpperCase() + r.status.slice(1);
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
                      <span title={property?.address || r.propertyAddress || "Unknown property"}>
                        {getShortPropertyName(property?.address || r.propertyAddress) || "Unknown property"}
                      </span>
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
                      isScheduled ? "bg-emerald-100 text-emerald-800" : (statusColors[r.status] || "bg-gray-100 text-gray-800")
                    }`}
                  >
                    {displayStatus}
                  </span>
                </div>
                <div className="text-sm text-slate-600 mb-1">
                  <span className="font-medium">{r.category || "General"}</span>
                </div>
                <p className="text-sm text-slate-700">{r.description}</p>
                {r.schedulingDetails?.confirmed && (
                  <div className="mt-2 text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 rounded px-2 py-1">
                    Scheduled: {r.schedulingDetails.confirmed.date} ({r.schedulingDetails.confirmed.window})
                    {r.schedulingDetails.confirmed.note ? ` — ${r.schedulingDetails.confirmed.note}` : ""}
                  </div>
                )}
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
