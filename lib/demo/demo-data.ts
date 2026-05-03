export type DemoPaymentMethod = "card" | "ach" | "manual" | "online";
export type DemoBillStatus = "paid" | "processing" | "due" | "overdue" | "voided";
export type DemoMaintenanceStatus = "Open" | "Scheduled" | "In Progress" | "Completed" | "Closed";

export type DemoProperty = {
  id: string;
  shortName: string;
  address: string;
  cityState: string;
  type: string;
  marketValue: number;
  costBasis: number;
  monthlyRent: number;
  leaseStart: string;
  leaseEnd: string;
  tenantName: string;
  deposit: number;
};

export type DemoOwnerBill = {
  id: string;
  propertyId: string;
  description: string;
  category: string;
  amount: number;
  dueDate: string;
  status: DemoBillStatus;
  paymentMethod: DemoPaymentMethod;
};

export type DemoTenantBill = {
  id: string;
  propertyId: string;
  description: string;
  category: string;
  amount: number;
  dueDate: string;
  status: DemoBillStatus;
  paymentMethod: DemoPaymentMethod;
};

export type DemoDocument = {
  id: string;
  propertyId: string;
  title: string;
  type: string;
  scope: "Property-wide" | "Lease-specific";
  uploadedAt: string;
};

export type DemoMaintenanceItem = {
  id: string;
  propertyId: string;
  title: string;
  status: DemoMaintenanceStatus;
  category: string;
  openedAt: string;
  details: string;
};

export type DemoMonthlyPoint = {
  month: string;
  income: number;
  expenses: number;
  net: number;
};

export type DemoOwnerReport = {
  ytdIncome: number;
  ytdExpenses: number;
  netIncome: number;
  roi: number;
  maintenanceBurden: number;
  appreciation: number;
  currentValueVsCostBasis: number;
  paymentHistory: { month: string; collected: number; outstanding: number }[];
  expenseSummary: { label: string; amount: number }[];
  monthlyTrend: DemoMonthlyPoint[];
  timeline: { propertyId: string; milestones: { label: string; date: string }[] }[];
};

export type DemoTenantSnapshot = {
  residentName: string;
  residentEmail: string;
  leaseLabel: string;
  upcomingBalance: number;
  openMaintenanceCount: number;
};

const demoProperties: DemoProperty[] = [
  {
    id: "pal248",
    shortName: "PAL248",
    address: "248 Palm Ridge Court",
    cityState: "Fort Lauderdale, FL",
    type: "Single-family home with pool",
    marketValue: 625000,
    costBasis: 505000,
    monthlyRent: 3800,
    leaseStart: "2026-05-01",
    leaseEnd: "2027-04-30",
    tenantName: "Isaac Moreno",
    deposit: 7600,
  },
  {
    id: "cor512",
    shortName: "COR512",
    address: "512 Coral Bay Drive",
    cityState: "Boca Raton, FL",
    type: "Townhome",
    marketValue: 545000,
    costBasis: 470000,
    monthlyRent: 3400,
    leaseStart: "2026-02-01",
    leaseEnd: "2027-01-31",
    tenantName: "Camila Reyes",
    deposit: 6800,
  },
  {
    id: "sun904",
    shortName: "SUN904",
    address: "904 Sunset Harbor Lane",
    cityState: "Delray Beach, FL",
    type: "Single-family home / HOA",
    marketValue: 1280000,
    costBasis: 1040000,
    monthlyRent: 6900,
    leaseStart: "2026-02-01",
    leaseEnd: "2028-01-31",
    tenantName: "Harbor View Family Trust",
    deposit: 13800,
  },
];

const demoOwnerBills: DemoOwnerBill[] = [
  { id: "ob-1", propertyId: "pal248", description: "Property Management Fee - May 2026", category: "Property Management Fee", amount: 304, dueDate: "2026-05-08", status: "due", paymentMethod: "online" },
  { id: "ob-2", propertyId: "pal248", description: "Monthly Portal Subscription", category: "Monthly Portal Subscription", amount: 49, dueDate: "2026-05-01", status: "paid", paymentMethod: "card" },
  { id: "ob-3", propertyId: "pal248", description: "Pool Pump Inspection Reimbursement", category: "Maintenance / Repair", amount: 185, dueDate: "2026-04-22", status: "processing", paymentMethod: "ach" },
  { id: "ob-4", propertyId: "cor512", description: "Leasing Coordination Fee", category: "Administrative", amount: 325, dueDate: "2026-04-10", status: "paid", paymentMethod: "manual" },
  { id: "ob-5", propertyId: "cor512", description: "Plumbing Repair Reimbursement", category: "Maintenance / Repair", amount: 210, dueDate: "2026-04-14", status: "overdue", paymentMethod: "online" },
  { id: "ob-6", propertyId: "cor512", description: "Insurance Document Processing", category: "Administrative", amount: 95, dueDate: "2026-03-29", status: "voided", paymentMethod: "manual" },
  { id: "ob-7", propertyId: "sun904", description: "Lease Renewal Administration Fee", category: "Administrative", amount: 250, dueDate: "2026-05-12", status: "due", paymentMethod: "online" },
  { id: "ob-8", propertyId: "sun904", description: "HVAC Diagnostic Reimbursement", category: "Maintenance / Repair", amount: 420, dueDate: "2026-04-18", status: "paid", paymentMethod: "card" },
  { id: "ob-9", propertyId: "sun904", description: "Vendor Coordination Fee", category: "Administrative", amount: 120, dueDate: "2026-05-15", status: "processing", paymentMethod: "ach" },
  { id: "ob-10", propertyId: "sun904", description: "Annual Inspection Report", category: "Property-related", amount: 145, dueDate: "2026-05-20", status: "due", paymentMethod: "online" },
];

const demoTenantBills: DemoTenantBill[] = [
  { id: "tb-1", propertyId: "pal248", description: "Monthly Rent - May 2026", category: "Rent", amount: 3800, dueDate: "2026-05-01", status: "due", paymentMethod: "online" },
  { id: "tb-2", propertyId: "pal248", description: "Past Due Rent - April 2026", category: "Past Due Rent", amount: 3800, dueDate: "2026-04-01", status: "overdue", paymentMethod: "online" },
  { id: "tb-3", propertyId: "pal248", description: "Partial Rent Balance", category: "Rent", amount: 650, dueDate: "2026-04-15", status: "processing", paymentMethod: "ach" },
  { id: "tb-4", propertyId: "pal248", description: "Late Payment Fee", category: "Fee", amount: 95, dueDate: "2026-04-07", status: "due", paymentMethod: "online" },
  { id: "tb-5", propertyId: "pal248", description: "Water Reimbursement", category: "Utilities / Reimbursement", amount: 48, dueDate: "2026-05-03", status: "paid", paymentMethod: "card" },
  { id: "tb-6", propertyId: "pal248", description: "HOA Access Card Replacement", category: "Utilities / Reimbursement", amount: 35, dueDate: "2026-05-09", status: "voided", paymentMethod: "manual" },
  { id: "tb-7", propertyId: "pal248", description: "Drain Clearing Chargeback", category: "Maintenance / Tenant Responsible", amount: 115, dueDate: "2026-05-18", status: "due", paymentMethod: "online" },
  { id: "tb-8", propertyId: "pal248", description: "Security Deposit", category: "Move-in / Lease-related", amount: 7600, dueDate: "2026-05-01", status: "paid", paymentMethod: "manual" },
  { id: "tb-9", propertyId: "pal248", description: "Last Month Rent", category: "Move-in / Lease-related", amount: 3800, dueDate: "2026-05-01", status: "paid", paymentMethod: "card" },
  { id: "tb-10", propertyId: "pal248", description: "Pet Fee", category: "Move-in / Lease-related", amount: 300, dueDate: "2026-05-01", status: "paid", paymentMethod: "manual" },
];

const demoDocuments: DemoDocument[] = [
  { id: "doc-1", propertyId: "pal248", title: "Lease Agreement", type: "Lease Agreement", scope: "Lease-specific", uploadedAt: "2026-05-01" },
  { id: "doc-2", propertyId: "pal248", title: "Move-in Inspection Report", type: "Inspection", scope: "Lease-specific", uploadedAt: "2026-05-01" },
  { id: "doc-3", propertyId: "pal248", title: "HOA Rules", type: "Rules", scope: "Property-wide", uploadedAt: "2026-04-20" },
  { id: "doc-4", propertyId: "cor512", title: "Insurance Certificate", type: "Insurance", scope: "Property-wide", uploadedAt: "2026-03-10" },
  { id: "doc-5", propertyId: "sun904", title: "Maintenance Invoice", type: "Maintenance", scope: "Property-wide", uploadedAt: "2026-04-18" },
  { id: "doc-6", propertyId: "sun904", title: "Owner Statement", type: "Statement", scope: "Property-wide", uploadedAt: "2026-04-30" },
  { id: "doc-7", propertyId: "sun904", title: "Rent Ledger", type: "Ledger", scope: "Lease-specific", uploadedAt: "2026-05-01" },
  { id: "doc-8", propertyId: "cor512", title: "Property Inspection Summary", type: "Inspection", scope: "Property-wide", uploadedAt: "2026-02-15" },
];

const demoMaintenance: DemoMaintenanceItem[] = [
  { id: "m-1", propertyId: "pal248", title: "Pool pump inspection", status: "Scheduled", category: "Pool", openedAt: "2026-05-02", details: "Routine inspection before summer turnover." },
  { id: "m-2", propertyId: "pal248", title: "HVAC diagnostic", status: "Completed", category: "HVAC", openedAt: "2026-04-11", details: "Cooling performance inspected and filter replaced." },
  { id: "m-3", propertyId: "cor512", title: "Plumbing leak under sink", status: "In Progress", category: "Plumbing", openedAt: "2026-04-27", details: "Cabinet moisture noted, vendor follow-up scheduled." },
  { id: "m-4", propertyId: "cor512", title: "Paint touch-up after move-in", status: "Closed", category: "Interior", openedAt: "2026-03-08", details: "Minor wall repair and touch-up completed." },
  { id: "m-5", propertyId: "sun904", title: "Landscaping review", status: "Open", category: "Landscaping", openedAt: "2026-05-01", details: "Seasonal trim quote pending." },
  { id: "m-6", propertyId: "sun904", title: "Electrical outlet repair", status: "Scheduled", category: "Electrical", openedAt: "2026-04-22", details: "Living room outlet replacement scheduled." },
  { id: "m-7", propertyId: "sun904", title: "Appliance repair", status: "Completed", category: "Appliance", openedAt: "2026-04-02", details: "Dishwasher circulation pump replaced." },
];

const ownerReport: DemoOwnerReport = {
  ytdIncome: 70500,
  ytdExpenses: 14380,
  netIncome: 56120,
  roi: 5.34,
  maintenanceBurden: 4.18,
  appreciation: 435000,
  currentValueVsCostBasis: 475000,
  paymentHistory: [
    { month: "Jan 2026", collected: 14100, outstanding: 0 },
    { month: "Feb 2026", collected: 14100, outstanding: 0 },
    { month: "Mar 2026", collected: 14100, outstanding: 0 },
    { month: "Apr 2026", collected: 14100, outstanding: 650 },
    { month: "May 2026", collected: 10700, outstanding: 3800 },
  ],
  expenseSummary: [
    { label: "Property Management", amount: 3690 },
    { label: "Maintenance", amount: 2950 },
    { label: "HOA / Pool / Garden", amount: 4410 },
    { label: "Administrative", amount: 3330 },
  ],
  monthlyTrend: [
    { month: "Jan", income: 14100, expenses: 2600, net: 11500 },
    { month: "Feb", income: 14100, expenses: 2450, net: 11650 },
    { month: "Mar", income: 14100, expenses: 2890, net: 11210 },
    { month: "Apr", income: 14100, expenses: 3190, net: 10910 },
    { month: "May", income: 14100, expenses: 3250, net: 10850 },
  ],
  timeline: demoProperties.map((property) => ({
    propertyId: property.id,
    milestones: [
      { label: "Purchase", date: "2023-01-15" },
      { label: "Lease Start", date: property.leaseStart },
      { label: "Renewal Window", date: property.id === "sun904" ? "2027-11-01" : "2026-11-01" },
      { label: "Lease End", date: property.leaseEnd },
    ],
  })),
};

const tenantSnapshot: DemoTenantSnapshot = {
  residentName: "Isaac Moreno",
  residentEmail: "isaac.moreno@example-demo.com",
  leaseLabel: "05/01/2026 - 04/30/2027",
  upcomingBalance: 4660,
  openMaintenanceCount: 1,
};

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

export function getDemoOwnerData() {
  return {
    properties: deepClone(demoProperties),
    bills: deepClone(demoOwnerBills),
    documents: deepClone(demoDocuments),
    maintenance: deepClone(demoMaintenance),
    report: deepClone(ownerReport),
  };
}

export function getDemoTenantData() {
  return {
    property: deepClone(demoProperties[0]),
    snapshot: deepClone(tenantSnapshot),
    bills: deepClone(demoTenantBills),
    documents: deepClone(demoDocuments.filter((doc) => doc.propertyId === "pal248")),
    maintenance: deepClone(demoMaintenance.filter((item) => item.propertyId === "pal248")),
  };
}
