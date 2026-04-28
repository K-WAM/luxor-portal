import { NextResponse } from "next/server";
import { getAuthContext, getAccessiblePropertyIds, isAdmin } from "@/lib/auth/route-helpers";
import { supabaseAdmin } from "@/lib/supabase/server";
import { parseDateOnly } from "@/lib/date-only";

type AuthUserLike = {
  id: string;
  email?: string | null;
  user_metadata?: Record<string, any> | null;
};

const EXPIRING_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;

const getDisplayName = (user?: AuthUserLike | null) => {
  if (!user) return "Unknown Tenant";
  const metadataName = String(user.user_metadata?.name || "").trim();
  if (metadataName) return metadataName;
  const email = String(user.email || "").trim();
  if (!email) return "Unknown Tenant";
  return email.split("@")[0] || email;
};

const getOverviewStatus = (leaseStart?: string | null, leaseEnd?: string | null, tenantCount = 0) => {
  const now = new Date();
  const todayUtcMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const leaseStartMs = parseDateOnly(leaseStart)?.getTime() ?? null;
  const leaseEndMs = parseDateOnly(leaseEnd)?.getTime() ?? null;
  const hasActiveLease =
    leaseStartMs !== null &&
    leaseEndMs !== null &&
    leaseStartMs <= todayUtcMs &&
    leaseEndMs >= todayUtcMs;
  const hasTenantAssignment = tenantCount > 0;
  const occupied = hasActiveLease || hasTenantAssignment;
  const expiring =
    occupied &&
    leaseEndMs !== null &&
    leaseEndMs >= todayUtcMs &&
    leaseEndMs <= todayUtcMs + EXPIRING_DAYS * DAY_MS;

  if (expiring) return "expiring";
  if (occupied) return "occupied";
  return "vacant";
};

const getPaymentStatus = (status?: string | null, dueDate?: string | null) => {
  const normalized = String(status || "").toLowerCase();
  if (normalized === "paid") return "Paid";
  if (normalized === "processing") return "Processing";
  if (normalized === "voided") return "Voided";

  const due = parseDateOnly(dueDate);
  if (!due) return "Due";

  const now = new Date();
  const todayUtcMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const dueUtcMs = due.getTime();
  if (dueUtcMs < todayUtcMs) return "Overdue";
  return "Future";
};

export async function GET() {
  try {
    const { user, role } = await getAuthContext();
    if (!user || (!isAdmin(role) && role !== "owner")) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const propertyIds = isAdmin(role)
      ? []
      : await getAccessiblePropertyIds(user.id, role);

    if (!isAdmin(role) && !propertyIds.length) {
      return NextResponse.json({ overviewRows: [], paymentRows: [], maintenanceRows: [] });
    }

    const propertyQuery = supabaseAdmin
      .from("properties")
      .select("id, address, target_monthly_rent, lease_start, lease_end")
      .order("address", { ascending: true });
    const tenantAssignmentsQuery = supabaseAdmin
      .from("user_properties")
      .select("user_id, property_id")
      .eq("role", "tenant");
    const paymentRowsQuery = supabaseAdmin
      .from("tenant_bills")
      .select("id, tenant_id, property_id, bill_type, description, amount, due_date, status, created_at")
      .order("due_date", { ascending: true });
    const maintenanceRowsQuery = supabaseAdmin
      .from("maintenance_requests")
      .select("id, property_id, tenant_name, tenant_email, description, status, created_at, closed_at")
      .order("created_at", { ascending: false });

    const [{ data: properties, error: propertyError }, { data: tenantAssignments, error: tenantAssignmentError }, { data: paymentRows, error: paymentError }, { data: maintenanceRows, error: maintenanceError }] = await Promise.all([
      (isAdmin(role) ? propertyQuery : propertyQuery.in("id", propertyIds)),
      (isAdmin(role) ? tenantAssignmentsQuery : tenantAssignmentsQuery.in("property_id", propertyIds)),
      (isAdmin(role) ? paymentRowsQuery : paymentRowsQuery.in("property_id", propertyIds)),
      (isAdmin(role) ? maintenanceRowsQuery : maintenanceRowsQuery.in("property_id", propertyIds)),
    ]);

    if (propertyError) throw propertyError;
    if (tenantAssignmentError) throw tenantAssignmentError;
    if (paymentError) throw paymentError;
    if (maintenanceError) throw maintenanceError;

    const referencedUserIds = Array.from(
      new Set([
        ...(tenantAssignments || []).map((row: any) => row.user_id).filter(Boolean),
        ...(paymentRows || []).map((row: any) => row.tenant_id).filter(Boolean),
      ])
    );

    const { data: authUsersData, error: authUsersError } = await supabaseAdmin.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });
    if (authUsersError) throw authUsersError;

    const authUsersMap = new Map(
      (authUsersData?.users || [])
        .filter((authUser: any) => referencedUserIds.includes(authUser.id))
        .map((authUser: any) => [authUser.id, authUser])
    );

    const propertyTenantMap = new Map<string, { id: string; name: string; email: string }[]>();
    for (const assignment of tenantAssignments || []) {
      if (!assignment.property_id || !assignment.user_id) continue;
      const authUser = authUsersMap.get(assignment.user_id);
      const existing = propertyTenantMap.get(assignment.property_id) || [];
      existing.push({
        id: assignment.user_id,
        name: getDisplayName(authUser),
        email: String(authUser?.email || ""),
      });
      propertyTenantMap.set(assignment.property_id, existing);
    }

    const overviewRows = (properties || []).map((property: any) => {
      const tenants = propertyTenantMap.get(property.id) || [];
      return {
        propertyId: property.id,
        address: property.address || "",
        currentRent: Number(property.target_monthly_rent || 0),
        leaseStart: property.lease_start || null,
        leaseEnd: property.lease_end || null,
        status: getOverviewStatus(property.lease_start, property.lease_end, tenants.length),
        tenantNames: tenants.map((tenant) => tenant.name),
        tenantEmails: tenants.map((tenant) => tenant.email).filter(Boolean),
      };
    });

    const paymentRowsFormatted = (paymentRows || []).map((row: any) => {
      const directTenant = row.tenant_id ? authUsersMap.get(row.tenant_id) : null;
      const propertyTenants = propertyTenantMap.get(row.property_id) || [];
      const tenantNames = directTenant
        ? [getDisplayName(directTenant)]
        : propertyTenants.map((tenant) => tenant.name);
      return {
        id: row.id,
        propertyId: row.property_id,
        propertyAddress: (properties || []).find((property: any) => property.id === row.property_id)?.address || "",
        description: row.description || row.bill_type || "Tenant Bill",
        amount: Number(row.amount || 0),
        dueDate: row.due_date || null,
        status: row.status || "due",
        displayStatus: getPaymentStatus(row.status, row.due_date),
        tenantNames,
        tenantEmails: directTenant
          ? [String(directTenant.email || "")].filter(Boolean)
          : propertyTenants.map((tenant) => tenant.email).filter(Boolean),
      };
    });

    const maintenanceRowsFormatted = (maintenanceRows || []).map((row: any) => ({
      id: row.id,
      propertyId: row.property_id,
      propertyAddress: (properties || []).find((property: any) => property.id === row.property_id)?.address || "",
      tenantName: row.tenant_name || "Tenant",
      tenantEmail: row.tenant_email || "",
      description: row.description || "",
      status: row.status || "open",
      createdAt: row.created_at || null,
      closedAt: row.closed_at || null,
    }));

    return NextResponse.json({
      overviewRows,
      paymentRows: paymentRowsFormatted,
      maintenanceRows: maintenanceRowsFormatted,
    });
  } catch (error) {
    console.error("Error loading owner reports", error);
    return NextResponse.json({ error: "Failed to load owner reports" }, { status: 500 });
  }
}
