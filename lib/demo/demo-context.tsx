"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { calculateCanonicalMetrics, getPerformanceStatus } from "@/lib/calculations/canonical-metrics";
import { getDemoOwnerData, getDemoTenantData } from "@/lib/demo/demo-data";

type DemoAudience = "owner" | "tenant";

type DemoAuthOverride = {
  email: string;
  role: "owner" | "tenant";
  name: string;
};

type DemoContextValue = {
  active: boolean;
  audience: DemoAudience;
  basePath: string;
  viewerLabel: string;
  authOverride: DemoAuthOverride;
  withDemoPath: (path: string) => string;
};

const DemoContext = createContext<DemoContextValue>({
  active: false,
  audience: "owner",
  basePath: "",
  viewerLabel: "",
  authOverride: { email: "", role: "owner", name: "" },
  withDemoPath: (path: string) => path,
});

type DemoMaintenanceRequest = {
  id: string;
  propertyId: string;
  propertyAddress: string;
  tenantName: string;
  tenantEmail: string;
  category: string | null;
  description: string;
  status: string;
  createdAt: string;
  closedAt?: string | null;
  cost?: number;
  attachments?: { url: string; name: string; type?: string; size?: number }[];
  schedulingDetails?: {
    availability_options: { date: string; window: string }[];
    is_flexible: boolean;
    vendor_can_enter_without_tenant: boolean;
    confirmed?: { date: string; window: string; note?: string } | null;
  } | null;
};

type DemoOwnerBillRecord = {
  id: string;
  propertyId: string;
  propertyAddress: string;
  description: string;
  amount: number;
  dueDate: string;
  status: string;
  invoiceUrl?: string | null;
  paymentLinkUrl?: string | null;
  paymentMethod: string;
};

type DemoTenantBillRecord = {
  id: string;
  propertyId: string;
  propertyAddress: string;
  bill_type: string;
  description: string;
  amount: number;
  due_date: string;
  status: string;
  month: number;
  year: number;
  invoice_url?: string | null;
  payment_link_url?: string | null;
  paymentMethod: string;
};

type DemoDocumentRecord = {
  id: string;
  property_id: string;
  lease_agreement_id: string | null;
  document_type: string;
  title: string;
  file_url: string;
  visibility: string;
  created_at: string;
  name: string;
};

type DemoPropertyRecord = {
  id: string;
  address: string;
  name: string;
  target_monthly_rent: number;
  lease_start: string;
  lease_end: string;
  deposit: number;
  last_month_rent_collected: boolean;
  home_cost: number;
  home_repair_cost: number;
  closing_costs: number;
  total_cost: number;
  current_market_estimate: number;
  purchase_date: string;
  planned_garden_cost: number;
  planned_pool_cost: number;
  planned_hoa_cost: number;
  planned_pm_fee_monthly: number;
  current_tenant_names: string[];
};

const OWNER_AUTH_OVERRIDE: DemoAuthOverride = {
  email: "marina.holt@demo-owner.invalid",
  role: "owner",
  name: "Marina Holt",
};

const TENANT_AUTH_OVERRIDE: DemoAuthOverride = {
  email: "isaac.moreno@demo-tenant.invalid",
  role: "tenant",
  name: "Isaac Moreno",
};

const OWNER_MONTHLY_DATA: Record<string, Array<{
  month: number;
  year: number;
  rent_income: number;
  maintenance: number;
  pool: number;
  garden: number;
  hoa_payments: number;
  pm_fee: number;
  property_tax: number;
  property_market_estimate: number | null;
}>> = {
  pal248: [
    { month: 1, year: 2026, rent_income: 0, maintenance: 0, pool: 120, garden: 95, hoa_payments: 0, pm_fee: 0, property_tax: 0, property_market_estimate: 611000 },
    { month: 2, year: 2026, rent_income: 0, maintenance: 0, pool: 120, garden: 95, hoa_payments: 0, pm_fee: 0, property_tax: 0, property_market_estimate: 614000 },
    { month: 3, year: 2026, rent_income: 0, maintenance: 180, pool: 120, garden: 95, hoa_payments: 0, pm_fee: 0, property_tax: 0, property_market_estimate: 617000 },
    { month: 4, year: 2026, rent_income: 0, maintenance: 0, pool: 120, garden: 95, hoa_payments: 0, pm_fee: 0, property_tax: 0, property_market_estimate: 620000 },
    { month: 5, year: 2026, rent_income: 3800, maintenance: 75, pool: 120, garden: 95, hoa_payments: 0, pm_fee: 304, property_tax: 0, property_market_estimate: 625000 },
  ],
  cor512: [
    { month: 1, year: 2026, rent_income: 0, maintenance: 0, pool: 0, garden: 0, hoa_payments: 220, pm_fee: 0, property_tax: 0, property_market_estimate: 534000 },
    { month: 2, year: 2026, rent_income: 3400, maintenance: 0, pool: 0, garden: 0, hoa_payments: 220, pm_fee: 272, property_tax: 0, property_market_estimate: 536000 },
    { month: 3, year: 2026, rent_income: 3400, maintenance: 0, pool: 0, garden: 0, hoa_payments: 220, pm_fee: 272, property_tax: 0, property_market_estimate: 539000 },
    { month: 4, year: 2026, rent_income: 3400, maintenance: 210, pool: 0, garden: 0, hoa_payments: 220, pm_fee: 272, property_tax: 0, property_market_estimate: 542000 },
    { month: 5, year: 2026, rent_income: 3400, maintenance: 0, pool: 0, garden: 0, hoa_payments: 220, pm_fee: 272, property_tax: 0, property_market_estimate: 545000 },
  ],
  sun904: [
    { month: 1, year: 2026, rent_income: 0, maintenance: 0, pool: 0, garden: 0, hoa_payments: 0, pm_fee: 0, property_tax: 0, property_market_estimate: 1245000 },
    { month: 2, year: 2026, rent_income: 6900, maintenance: 0, pool: 0, garden: 140, hoa_payments: 390, pm_fee: 552, property_tax: 0, property_market_estimate: 1256000 },
    { month: 3, year: 2026, rent_income: 6900, maintenance: 0, pool: 0, garden: 140, hoa_payments: 390, pm_fee: 552, property_tax: 0, property_market_estimate: 1267000 },
    { month: 4, year: 2026, rent_income: 6900, maintenance: 420, pool: 0, garden: 140, hoa_payments: 390, pm_fee: 552, property_tax: 0, property_market_estimate: 1274000 },
    { month: 5, year: 2026, rent_income: 6900, maintenance: 0, pool: 0, garden: 140, hoa_payments: 390, pm_fee: 552, property_tax: 0, property_market_estimate: 1280000 },
  ],
};

const buildPlaceholderFileUrl = (title: string) =>
  `data:text/plain;charset=utf-8,${encodeURIComponent(`Demo document placeholder: ${title}`)}`;

const toPropertyRecords = () => {
  const ownerData = getDemoOwnerData();
  return ownerData.properties.map((property, index) => ({
    id: property.id,
    address: `${property.address}, ${property.cityState}`,
    name: property.shortName,
    target_monthly_rent: property.monthlyRent,
    lease_start: property.leaseStart,
    lease_end: property.leaseEnd,
    deposit: property.deposit,
    last_month_rent_collected: false,
    home_cost: property.costBasis - [18000, 12000, 26000][index],
    home_repair_cost: [12000, 8000, 18000][index],
    closing_costs: [6000, 5000, 8000][index],
    total_cost: property.costBasis,
    current_market_estimate: property.marketValue,
    purchase_date: ["2023-01-15", "2022-10-01", "2021-07-20"][index],
    planned_garden_cost: property.id === "pal248" ? 95 : property.id === "sun904" ? 140 : 0,
    planned_pool_cost: property.id === "pal248" ? 120 : 0,
    planned_hoa_cost: property.id === "cor512" ? 220 : property.id === "sun904" ? 390 : 0,
    planned_pm_fee_monthly: Math.round(property.monthlyRent * 0.08),
    current_tenant_names: [property.tenantName],
  }));
};

const toOwnerBills = () => {
  const ownerData = getDemoOwnerData();
  const properties = toPropertyRecords();
  const propertyById = new Map(properties.map((property) => [property.id, property]));
  return ownerData.bills.map((bill) => ({
    id: bill.id,
    propertyId: bill.propertyId,
    propertyAddress: propertyById.get(bill.propertyId)?.address || bill.propertyId,
    description: bill.description,
    amount: bill.amount,
    dueDate: bill.dueDate,
    status: bill.status,
    paymentMethod: bill.paymentMethod,
    invoiceUrl: buildPlaceholderFileUrl(bill.description),
    paymentLinkUrl: null,
  }));
};

const toTenantBills = () => {
  const tenantData = getDemoTenantData();
  const properties = toPropertyRecords();
  const baseBills = tenantData.bills.map((bill) => {
    const property = properties[0];
    const due = new Date(`${bill.dueDate}T00:00:00`);
    return {
      id: bill.id,
      propertyId: bill.propertyId,
      propertyAddress: property.address,
      bill_type:
        bill.category.toLowerCase().includes("rent") ? "rent" :
        bill.category.toLowerCase().includes("deposit") ? "security_deposit" :
        bill.category.toLowerCase().includes("fee") ? "late_fee" :
        "fee",
      description: bill.description,
      amount: bill.amount,
      due_date: bill.dueDate,
      status: bill.status,
      month: due.getMonth() + 1,
      year: due.getFullYear(),
      paymentMethod: bill.paymentMethod,
      invoice_url: buildPlaceholderFileUrl(bill.description),
      payment_link_url: null,
    };
  });

  const supplementalBills: DemoTenantBillRecord[] = [
    {
      id: "demo-cor-rent-may",
      propertyId: "cor512",
      propertyAddress: properties.find((item) => item.id === "cor512")?.address || "COR512",
      bill_type: "rent",
      description: "Monthly Rent - May 2026",
      amount: 3400,
      due_date: "2026-05-01",
      status: "paid",
      month: 5,
      year: 2026,
      paymentMethod: "card",
      invoice_url: buildPlaceholderFileUrl("Monthly Rent - May 2026"),
      payment_link_url: null,
    },
    {
      id: "demo-sun-rent-may",
      propertyId: "sun904",
      propertyAddress: properties.find((item) => item.id === "sun904")?.address || "SUN904",
      bill_type: "rent",
      description: "Monthly Rent - May 2026",
      amount: 6900,
      due_date: "2026-05-01",
      status: "processing",
      month: 5,
      year: 2026,
      paymentMethod: "ach",
      invoice_url: buildPlaceholderFileUrl("Monthly Rent - May 2026"),
      payment_link_url: null,
    },
  ];

  return [...baseBills, ...supplementalBills];
};

const toDocuments = () => {
  const ownerData = getDemoOwnerData();
  return ownerData.documents.map((document) => ({
    id: document.id,
    property_id: document.propertyId,
    lease_agreement_id: document.scope === "Lease-specific" ? `${document.propertyId}-lease-1` : null,
    document_type: document.type,
    title: document.title,
    file_url: buildPlaceholderFileUrl(document.title),
    visibility: "all",
    created_at: `${document.uploadedAt}T12:00:00.000Z`,
    name: `${document.title}.pdf`,
  }));
};

const mapMaintenanceStatus = (status: string) => {
  switch (status) {
    case "Scheduled":
      return "in_progress";
    case "In Progress":
      return "in_progress";
    case "Completed":
      return "closed";
    case "Closed":
      return "closed";
    default:
      return "open";
  }
};

const toMaintenanceRequests = () => {
  const ownerData = getDemoOwnerData();
  const properties = toPropertyRecords();
  const propertyById = new Map(properties.map((property) => [property.id, property.address]));
  return ownerData.maintenance.map((item) => ({
    id: item.id,
    propertyId: item.propertyId,
    propertyAddress: propertyById.get(item.propertyId) || item.propertyId,
    tenantName: properties.find((property) => property.id === item.propertyId)?.current_tenant_names?.[0] || "Resident",
    tenantEmail: item.propertyId === "sun904" ? "trustees@harbor-view-demo.invalid" : item.propertyId === "cor512" ? "camila.reyes@demo-tenant.invalid" : "isaac.moreno@demo-tenant.invalid",
    category: item.category,
    description: item.details,
    status: mapMaintenanceStatus(item.status),
    createdAt: `${item.openedAt}T09:00:00.000Z`,
    closedAt: item.status === "Completed" || item.status === "Closed" ? `${item.openedAt}T17:00:00.000Z` : null,
    cost: item.propertyId === "sun904" ? 420 : item.propertyId === "cor512" ? 210 : 185,
    attachments: [],
    schedulingDetails:
      item.status === "Scheduled"
        ? {
            availability_options: [
              { date: item.openedAt, window: "morning" },
              { date: item.openedAt, window: "afternoon" },
              { date: item.openedAt, window: "evening" },
            ],
            is_flexible: true,
            vendor_can_enter_without_tenant: true,
            confirmed: { date: item.openedAt, window: "afternoon", note: "Demo scheduling confirmation." },
          }
        : null,
  }));
};

const buildOwnerReportsPayload = (properties: DemoPropertyRecord[], tenantBills: DemoTenantBillRecord[], maintenanceRequests: DemoMaintenanceRequest[]) => {
  const now = new Date("2026-05-03T12:00:00.000Z");
  const overviewRows = properties.map((property) => {
    const leaseEnd = new Date(`${property.lease_end}T00:00:00`);
    const diffDays = (leaseEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    const status = diffDays < 90 ? "expiring" : "occupied";
    return {
      propertyId: property.id,
      address: property.address,
      currentRent: property.target_monthly_rent,
      leaseStart: property.lease_start,
      leaseEnd: property.lease_end,
      status,
      tenantNames: property.current_tenant_names,
      tenantEmails: property.id === "sun904" ? ["trustees@harbor-view-demo.invalid"] : property.id === "cor512" ? ["camila.reyes@demo-tenant.invalid"] : ["isaac.moreno@demo-tenant.invalid"],
    };
  });

  const paymentRows = tenantBills.map((bill) => ({
    id: bill.id,
    propertyId: bill.propertyId,
    propertyAddress: bill.propertyAddress,
    description: bill.description,
    amount: bill.amount,
    dueDate: bill.due_date,
    status: bill.status,
    displayStatus:
      bill.status === "paid" ? "Paid" :
      bill.status === "processing" ? "Processing" :
      bill.status === "overdue" ? "Overdue" :
      bill.status === "voided" ? "Voided" : "Future",
    tenantNames: properties.find((property) => property.id === bill.propertyId)?.current_tenant_names || [],
    tenantEmails: bill.propertyId === "sun904" ? ["trustees@harbor-view-demo.invalid"] : bill.propertyId === "cor512" ? ["camila.reyes@demo-tenant.invalid"] : ["isaac.moreno@demo-tenant.invalid"],
  }));

  const maintenanceRows = maintenanceRequests.map((request) => ({
    id: request.id,
    propertyId: request.propertyId,
    propertyAddress: request.propertyAddress,
    tenantName: request.tenantName,
    tenantEmail: request.tenantEmail,
    description: request.description,
    status: request.status,
    createdAt: request.createdAt,
    closedAt: request.closedAt,
  }));

  return { overviewRows, paymentRows, maintenanceRows };
};

const buildFinancialMetricsPayload = (propertyId: string, year: number) => {
  const property = toPropertyRecords().find((item) => item.id === propertyId);
  if (!property) return null;
  const monthlyRaw = (OWNER_MONTHLY_DATA[propertyId] || []).filter((item) => item.year === year);
  const monthly = Array.from({ length: 12 }, (_, index) => {
    const month = index + 1;
    const existing = monthlyRaw.find((item) => item.month === month);
    const base = existing || {
      month,
      year,
      rent_income: 0,
      maintenance: 0,
      pool: 0,
      garden: 0,
      hoa_payments: 0,
      pm_fee: 0,
      property_tax: 0,
      property_market_estimate: null,
    };
    const totalExpenses = base.maintenance + base.pool + base.garden + base.hoa_payments + base.pm_fee + base.property_tax;
    return {
      month,
      year,
      month_name: new Date(year, month - 1, 1).toLocaleDateString("en-US", { month: "short", year: "2-digit" }),
      rent_income: base.rent_income,
      maintenance: base.maintenance,
      pool: base.pool,
      garden: base.garden,
      hoa_payments: base.hoa_payments,
      pm_fee: base.pm_fee,
      total_expenses: totalExpenses,
      net_income: base.rent_income - totalExpenses,
      property_tax: base.property_tax,
      property_market_estimate: base.property_market_estimate,
      updated_at: `${year}-${String(month).padStart(2, "0")}-01T12:00:00.000Z`,
    };
  });

  const canonicalMetrics = calculateCanonicalMetrics(property, monthly, { multiYear: false });
  const status = getPerformanceStatus(canonicalMetrics);

  const planTarget = {
    target_type: "plan",
    rent_income: property.target_monthly_rent * 12,
    maintenance: property.id === "sun904" ? 3600 : property.id === "cor512" ? 2400 : 2200,
    pool: property.planned_pool_cost * 12,
    garden: property.planned_garden_cost * 12,
    hoa: property.planned_hoa_cost * 12,
    property_tax: property.id === "sun904" ? 0 : 0,
    total_expenses: 0,
    net_income: 0,
    maintenance_percentage_target: 5,
  };
  planTarget.total_expenses = planTarget.maintenance + planTarget.pool + planTarget.garden + planTarget.hoa + planTarget.property_tax + property.planned_pm_fee_monthly * 12;
  planTarget.net_income = planTarget.rent_income - planTarget.total_expenses;

  return {
    property,
    monthly,
    metrics: {
      ytd: canonicalMetrics.ytd,
      cost_basis: canonicalMetrics.cost_basis,
      current_market_value: canonicalMetrics.current_market_value,
      appreciation_value: canonicalMetrics.appreciation_value,
      appreciation_pct: canonicalMetrics.appreciation_pct,
      roi_pre_tax: canonicalMetrics.roi_pre_tax,
      roi_post_tax: canonicalMetrics.roi_post_tax,
      roi_with_appreciation: canonicalMetrics.roi_with_appreciation,
      roi_if_sold_today: canonicalMetrics.roi_if_sold_today,
      maintenance_pct: canonicalMetrics.maintenance_pct,
      months_owned: canonicalMetrics.months_owned,
      status,
    },
    planTarget,
    yeTarget: planTarget,
  };
};

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const parseUrl = (input: RequestInfo | URL) => {
  if (typeof input === "string") return new URL(input, window.location.origin);
  if (input instanceof URL) return input;
  return new URL(input.url);
};

export function DemoModeProvider({
  audience,
  children,
}: {
  audience: DemoAudience;
  children: React.ReactNode;
}) {
  const [ownerBills, setOwnerBills] = useState<DemoOwnerBillRecord[]>(() => toOwnerBills());
  const [tenantBills, setTenantBills] = useState<DemoTenantBillRecord[]>(() => toTenantBills());
  const [maintenanceRequests, setMaintenanceRequests] = useState<DemoMaintenanceRequest[]>(() => toMaintenanceRequests());
  const properties = useMemo(() => toPropertyRecords(), []);
  const documents = useMemo(() => toDocuments(), []);

  const basePath = audience === "owner" ? "/demo/owner" : "/demo/tenant";
  const authOverride = audience === "owner" ? OWNER_AUTH_OVERRIDE : TENANT_AUTH_OVERRIDE;
  const viewerLabel = `${authOverride.email} (${authOverride.role})`;

  const stateRef = useRef({
    audience,
    properties,
    documents,
    ownerBills,
    tenantBills,
    maintenanceRequests,
  });

  useEffect(() => {
    stateRef.current = {
      audience,
      properties,
      documents,
      ownerBills,
      tenantBills,
      maintenanceRequests,
    };
  }, [audience, properties, documents, ownerBills, tenantBills, maintenanceRequests]);

  useEffect(() => {
    const originalFetch = window.fetch.bind(window);

    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = parseUrl(input);
      const method = (init?.method || (typeof input !== "string" && !(input instanceof URL) ? input.method : "GET") || "GET").toUpperCase();
      const propertyId = url.searchParams.get("propertyId");
      const current = stateRef.current;

      if (url.pathname === "/api/me" && method === "GET") {
        return jsonResponse({
          email: authOverride.email,
          role: authOverride.role,
          user_id: `demo-${authOverride.role}`,
          properties: current.properties.map((property) => ({ id: property.id, address: property.address })),
        });
      }

      if (url.pathname === "/api/properties" && method === "GET") {
        const rows = current.audience === "tenant" ? current.properties.filter((property) => property.id === "pal248") : current.properties;
        return jsonResponse(rows);
      }

      if (url.pathname === "/api/owner/reports" && method === "GET") {
        return jsonResponse(buildOwnerReportsPayload(current.properties, current.tenantBills, current.maintenanceRequests));
      }

      if (url.pathname === "/api/owner/financial-metrics" && method === "GET") {
        const selectedPropertyId = url.searchParams.get("propertyId");
        const year = Number(url.searchParams.get("year") || 2026);
        const payload = selectedPropertyId ? buildFinancialMetricsPayload(selectedPropertyId, year) : null;
        return payload ? jsonResponse(payload) : jsonResponse({ error: "Property not found" }, 404);
      }

      if (url.pathname === "/api/owner-billing" && method === "GET") {
        return jsonResponse({
          rows: [
            {
              propertyId: propertyId || current.properties[0]?.id || "pal248",
              ownerEmail: authOverride.email,
              zelleEmail: "demo-payments@luxordev.example",
              zellePhone: null,
              zelleRecipient: "Luxor Demo Holdings",
            },
          ],
          warning: null,
        });
      }

      if (url.pathname === "/api/owner/billing" && method === "GET") {
        return jsonResponse(
          current.ownerBills.filter((bill) => !propertyId || bill.propertyId === propertyId)
        );
      }

      if (url.pathname === "/api/owner/billing" && method === "GET") {
        return jsonResponse(current.ownerBills);
      }

      if (url.pathname === "/api/tenant/billing" && method === "GET") {
        const rows = current.tenantBills
          .filter((bill) => !propertyId || bill.propertyId === propertyId)
          .map((bill) => ({
            id: bill.id,
            property_id: bill.propertyId,
            bill_type: bill.bill_type,
            description: bill.description,
            amount: bill.amount,
            due_date: bill.due_date,
            status: bill.status,
            month: bill.month,
            year: bill.year,
            invoice_url: bill.invoice_url,
            payment_link_url: bill.payment_link_url,
          }));
        return jsonResponse({ rows });
      }

      if (url.pathname === "/api/documents" && method === "GET") {
        const rows = current.documents.filter((document) => !propertyId || document.property_id === propertyId);
        return jsonResponse(rows);
      }

      if (url.pathname === "/api/maintenance" && method === "GET") {
        const rows =
          current.audience === "tenant"
            ? current.maintenanceRequests.filter((request) => request.propertyId === "pal248")
            : current.maintenanceRequests;
        return jsonResponse(rows);
      }

      if (url.pathname === "/api/maintenance/attachments" && method === "POST") {
        const formData = init?.body instanceof FormData ? init.body : null;
        const files = formData ? formData.getAll("files").filter((entry): entry is File => entry instanceof File) : [];
        const attachments = files.map((file, index) => ({
          url: URL.createObjectURL(file),
          name: file.name || `demo-attachment-${index + 1}`,
          type: file.type,
          size: file.size,
        }));
        return jsonResponse({ attachments });
      }

      if (url.pathname === "/api/maintenance" && method === "POST") {
        const body = init?.body ? JSON.parse(String(init.body)) : {};
        const property = current.properties.find((item) => item.id === body.propertyId) || current.properties[0];
        const newRequest: DemoMaintenanceRequest = {
          id: `demo-maint-${Date.now()}`,
          propertyId: property.id,
          propertyAddress: property.address,
          tenantName: body.tenantName || TENANT_AUTH_OVERRIDE.name,
          tenantEmail: body.tenantEmail || TENANT_AUTH_OVERRIDE.email,
          category: body.category || "General",
          description: body.description || "Demo maintenance request",
          status: "open",
          createdAt: new Date().toISOString(),
          closedAt: null,
          attachments: body.attachments || [],
          schedulingDetails: body.schedulingDetails || null,
        };
        setMaintenanceRequests((prev) => [newRequest, ...prev]);
        return jsonResponse({
          id: newRequest.id,
          property_id: newRequest.propertyId,
          tenant_name: newRequest.tenantName,
          tenant_email: newRequest.tenantEmail,
          category: newRequest.category,
          description: newRequest.description,
          status: newRequest.status,
          created_at: newRequest.createdAt,
        });
      }

      if (url.pathname === "/api/billing/create-checkout-session" && method === "POST") {
        const body = init?.body ? JSON.parse(String(init.body)) : {};
        const paymentMethod = body.paymentMethod === "bank" ? "ach" : "card";
        const nextStatus = paymentMethod === "ach" ? "processing" : "paid";
        let updatedRows: DemoOwnerBillRecord[] = [];
        setOwnerBills((prev) => {
          updatedRows = prev.map((bill) =>
            Array.isArray(body.selectedInvoiceIds) && body.selectedInvoiceIds.includes(bill.id)
              ? { ...bill, status: nextStatus, paymentMethod }
              : bill
          );
          return updatedRows;
        });
        return jsonResponse({
          demoMode: true,
          status: nextStatus,
          bills: updatedRows,
          message:
            paymentMethod === "ach"
              ? "Demo ACH payment submitted. This bill is now Processing. Bank transfers may take 2-4 business days to be confirmed."
              : "Demo payment confirmed. This bill has been marked Paid for demonstration purposes.",
        });
      }

      if (url.pathname === "/api/tenant/payments/create-checkout-session" && method === "POST") {
        const body = init?.body ? JSON.parse(String(init.body)) : {};
        const paymentMethod = body.method === "ach" ? "ach" : "card";
        const nextStatus = paymentMethod === "ach" ? "processing" : "paid";
        let updatedRows: DemoTenantBillRecord[] = [];
        setTenantBills((prev) => {
          updatedRows = prev.map((bill) =>
            bill.id === body.tenant_bill_id ? { ...bill, status: nextStatus, paymentMethod } : bill
          );
          return updatedRows;
        });
        return jsonResponse({
          demoMode: true,
          status: nextStatus,
          bills: updatedRows,
          message:
            paymentMethod === "ach"
              ? "Demo ACH payment submitted. This bill is now Processing. Bank transfers may take 2-4 business days to be confirmed."
              : "Demo payment confirmed. This bill has been marked Paid for demonstration purposes.",
        });
      }

      return originalFetch(input, init);
    };

    return () => {
      window.fetch = originalFetch;
    };
  }, [authOverride, audience]);

  const value = useMemo<DemoContextValue>(() => ({
    active: true,
    audience,
    basePath,
    viewerLabel,
    authOverride,
    withDemoPath: (path: string) => {
      if (audience === "owner") {
        return path === "/owner" ? "/demo/owner" : path.replace(/^\/owner/, "/demo/owner");
      }
      return path === "/tenant" ? "/demo/tenant" : path.replace(/^\/tenant/, "/demo/tenant");
    },
  }), [audience, authOverride, basePath, viewerLabel]);

  return <DemoContext.Provider value={value}>{children}</DemoContext.Provider>;
}

export const useDemoMode = () => useContext(DemoContext);
