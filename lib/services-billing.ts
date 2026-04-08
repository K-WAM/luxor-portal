import { parseDateOnly } from "@/lib/date-only";

export const SERVICES_BILLING_SCOPE = "services";
export const SERVICES_PLATFORM_SCOPE = "luxor_platform";
export const SERVICES_PORTAL_AREA = "services_billing";

export type ServicesInvoiceStatus =
  | "draft"
  | "issued"
  | "processing"
  | "paid"
  | "void";

export const getServicesInvoiceDisplayStatus = (
  status?: string | null,
  dueDate?: string | null
) => {
  const normalized = String(status || "issued").toLowerCase();
  if (normalized === "paid") return "Paid";
  if (normalized === "processing") return "Processing";
  if (normalized === "void") return "Void";
  if (normalized === "draft") return "Draft";

  const due = parseDateOnly(dueDate);
  if (!due) return "Issued";

  const now = new Date();
  const todayUtcMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return due.getTime() < todayUtcMs ? "Overdue" : "Issued";
};

export const getServicesInvoiceStatusBadgeClass = (label: string) => {
  switch (label) {
    case "Paid":
      return "bg-emerald-100 text-emerald-700";
    case "Processing":
      return "bg-blue-100 text-blue-700";
    case "Overdue":
      return "bg-red-100 text-red-700";
    case "Void":
      return "bg-slate-100 text-slate-600";
    case "Draft":
      return "bg-slate-100 text-slate-700";
    default:
      return "bg-amber-100 text-amber-800";
  }
};

export const buildServicesInvoicePath = (token: string) =>
  `/services-billing/invoices/${token}`;

export const getServicesInvoiceShortDescription = (description?: string | null) => {
  const normalized = String(description || "").replace(/\s+/g, " ").trim();
  if (!normalized) return "Service invoice";
  if (normalized.length <= 72) return normalized;
  return `${normalized.slice(0, 69).trimEnd()}...`;
};
