"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import {
  Pencil,
  Trash2,
  Calendar,
  CalendarCheck,
  CalendarClock,
  Mail,
  Upload,
  X,
  Check,
  Plus,
  MessageSquarePlus,
  FileText,
  Search,
  ChevronDown,
  ChevronUp,
  MessageSquare,
  CircleDot,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getShortPropertyName } from "@/lib/property-short-name";

type Attachment = { url: string; name: string; type?: string; size?: number };
type ActivityEntry = { at: string; type: string; note: string; author?: string };

type MaintenanceRequest = {
  id: string;
  propertyId: string | null;
  propertyAddress?: string;
  tenantName: string;
  tenantEmail: string;
  category: string | null;
  description: string;
  status: string;
  internalComments?: string;
  closingNote?: string;
  costAccountability?: string;
  cost?: number;
  createdAt?: string;
  closedAt?: string;
  attachments?: Attachment[];
  activityLog?: ActivityEntry[];
  schedulingDetails?: {
    availability_options: { date: string; window: string }[];
    is_flexible: boolean;
    vendor_can_enter_without_tenant: boolean;
    confirmed?: { date: string; window: string; note?: string; source?: "proposed" | "custom" } | null;
  } | null;
};

type Property = {
  id: string;
  address: string;
  current_tenant_names?: string[];
};

type PropertyTenant = { name: string; email: string };

const TIME_BLOCK_OPTIONS = [
  { value: "morning", label: "Morning: 8–12" },
  { value: "midday", label: "Midday: 12–3" },
  { value: "afternoon", label: "Afternoon: 3–5" },
  { value: "evening", label: "Evening: 5–8" },
];

const CATEGORY_OPTIONS = [
  { value: "", label: "General" },
  { value: "plumbing", label: "Plumbing" },
  { value: "electrical", label: "Electrical" },
  { value: "appliance", label: "Appliance" },
  { value: "hvac", label: "Heating / Cooling" },
  { value: "other", label: "Other" },
];

const ACCOUNTABILITY_OPTIONS = [
  { value: "owner", label: "Owner" },
  { value: "tenant", label: "Tenant" },
  { value: "property_manager", label: "Property Manager" },
];

const toDateTimeLocal = (value?: string) => {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const offsetMs = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - offsetMs).toISOString().slice(0, 16);
};

const toIsoString = (value?: string) => {
  if (!value) return undefined;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toISOString();
};

const inputCls = "border border-slate-300 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white w-full";
const labelCls = "block text-xs font-semibold text-slate-600 mb-1";

export default function MaintenanceRequestsPage() {
  const [requests, setRequests] = useState<MaintenanceRequest[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [propertyTenants, setPropertyTenants] = useState<Map<string, PropertyTenant[]>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ msg: string; action?: { label: string; run: () => void } } | null>(null);

  const flashNotice = (msg: string, action?: { label: string; run: () => void }) => {
    setNotice({ msg, action });
    // Plain confirmations auto-dismiss; ones with an action stay until used/dismissed.
    if (!action) setTimeout(() => setNotice((n) => (n?.msg === msg ? null : n)), 2500);
  };
  const [savingId, setSavingId] = useState<string | null>(null);
  const [sendingEmail, setSendingEmail] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editingRequestId, setEditingRequestId] = useState<string | null>(null);
  const [respondingRequestId, setRespondingRequestId] = useState<string | null>(null);
  const [selectedPropertyId, setSelectedPropertyId] = useState("all");
  const [search, setSearch] = useState("");
  const [showClosed, setShowClosed] = useState(true);
  const [uploadingFor, setUploadingFor] = useState<string | null>(null);
  const [commentingId, setCommentingId] = useState<string | null>(null);
  const [commentText, setCommentText] = useState("");
  // Hidden date inputs per row, triggered by the calendar icons for at-a-glance date edits.
  const dateInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const openDatePicker = (key: string) => {
    const el = dateInputRefs.current[key];
    if (!el) return;
    if (typeof el.showPicker === "function") {
      try { el.showPicker(); return; } catch { /* fall through */ }
    }
    el.focus();
    el.click();
  };

  const toDateInput = (value?: string) => {
    if (!value) return "";
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? "" : toDateTimeLocal(value).slice(0, 10);
  };

  const [createForm, setCreateForm] = useState({
    propertyId: "",
    tenantName: "",
    tenantEmail: "",
    category: "",
    description: "",
    cost: "",
    internalComments: "",
  });

  const [editForm, setEditForm] = useState({
    propertyId: "",
    tenantName: "",
    tenantEmail: "",
    category: "",
    description: "",
    cost: "",
    status: "open",
    createdAt: "",
    closedAt: "",
    internalComments: "",
    closingNote: "",
    costAccountability: "owner",
  });

  const [respondForm, setRespondForm] = useState({
    scheduleChoice: "",
    customScheduleDate: "",
    customScheduleWindow: "morning",
    schedulingNote: "",
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [propsRes, reqRes, userPropsRes, usersRes] = await Promise.all([
        fetch("/api/properties"),
        fetch("/api/maintenance"),
        fetch("/api/admin/user-properties"),
        fetch("/api/admin/users"),
      ]);

      const propsData: Property[] = propsRes.ok ? await propsRes.json() : [];
      setProperties(propsData || []);

      const reqData = await reqRes.json();
      if (!reqRes.ok) throw new Error(reqData.error || "Failed to load requests");
      setRequests(reqData || []);

      // Build propertyId → tenants map
      if (userPropsRes.ok && usersRes.ok) {
        const userProps: any[] = await userPropsRes.json();
        const users: any[] = await usersRes.json();
        const userMap = new Map(users.map((u) => [u.id, u]));
        const tenantMap = new Map<string, PropertyTenant[]>();
        for (const up of userProps) {
          if (up.role !== "tenant") continue;
          const u = userMap.get(up.user_id);
          if (!u) continue;
          const list = tenantMap.get(up.property_id) || [];
          list.push({ name: u.name || u.email || "Tenant", email: u.email || "" });
          tenantMap.set(up.property_id, list);
        }
        setPropertyTenants(tenantMap);
      }
    } catch (err: any) {
      setError(err.message || "Failed to load data.");
    } finally {
      setLoading(false);
    }
  };

  const loadRequests = async () => {
    const res = await fetch("/api/maintenance");
    const data = await res.json();
    if (res.ok) setRequests(data || []);
  };

  const patch = async (payload: Record<string, any>) => {
    const res = await fetch("/api/maintenance", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to update");
    return data;
  };

  const updateStatus = async (id: string, status: string) => {
    try {
      setSavingId(id);
      await patch({ id, status });
      await loadRequests();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSavingId(null);
    }
  };

  const deleteRequest = async (id: string) => {
    if (!confirm("Delete this maintenance request?")) return;
    try {
      setSavingId(id);
      const res = await fetch("/api/maintenance", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to delete");
      await loadRequests();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSavingId(null);
    }
  };

  const handleCreateChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setCreateForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  const handleCreateSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!createForm.propertyId || !createForm.tenantName || !createForm.tenantEmail || !createForm.description) {
      setError("Please fill in all required fields");
      return;
    }
    try {
      setCreating(true);
      setError(null);
      const res = await fetch("/api/maintenance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          propertyId: createForm.propertyId,
          tenantName: createForm.tenantName,
          tenantEmail: createForm.tenantEmail,
          category: createForm.category,
          description: createForm.description,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create");
      if (data?.id && (createForm.cost || createForm.internalComments)) {
        await patch({
          id: data.id,
          ...(createForm.cost ? { cost: parseFloat(createForm.cost) } : {}),
          ...(createForm.internalComments ? { internalComments: createForm.internalComments } : {}),
        });
      }
      setCreateForm({ propertyId: "", tenantName: "", tenantEmail: "", category: "", description: "", cost: "", internalComments: "" });
      setShowCreateForm(false);
      await loadRequests();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  };

  const startEdit = (req: MaintenanceRequest) => {
    setEditingRequestId(req.id);
    setRespondingRequestId(null);
    setEditForm({
      propertyId: req.propertyId || properties[0]?.id || "",
      tenantName: req.tenantName || "",
      tenantEmail: req.tenantEmail || "",
      category: req.category || "",
      description: req.description || "",
      cost: req.cost !== undefined && req.cost !== null ? String(req.cost) : "",
      status: req.status || "open",
      createdAt: toDateTimeLocal(req.createdAt),
      closedAt: toDateTimeLocal(req.closedAt),
      internalComments: req.internalComments || "",
      closingNote: req.closingNote || "",
      costAccountability: req.costAccountability || "owner",
    });
  };

  const startRespond = (req: MaintenanceRequest) => {
    setRespondingRequestId(req.id);
    setEditingRequestId(null);
    setRespondForm({
      scheduleChoice: "",
      customScheduleDate: req.schedulingDetails?.confirmed?.date || "",
      customScheduleWindow: req.schedulingDetails?.confirmed?.window || "morning",
      schedulingNote: req.schedulingDetails?.confirmed?.note || "",
    });
  };

  const handleEditChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setEditForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  const handleRespondChange = (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setRespondForm((f) => ({ ...f, [e.target.name]: e.target.value }));

  const handleEditSubmit = async (e: React.SyntheticEvent, sendEmail?: "opened" | "closed") => {
    e.preventDefault();
    if (!editingRequestId) return;
    try {
      setSavingId(editingRequestId);
      const payload: Record<string, any> = {
        id: editingRequestId,
        propertyId: editForm.propertyId,
        tenantName: editForm.tenantName,
        tenantEmail: editForm.tenantEmail,
        category: editForm.category,
        description: editForm.description,
        status: editForm.status,
        internalComments: editForm.internalComments,
        closingNote: editForm.closingNote,
        costAccountability: editForm.costAccountability,
      };
      if (editForm.cost !== "") payload.cost = parseFloat(editForm.cost);
      const createdAtIso = toIsoString(editForm.createdAt);
      if (createdAtIso) payload.createdAt = createdAtIso;
      payload.closedAt = editForm.closedAt === "" ? null : toIsoString(editForm.closedAt) ?? null;
      if (sendEmail === "opened") payload.sendOpenedEmail = true;
      if (sendEmail === "closed") payload.sendClosedEmail = true;
      await patch(payload);
      await loadRequests();
      setEditingRequestId(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSavingId(null);
    }
  };

  const sendEmailOnly = async (req: MaintenanceRequest, type: "opened" | "closed") => {
    try {
      setSendingEmail(req.id);
      await patch({
        id: req.id,
        ...(type === "opened" ? { sendOpenedEmail: true } : { sendClosedEmail: true }),
      });
      setError(null);
      flashNotice(`Notification sent to ${req.tenantName || "tenant"}.`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSendingEmail(null);
    }
  };

  // Quick comment — appends a timestamped entry to the ticket's audit log.
  const addComment = async (req: MaintenanceRequest) => {
    const text = commentText.trim();
    if (!text) return;
    try {
      setSavingId(req.id);
      await patch({ id: req.id, addComment: text });
      await loadRequests();
      setCommentText("");
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSavingId(null);
    }
  };

  // Quick "date opened" edit from the row calendar icon (no panel needed).
  const setOpenedDate = async (req: MaintenanceRequest, dateStr: string) => {
    if (!dateStr) return;
    try {
      setSavingId(req.id);
      await patch({ id: req.id, createdAt: new Date(`${dateStr}T12:00:00`).toISOString() });
      await loadRequests();
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSavingId(null);
    }
  };

  // Quick close: pick a closed date from the row icon → mark closed on that date.
  const quickClose = async (req: MaintenanceRequest, dateStr: string) => {
    if (!dateStr) return;
    try {
      setSavingId(req.id);
      await patch({
        id: req.id,
        status: "closed",
        closedAt: new Date(`${dateStr}T12:00:00`).toISOString(),
      });
      await loadRequests();
      setError(null);
      const closedLabel = formatDateShort(new Date(`${dateStr}T12:00:00`).toISOString());
      flashNotice(
        `Request closed as of ${closedLabel}.`,
        req.tenantEmail ? { label: "Notify tenant of closure", run: () => sendEmailOnly(req, "closed") } : undefined
      );
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSavingId(null);
    }
  };

  const handleConfirmSchedule = async (req: MaintenanceRequest) => {
    const selectedOption = req.schedulingDetails?.availability_options?.[Number(respondForm.scheduleChoice)];
    const confirmedDate = selectedOption?.date || respondForm.customScheduleDate;
    const confirmedWindow = selectedOption?.window || respondForm.customScheduleWindow;
    if (!confirmedDate || !confirmedWindow) {
      setError("Please choose a proposed window or enter a custom date/time block.");
      return;
    }
    try {
      setSavingId(req.id);
      await patch({
        id: req.id,
        status: "in_progress",
        schedulingDetails: {
          availability_options: req.schedulingDetails?.availability_options || [],
          is_flexible: !!req.schedulingDetails?.is_flexible,
          vendor_can_enter_without_tenant: !!req.schedulingDetails?.vendor_can_enter_without_tenant,
          confirmed: {
            date: confirmedDate,
            window: confirmedWindow,
            note: respondForm.schedulingNote || "",
            source: selectedOption ? "proposed" : "custom",
            confirmed_at: new Date().toISOString(),
          },
        },
        sendConfirmationEmail: true,
      });
      await loadRequests();
      setRespondingRequestId(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSavingId(null);
    }
  };

  const handleFileUpload = async (req: MaintenanceRequest, file: File) => {
    try {
      setUploadingFor(req.id);
      const supabase = createClient();
      const ext = file.name.split(".").pop();
      const path = `${req.id}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("maintenance-attachments")
        .upload(path, file, { upsert: false });
      if (upErr) throw new Error(upErr.message);
      const { data: urlData } = supabase.storage.from("maintenance-attachments").getPublicUrl(path);
      const newAttachment: Attachment = { url: urlData.publicUrl, name: file.name, type: file.type, size: file.size };
      const existing: Attachment[] = req.attachments || [];
      await patch({ id: req.id, attachments: [...existing, newAttachment] });
      await loadRequests();
    } catch (err: any) {
      setError(err.message || "File upload failed");
    } finally {
      setUploadingFor(null);
    }
  };

  // Tenant dropdown helpers
  const tenantsForProperty = (propertyId: string): PropertyTenant[] =>
    propertyTenants.get(propertyId) || [];

  const getElapsedTime = (createdAt?: string) => {
    if (!createdAt) return "N/A";
    const diff = Date.now() - new Date(createdAt).getTime();
    const days = Math.floor(diff / 86400000);
    const hours = Math.floor((diff % 86400000) / 3600000);
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h`;
    return "< 1h";
  };

  const formatDateShort = (value?: string) =>
    value
      ? new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
      : "—";

  const isRedRequest = (createdAt?: string) =>
    !!createdAt && (Date.now() - new Date(createdAt).getTime()) / 86400000 > 21;

  const propertyFilteredRequests = useMemo(() => {
    const q = search.trim().toLowerCase();
    return requests.filter((r) => {
      if (selectedPropertyId !== "all" && r.propertyId !== selectedPropertyId) return false;
      if (!q) return true;
      return [r.tenantName, r.tenantEmail, r.description, r.propertyAddress, r.category]
        .some((v) => String(v || "").toLowerCase().includes(q));
    });
  }, [requests, selectedPropertyId, search]);
  const activeRequests = useMemo(() => propertyFilteredRequests.filter((r) => r.status !== "closed"), [propertyFilteredRequests]);
  const closedRequests = useMemo(() => propertyFilteredRequests.filter((r) => r.status === "closed"), [propertyFilteredRequests]);

  // Shared inline edit panel
  const renderEditPanel = (req: MaintenanceRequest) => {
    const isClosing = editForm.status === "closed";
    const tenants = tenantsForProperty(editForm.propertyId);
    const isSaving = savingId === req.id;

    return (
      <tr>
        <td colSpan={7} className="bg-slate-50 border-t border-b border-slate-200 px-4 py-4">
          <form className="space-y-4 text-sm" onSubmit={(e) => handleEditSubmit(e)}>
            {/* Row 1: Property + Category + Status */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <label className={labelCls}>Property</label>
                <select name="propertyId" value={editForm.propertyId} onChange={handleEditChange} className={inputCls} required>
                  <option value="">Select…</option>
                  {properties.map((p) => (
                    <option key={p.id} value={p.id}>{getShortPropertyName(p.address)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>Category</label>
                <select name="category" value={editForm.category} onChange={handleEditChange} className={inputCls}>
                  {CATEGORY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Status</label>
                <select name="status" value={editForm.status} onChange={handleEditChange} className={inputCls}>
                  <option value="open">Open</option>
                  <option value="in_progress">In Progress</option>
                  <option value="closed">Closed</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>Cost ($)</label>
                <input type="number" step="0.01" name="cost" value={editForm.cost} onChange={handleEditChange} className={inputCls} placeholder="0.00" />
              </div>
            </div>

            {/* Row 2: Tenant name + email (datalist: pick from property tenants or type freely) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Tenant Name</label>
                <input
                  type="text"
                  name="tenantName"
                  list={`edit-tenant-names-${req.id}`}
                  value={editForm.tenantName}
                  onChange={(e) => {
                    const t = tenants.find((t) => t.name === e.target.value);
                    setEditForm((f) => ({ ...f, tenantName: e.target.value, tenantEmail: t?.email || f.tenantEmail }));
                  }}
                  className={inputCls}
                  placeholder="Select or type…"
                />
                <datalist id={`edit-tenant-names-${req.id}`}>
                  {tenants.map((t) => <option key={t.email} value={t.name} />)}
                </datalist>
              </div>
              <div>
                <label className={labelCls}>Tenant Email</label>
                <input
                  type="email"
                  name="tenantEmail"
                  list={`edit-tenant-emails-${req.id}`}
                  value={editForm.tenantEmail}
                  onChange={(e) => {
                    const t = tenants.find((t) => t.email === e.target.value);
                    setEditForm((f) => ({ ...f, tenantEmail: e.target.value, tenantName: t?.name || f.tenantName }));
                  }}
                  className={inputCls}
                  placeholder="Select or type…"
                />
                <datalist id={`edit-tenant-emails-${req.id}`}>
                  {tenants.map((t) => <option key={t.email} value={t.email} />)}
                </datalist>
              </div>
            </div>

            {/* Row 3: Dates */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Date Opened</label>
                <input type="datetime-local" name="createdAt" value={editForm.createdAt} onChange={handleEditChange} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Date Closed</label>
                <input type="datetime-local" name="closedAt" value={editForm.closedAt} onChange={handleEditChange} className={inputCls} />
              </div>
            </div>

            {/* Row 4: Description */}
            <div>
              <label className={labelCls}>Description</label>
              <textarea name="description" value={editForm.description} onChange={handleEditChange} className={inputCls} rows={2} />
            </div>

            {/* Row 5: Internal Notes */}
            <div>
              <label className={labelCls}>Internal Notes</label>
              <textarea name="internalComments" value={editForm.internalComments} onChange={handleEditChange} className={inputCls} rows={2} placeholder="Internal notes visible only to admin…" />
            </div>

            {/* Row 6: Close details — shown when status=closed */}
            {isClosing && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-3">
                <div className="text-xs font-semibold text-amber-800 uppercase tracking-wide">Close Details</div>
                <div>
                  <label className={labelCls}>Closing Note (sent to tenant)</label>
                  <textarea name="closingNote" value={editForm.closingNote} onChange={handleEditChange} className={inputCls} rows={2} placeholder="Describe the resolution…" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>Cost Accountability</label>
                    <select name="costAccountability" value={editForm.costAccountability} onChange={handleEditChange} className={inputCls}>
                      {ACCOUNTABILITY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* Row 7: Attachments */}
            {req.attachments && req.attachments.length > 0 && (
              <div>
                <label className={labelCls}>Attachments</label>
                <div className="flex flex-wrap gap-2">
                  {req.attachments.map((a, i) => (
                    <a key={i} href={a.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-blue-600 hover:underline border border-slate-200 rounded px-2 py-1 bg-white">
                      <FileText size={12} /> {a.name}
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                type="submit"
                disabled={isSaving}
                className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-blue-300 text-sm font-medium"
              >
                <Check size={14} /> {isSaving ? "Saving…" : "Save Changes"}
              </button>
              {isClosing && (
                <button
                  type="button"
                  disabled={isSaving || !editForm.tenantEmail}
                  onClick={(e) => handleEditSubmit(e, "closed")}
                  className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white rounded-md hover:bg-emerald-700 disabled:opacity-50 text-sm font-medium"
                >
                  <Mail size={14} /> Save & Email Tenant
                </button>
              )}
              {/* Upload attachment */}
              <label className="flex items-center gap-1.5 px-3 py-2 border border-slate-300 rounded-md bg-white text-slate-700 hover:bg-slate-50 cursor-pointer text-sm font-medium">
                <Upload size={14} /> {uploadingFor === req.id ? "Uploading…" : "Attach File"}
                <input
                  type="file"
                  className="hidden"
                  disabled={uploadingFor === req.id}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFileUpload(req, f);
                    e.target.value = "";
                  }}
                />
              </label>
              {req.status !== "closed" && (
                <button
                  type="button"
                  onClick={() => startRespond(req)}
                  className="flex items-center gap-1.5 px-3 py-2 border border-slate-300 rounded-md bg-white text-slate-700 hover:bg-slate-50 text-sm font-medium"
                >
                  <CalendarClock size={14} /> Schedule Visit
                </button>
              )}
              <button
                type="button"
                onClick={() => setEditingRequestId(null)}
                className="flex items-center gap-1.5 px-3 py-2 bg-slate-200 text-slate-700 rounded-md hover:bg-slate-300 text-sm"
              >
                <X size={14} /> Cancel
              </button>
            </div>
          </form>
        </td>
      </tr>
    );
  };

  const renderRespondPanel = (req: MaintenanceRequest) => (
    <tr>
      <td colSpan={7} className="bg-slate-50 border-t border-b border-slate-200 px-4 py-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
          <div className="md:col-span-3 font-semibold text-slate-700">Scheduling Response</div>
          <div className="flex flex-col gap-1 md:col-span-3">
            <label className={labelCls}>Choose proposed window</label>
            <select name="scheduleChoice" value={respondForm.scheduleChoice} onChange={handleRespondChange} className={inputCls}>
              <option value="">Select proposed window…</option>
              {(req.schedulingDetails?.availability_options || []).map((opt, idx) => (
                <option key={`${opt.date}-${idx}`} value={String(idx)}>{opt.date} ({opt.window})</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelCls}>Or custom date</label>
            <input type="date" name="customScheduleDate" value={respondForm.customScheduleDate} onChange={handleRespondChange} className={inputCls} />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelCls}>Time block</label>
            <select name="customScheduleWindow" value={respondForm.customScheduleWindow} onChange={handleRespondChange} className={inputCls}>
              {TIME_BLOCK_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelCls}>Note (optional)</label>
            <input type="text" name="schedulingNote" value={respondForm.schedulingNote} onChange={handleRespondChange} className={inputCls} />
          </div>
          <div className="md:col-span-3 text-xs text-slate-500">
            Flexible: {req.schedulingDetails?.is_flexible ? "Yes" : "No"} · Vendor may enter without tenant: {req.schedulingDetails?.vendor_can_enter_without_tenant ? "Yes" : "No"}
          </div>
          <div className="md:col-span-3 flex gap-2">
            <button
              type="button"
              onClick={() => handleConfirmSchedule(req)}
              disabled={savingId === req.id}
              className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 text-white rounded-md hover:bg-emerald-700 disabled:bg-emerald-300 text-sm font-medium"
            >
              <Mail size={14} /> {savingId === req.id ? "Confirming…" : "Confirm & Email Tenant"}
            </button>
            <button type="button" onClick={() => setRespondingRequestId(null)} className="px-4 py-2 bg-slate-200 text-slate-700 rounded-md hover:bg-slate-300 text-sm">
              Cancel
            </button>
          </div>
        </div>
      </td>
    </tr>
  );

  const formatDateTime = (value?: string) =>
    value
      ? new Date(value).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })
      : "";

  const ACTIVITY_STYLE: Record<string, { color: string; label: string }> = {
    created: { color: "text-slate-500", label: "Created" },
    comment: { color: "text-violet-600", label: "Comment" },
    status: { color: "text-amber-600", label: "Status" },
    email: { color: "text-blue-600", label: "Email" },
    note: { color: "text-slate-500", label: "Note" },
  };

  // Quick-comment + auditable activity timeline (newest first).
  const renderCommentPanel = (req: MaintenanceRequest) => {
    const log = [...(req.activityLog || [])].reverse();
    const isSaving = savingId === req.id;
    return (
      <tr>
        <td colSpan={8} className="bg-violet-50/40 border-t border-b border-slate-200 px-4 py-4">
          <div className="max-w-3xl">
            <div className="flex items-center gap-2 mb-2">
              <MessageSquare size={15} className="text-violet-600" />
              <span className="text-sm font-semibold text-slate-700">Activity & Comments</span>
              <span className="text-xs text-slate-400">— audit record</span>
            </div>

            {/* Quick add */}
            <div className="flex gap-2 mb-3">
              <input
                type="text"
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addComment(req); } }}
                placeholder="Add a quick update… (e.g. 'Vendor scheduled for Thursday')"
                className={`${inputCls} flex-1`}
                autoFocus
              />
              <button
                type="button"
                onClick={() => addComment(req)}
                disabled={isSaving || !commentText.trim()}
                className="flex items-center gap-1.5 px-4 py-2 bg-violet-600 text-white rounded-md hover:bg-violet-700 disabled:opacity-50 text-sm font-medium shrink-0"
              >
                <Plus size={14} /> {isSaving ? "Saving…" : "Add"}
              </button>
            </div>

            {/* Timeline */}
            {log.length === 0 ? (
              <p className="text-xs text-slate-400">No activity recorded yet.</p>
            ) : (
              <ul className="space-y-2">
                {log.map((entry, i) => {
                  const style = ACTIVITY_STYLE[entry.type] || ACTIVITY_STYLE.note;
                  return (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <CircleDot size={13} className={`mt-1 shrink-0 ${style.color}`} />
                      <div className="min-w-0">
                        <span className="text-slate-800 break-words">{entry.note}</span>
                        <div className="text-xs text-slate-400">
                          {style.label} · {formatDateTime(entry.at)}{entry.author ? ` · ${entry.author}` : ""}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </td>
      </tr>
    );
  };

  const iconBtn = "p-1.5 rounded-md border disabled:opacity-50 transition-colors shrink-0";
  const renderActionButtons = (req: MaintenanceRequest, isClosed = false) => (
    <div className="relative flex flex-nowrap items-center gap-1">
      {/* Hidden native date pickers triggered by the calendar icons */}
      <input
        type="date"
        ref={(el) => { dateInputRefs.current[`${req.id}-opened`] = el; }}
        defaultValue={toDateInput(req.createdAt)}
        onChange={(e) => setOpenedDate(req, e.target.value)}
        className="absolute left-0 top-0 h-0 w-0 opacity-0 pointer-events-none"
        tabIndex={-1}
        aria-hidden
      />
      {!isClosed && (
        <input
          type="date"
          ref={(el) => { dateInputRefs.current[`${req.id}-closed`] = el; }}
          onChange={(e) => quickClose(req, e.target.value)}
          className="absolute left-0 top-0 h-0 w-0 opacity-0 pointer-events-none"
          tabIndex={-1}
          aria-hidden
        />
      )}

      <button
        title={editingRequestId === req.id ? "Close editor" : "Edit"}
        className={`${iconBtn} ${editingRequestId === req.id ? "border-slate-400 bg-slate-100 text-slate-800" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"}`}
        onClick={() => editingRequestId === req.id ? setEditingRequestId(null) : startEdit(req)}
        disabled={savingId === req.id}
      >
        <Pencil size={15} />
      </button>
      <button
        title={`Edit date opened (currently ${formatDateShort(req.createdAt)})`}
        className={`${iconBtn} border-slate-300 bg-white text-slate-700 hover:bg-slate-100`}
        onClick={() => openDatePicker(`${req.id}-opened`)}
        disabled={savingId === req.id}
      >
        <Calendar size={15} />
      </button>
      {!isClosed && (
        <button
          title="Close request — pick a closed date"
          className={`${iconBtn} border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100`}
          onClick={() => openDatePicker(`${req.id}-closed`)}
          disabled={savingId === req.id}
        >
          <CalendarCheck size={15} />
        </button>
      )}
      <button
        title={req.tenantEmail ? `Email tenant (${req.status === "closed" ? "resolved" : "received"} notice)` : "No tenant email on file"}
        className={`${iconBtn} border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100`}
        onClick={() => sendEmailOnly(req, req.status === "closed" ? "closed" : "opened")}
        disabled={sendingEmail === req.id || !req.tenantEmail}
      >
        <Mail size={15} />
      </button>
      <button
        title="Add comment / view history"
        className={`${iconBtn} ${commentingId === req.id ? "border-violet-400 bg-violet-100 text-violet-800" : "border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100"}`}
        onClick={() => {
          if (commentingId === req.id) { setCommentingId(null); }
          else { setCommentingId(req.id); setCommentText(""); }
        }}
        disabled={savingId === req.id}
      >
        <MessageSquarePlus size={15} />
        {req.activityLog && req.activityLog.length > 1 && (
          <span className="ml-0.5 align-top text-[10px] font-semibold">{req.activityLog.filter((e) => e.type === "comment").length || ""}</span>
        )}
      </button>
      <button
        title="Delete"
        className={`${iconBtn} border-red-200 bg-red-50 text-red-700 hover:bg-red-100`}
        onClick={() => deleteRequest(req.id)}
        disabled={savingId === req.id}
      >
        <Trash2 size={15} />
      </button>
    </div>
  );

  if (loading) return (
    <div className="p-8">
      <h1 className="text-3xl font-bold mb-4">Maintenance Requests</h1>
      <p className="text-slate-500">Loading…</p>
    </div>
  );

  return (
    <div className="p-6 lg:p-8 max-w-[1600px] mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Maintenance Requests</h1>
        <button
          onClick={() => setShowCreateForm(!showCreateForm)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm font-medium"
        >
          {showCreateForm ? <X size={16} /> : <Plus size={16} />}
          {showCreateForm ? "Cancel" : "New Request"}
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm flex justify-between">
          {error}
          <button onClick={() => setError(null)}><X size={14} /></button>
        </div>
      )}
      {notice && (
        <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 text-sm flex items-center justify-between gap-3">
          <span className="flex items-center gap-2"><Check size={15} /> {notice.msg}</span>
          <span className="flex items-center gap-2 shrink-0">
            {notice.action && (
              <button
                onClick={() => { notice.action!.run(); setNotice(null); }}
                className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
              >
                <Mail size={13} /> {notice.action.label}
              </button>
            )}
            <button onClick={() => setNotice(null)} title="Dismiss" className="text-emerald-700 hover:text-emerald-900"><X size={14} /></button>
          </span>
        </div>
      )}

      {/* Create form */}
      {showCreateForm && (
        <div className="mb-8 bg-white rounded-lg border border-slate-200 p-6">
          <h2 className="text-lg font-semibold mb-4">Create New Maintenance Request</h2>
          <form onSubmit={handleCreateSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Property <span className="text-red-500">*</span></label>
                <select name="propertyId" value={createForm.propertyId} onChange={handleCreateChange} required className={inputCls}>
                  <option value="">Select property…</option>
                  {properties.map((p) => <option key={p.id} value={p.id}>{getShortPropertyName(p.address)}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Category</label>
                <select name="category" value={createForm.category} onChange={handleCreateChange} className={inputCls}>
                  {CATEGORY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Tenant Name <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  name="tenantName"
                  list={`create-tenant-names`}
                  value={createForm.tenantName}
                  onChange={(e) => {
                    const t = tenantsForProperty(createForm.propertyId).find((t) => t.name === e.target.value);
                    setCreateForm((f) => ({ ...f, tenantName: e.target.value, tenantEmail: t?.email || f.tenantEmail }));
                  }}
                  required
                  className={inputCls}
                  placeholder="Select or type…"
                />
                <datalist id="create-tenant-names">
                  {tenantsForProperty(createForm.propertyId).map((t) => <option key={t.email} value={t.name} />)}
                </datalist>
              </div>
              <div>
                <label className={labelCls}>Tenant Email <span className="text-red-500">*</span></label>
                <input
                  type="email"
                  name="tenantEmail"
                  list={`create-tenant-emails`}
                  value={createForm.tenantEmail}
                  onChange={(e) => {
                    const t = tenantsForProperty(createForm.propertyId).find((t) => t.email === e.target.value);
                    setCreateForm((f) => ({ ...f, tenantEmail: e.target.value, tenantName: t?.name || f.tenantName }));
                  }}
                  required
                  className={inputCls}
                  placeholder="Select or type…"
                />
                <datalist id="create-tenant-emails">
                  {tenantsForProperty(createForm.propertyId).map((t) => <option key={t.email} value={t.email} />)}
                </datalist>
              </div>
              <div>
                <label className={labelCls}>Estimated Cost ($)</label>
                <input type="number" step="0.01" name="cost" value={createForm.cost} onChange={handleCreateChange} className={inputCls} />
              </div>
            </div>
            <div>
              <label className={labelCls}>Description <span className="text-red-500">*</span></label>
              <textarea name="description" value={createForm.description} onChange={handleCreateChange} required rows={3} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Internal Notes</label>
              <textarea name="internalComments" value={createForm.internalComments} onChange={handleCreateChange} rows={2} className={inputCls} />
            </div>
            <div className="flex gap-2">
              <button type="submit" disabled={creating} className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-blue-300 text-sm font-medium">
                <Check size={14} /> {creating ? "Creating…" : "Create Request"}
              </button>
              <button type="button" onClick={() => setShowCreateForm(false)} className="px-4 py-2 bg-slate-200 text-slate-700 rounded-md hover:bg-slate-300 text-sm">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Filters */}
      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end w-full md:w-auto">
          <div className="w-full sm:max-w-xs">
            <label className="block text-sm font-medium mb-1 text-slate-700">Property</label>
            <select value={selectedPropertyId} onChange={(e) => setSelectedPropertyId(e.target.value)} className={inputCls}>
              <option value="all">All Properties</option>
              {properties.map((p) => <option key={p.id} value={p.id}>{getShortPropertyName(p.address)}</option>)}
            </select>
          </div>
          <div className="w-full sm:max-w-xs">
            <label className="block text-sm font-medium mb-1 text-slate-700">Search</label>
            <div className="relative">
              <Search size={16} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Tenant, email, description…"
                className={`${inputCls} pl-8`}
              />
              {search && (
                <button type="button" onClick={() => setSearch("")} title="Clear" className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  <X size={15} />
                </button>
              )}
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setShowClosed((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 shrink-0"
        >
          {showClosed ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          {showClosed ? "Hide Closed" : "Show Closed"}
        </button>
      </div>

      {/* Active Requests */}
      <div className="mb-8">
        <h2 className="text-xl font-semibold mb-3 text-slate-800">Active Requests ({activeRequests.length})</h2>
        {activeRequests.length === 0 ? (
          <div className="bg-white rounded-lg border border-slate-200 p-6 text-center text-slate-500">No active maintenance requests.</div>
        ) : (
          <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
            <div>
              <table className="w-full table-fixed">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-2.5 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider w-[9%]">Opened</th>
                    <th className="px-2.5 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider w-[5%]">Age</th>
                    <th className="px-2.5 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider w-[8%]">Property</th>
                    <th className="px-2.5 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider w-[14%]">Tenant</th>
                    <th className="px-2.5 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Description</th>
                    <th className="px-2.5 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider w-[8%]">Status</th>
                    <th className="px-2.5 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider w-[19%]">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {activeRequests.map((req) => {
                    const isRed = isRedRequest(req.createdAt);
                    return (
                      <React.Fragment key={req.id}>
                        <tr className={`transition-colors ${isRed ? "bg-red-50 hover:bg-red-100" : "hover:bg-slate-50"}`}>
                          <td className="px-3 py-3 align-top text-sm text-slate-600">{formatDateShort(req.createdAt)}</td>
                          <td className="px-3 py-3 align-top text-sm">
                            <span className={isRed ? "font-semibold text-red-700" : "text-slate-500"}>{getElapsedTime(req.createdAt)}</span>
                          </td>
                          <td className="px-3 py-3 align-top text-sm font-medium text-slate-900" title={req.propertyAddress}>
                            {getShortPropertyName(req.propertyAddress) || req.propertyId || "—"}
                          </td>
                          <td className="px-3 py-3 align-top text-sm">
                            <div className="font-medium text-slate-900">{req.tenantName}</div>
                            <div className="text-xs text-slate-500">{req.tenantEmail}</div>
                          </td>
                          <td className="px-3 py-3 align-top text-sm text-slate-700">
                            <p className="whitespace-normal break-words">{req.description}</p>
                            {req.schedulingDetails?.confirmed && (
                              <p className="text-xs text-emerald-700 mt-0.5">
                                Scheduled: {req.schedulingDetails.confirmed.date} ({req.schedulingDetails.confirmed.window})
                              </p>
                            )}
                            {req.internalComments && (
                              <p className="text-xs text-slate-400 italic mt-0.5">Note: {req.internalComments}</p>
                            )}
                            {req.attachments && req.attachments.length > 0 && (
                              <div className="flex gap-1 mt-1 flex-wrap">
                                {req.attachments.map((a, i) => (
                                  <a key={i} href={a.url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline flex items-center gap-0.5">
                                    <FileText size={11} /> {a.name}
                                  </a>
                                ))}
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-3 align-top text-sm">
                            <select
                              className="text-sm border border-slate-300 rounded-md px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                              value={req.status}
                              onChange={(e) => updateStatus(req.id, e.target.value)}
                              disabled={savingId === req.id}
                            >
                              <option value="open">Open</option>
                              <option value="in_progress">In Progress</option>
                              <option value="closed">Closed</option>
                            </select>
                          </td>
                          <td className="px-2 py-3 align-top">{renderActionButtons(req)}</td>
                        </tr>
                        {editingRequestId === req.id && renderEditPanel(req)}
                        {respondingRequestId === req.id && renderRespondPanel(req)}
                        {commentingId === req.id && renderCommentPanel(req)}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Closed Requests */}
      {showClosed && (
        <div>
          <h2 className="text-xl font-semibold mb-3 text-slate-800">Closed Requests ({closedRequests.length})</h2>
          {closedRequests.length === 0 ? (
            <div className="bg-white rounded-lg border border-slate-200 p-6 text-center text-slate-500">No closed requests.</div>
          ) : (
            <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
              <div>
                <table className="w-full table-fixed">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="px-2.5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider w-[9%]">Property</th>
                      <th className="px-2.5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider w-[14%]">Tenant</th>
                      <th className="px-2.5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Description</th>
                      <th className="px-2.5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider w-[9%]">Opened</th>
                      <th className="px-2.5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider w-[9%]">Closed</th>
                      <th className="px-2.5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider w-[7%]">Cost</th>
                      <th className="px-2.5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider w-[9%]">Accountable</th>
                      <th className="px-2.5 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider w-[16%]">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {closedRequests.map((req) => (
                      <React.Fragment key={req.id}>
                        <tr className="hover:bg-slate-50 text-sm">
                          <td className="px-3 py-3 align-top text-slate-700 font-medium">{getShortPropertyName(req.propertyAddress) || "—"}</td>
                          <td className="px-3 py-3 align-top">
                            <div className="text-slate-800">{req.tenantName}</div>
                            <div className="text-xs text-slate-400">{req.tenantEmail}</div>
                          </td>
                          <td className="px-3 py-3 align-top text-slate-600">
                            <p className="whitespace-normal break-words">{req.description}</p>
                            {req.closingNote && <p className="text-xs text-slate-500 italic mt-0.5">Close: {req.closingNote}</p>}
                            {req.internalComments && <p className="text-xs text-slate-400 italic mt-0.5">Note: {req.internalComments}</p>}
                            {req.attachments && req.attachments.length > 0 && (
                              <div className="flex gap-1 mt-1 flex-wrap">
                                {req.attachments.map((a, i) => (
                                  <a key={i} href={a.url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline flex items-center gap-0.5">
                                    <FileText size={11} /> {a.name}
                                  </a>
                                ))}
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-3 align-top text-slate-500">{formatDateShort(req.createdAt)}</td>
                          <td className="px-3 py-3 align-top text-slate-500">{formatDateShort(req.closedAt)}</td>
                          <td className="px-3 py-3 align-top text-slate-700 font-medium">
                            {req.cost != null ? `$${Number(req.cost).toFixed(2)}` : "—"}
                          </td>
                          <td className="px-3 py-3 align-top text-xs text-slate-600 capitalize">
                            {req.costAccountability?.replace("_", " ") || "—"}
                          </td>
                          <td className="px-2 py-3 align-top">{renderActionButtons(req, true)}</td>
                        </tr>
                        {editingRequestId === req.id && renderEditPanel(req)}
                        {commentingId === req.id && renderCommentPanel(req)}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
