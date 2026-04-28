import { parseDateOnly } from "@/lib/date-only";
import { supabaseAdmin } from "@/lib/supabase/server";

export type LeaseAgreementStatus = "upcoming" | "active" | "expired" | "terminated";

type AuthUserLike = {
  id: string;
  email?: string | null;
  user_metadata?: Record<string, any> | null;
};

type LeaseAgreementDbRow = {
  id: string;
  property_id: string;
  lease_start_date: string;
  lease_end_date: string;
  monthly_rent: number | string;
  status: string | null;
  prior_lease_id?: string | null;
  notes?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type LeaseAgreementTenantDbRow = {
  lease_agreement_id: string;
  user_id: string;
};

type UserPropertyTenantRow = {
  property_id: string;
  user_id: string;
};

export type LeaseAgreementSummary = {
  id: string;
  propertyId: string;
  leaseStartDate: string;
  leaseEndDate: string;
  monthlyRent: number;
  status: LeaseAgreementStatus;
  priorLeaseId: string | null;
  notes: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  tenantIds: string[];
  tenantNames: string[];
  tenantEmails: string[];
};

export type CurrentLeaseSummary = {
  id: string | null;
  leaseStartDate: string | null;
  leaseEndDate: string | null;
  monthlyRent: number;
  status: LeaseAgreementStatus;
  tenantIds: string[];
  tenantNames: string[];
  tenantEmails: string[];
  source: "lease_agreements" | "legacy_property";
  hasConflict: boolean;
};

export type PropertyLeaseSnapshot = {
  propertyId: string;
  agreements: LeaseAgreementSummary[];
  currentLease: CurrentLeaseSummary;
};

const EXPIRING_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;

const isMissingLeaseTableError = (error: any) => {
  const code = String(error?.code || "").toUpperCase();
  const message = String(error?.message || "").toLowerCase();
  return (
    code === "42P01" ||
    code === "PGRST205" ||
    code === "PGRST204" ||
    message.includes("lease_agreements") ||
    message.includes("lease_agreement_tenants") ||
    message.includes("could not find the table") ||
    message.includes("relation") && (message.includes("does not exist") || message.includes("not found"))
  );
};

export async function fetchActiveLeaseIdsForUser(userId: string, propertyIds?: string[]) {
  if (!userId) return [];

  try {
    const { data: tenantLinks, error: tenantLinksError } = await supabaseAdmin
      .from("lease_agreement_tenants")
      .select("lease_agreement_id")
      .eq("user_id", userId);
    if (tenantLinksError) throw tenantLinksError;

    const leaseIds = (tenantLinks || []).map((row: any) => row.lease_agreement_id).filter(Boolean);
    if (!leaseIds.length) return [];

    let query = supabaseAdmin
      .from("lease_agreements")
      .select("id, property_id, lease_start_date, lease_end_date, status")
      .in("id", leaseIds);

    if (propertyIds?.length) {
      query = query.in("property_id", propertyIds);
    }

    const { data: agreements, error: agreementsError } = await query;
    if (agreementsError) throw agreementsError;

    return (agreements || [])
      .filter((agreement: any) =>
        deriveLeaseAgreementStatus(agreement.lease_start_date, agreement.lease_end_date, agreement.status) === "active"
      )
      .map((agreement: any) => agreement.id);
  } catch (error: any) {
    if (isMissingLeaseTableError(error)) {
      return [];
    }
    throw error;
  }
}

export async function fetchVisibleLeaseIdsForUser(userId: string, propertyIds?: string[]) {
  if (!userId) return [];

  try {
    const { data: tenantLinks, error: tenantLinksError } = await supabaseAdmin
      .from("lease_agreement_tenants")
      .select("lease_agreement_id")
      .eq("user_id", userId);
    if (tenantLinksError) throw tenantLinksError;

    const leaseIds = (tenantLinks || []).map((row: any) => row.lease_agreement_id).filter(Boolean);
    if (!leaseIds.length) return [];

    let query = supabaseAdmin
      .from("lease_agreements")
      .select("id, property_id, lease_start_date, lease_end_date, status")
      .in("id", leaseIds);

    if (propertyIds?.length) {
      query = query.in("property_id", propertyIds);
    }

    const { data: agreements, error: agreementsError } = await query;
    if (agreementsError) throw agreementsError;

    return (agreements || [])
      .filter((agreement: any) => {
        const status = deriveLeaseAgreementStatus(agreement.lease_start_date, agreement.lease_end_date, agreement.status);
        return status === "active" || status === "upcoming";
      })
      .map((agreement: any) => agreement.id);
  } catch (error: any) {
    if (isMissingLeaseTableError(error)) {
      return [];
    }
    throw error;
  }
}

const getDisplayName = (user?: AuthUserLike | null) => {
  if (!user) return "Unknown Tenant";
  const metadataName = String(user.user_metadata?.name || "").trim();
  if (metadataName) return metadataName;
  const email = String(user.email || "").trim();
  if (!email) return "Unknown Tenant";
  return email.split("@")[0] || email;
};

const getTodayUtcMs = () => {
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
};

export const deriveLeaseAgreementStatus = (
  leaseStartDate?: string | null,
  leaseEndDate?: string | null,
  explicitStatus?: string | null
): LeaseAgreementStatus => {
  const normalized = String(explicitStatus || "").trim().toLowerCase();
  if (normalized === "terminated") return "terminated";

  const startMs = parseDateOnly(leaseStartDate)?.getTime() ?? null;
  const endMs = parseDateOnly(leaseEndDate)?.getTime() ?? null;
  const todayUtcMs = getTodayUtcMs();

  if (startMs !== null && startMs > todayUtcMs) return "upcoming";
  if (startMs !== null && endMs !== null && startMs <= todayUtcMs && endMs >= todayUtcMs) return "active";
  if (endMs !== null && endMs < todayUtcMs) return "expired";

  return normalized === "upcoming" || normalized === "active" || normalized === "expired"
    ? (normalized as LeaseAgreementStatus)
    : "expired";
};

export const getLeaseOccupancyStatus = (
  leaseStartDate?: string | null,
  leaseEndDate?: string | null,
  tenantCount = 0
): "vacant" | "occupied" | "expiring" => {
  const todayUtcMs = getTodayUtcMs();
  const startMs = parseDateOnly(leaseStartDate)?.getTime() ?? null;
  const endMs = parseDateOnly(leaseEndDate)?.getTime() ?? null;
  const hasActiveLease =
    startMs !== null &&
    endMs !== null &&
    startMs <= todayUtcMs &&
    endMs >= todayUtcMs;
  const occupied = hasActiveLease || tenantCount > 0;
  const expiring =
    occupied &&
    endMs !== null &&
    endMs >= todayUtcMs &&
    endMs <= todayUtcMs + EXPIRING_DAYS * DAY_MS;

  if (expiring) return "expiring";
  if (occupied) return "occupied";
  return "vacant";
};

export async function fetchPropertyLeaseSnapshots(
  propertyIds: string[],
  legacyFallbacks?: Array<{
    id: string;
    lease_start?: string | null;
    lease_end?: string | null;
    target_monthly_rent?: number | string | null;
  }>
): Promise<Map<string, PropertyLeaseSnapshot>> {
  const snapshotMap = new Map<string, PropertyLeaseSnapshot>();
  if (!propertyIds.length) return snapshotMap;

  let agreementsData: LeaseAgreementDbRow[] = [];
  let agreementTenantsData: LeaseAgreementTenantDbRow[] = [];

  try {
    const { data, error } = await supabaseAdmin
      .from("lease_agreements")
      .select("id, property_id, lease_start_date, lease_end_date, monthly_rent, status, prior_lease_id, notes, created_at, updated_at")
      .in("property_id", propertyIds)
      .order("lease_start_date", { ascending: false });
    if (error) throw error;
    agreementsData = (data || []) as LeaseAgreementDbRow[];

    const agreementIds = agreementsData.map((row: any) => row.id).filter(Boolean);
    if (agreementIds.length) {
      const { data: tenantLinks, error: tenantLinksError } = await supabaseAdmin
        .from("lease_agreement_tenants")
        .select("lease_agreement_id, user_id")
        .in("lease_agreement_id", agreementIds);
      if (tenantLinksError) throw tenantLinksError;
      agreementTenantsData = (tenantLinks || []) as LeaseAgreementTenantDbRow[];
    }
  } catch (error: any) {
    if (!isMissingLeaseTableError(error)) {
      throw error;
    }
  }

  const { data: propertyTenantsData, error: propertyTenantsError } = await supabaseAdmin
    .from("user_properties")
    .select("property_id, user_id")
    .eq("role", "tenant")
    .in("property_id", propertyIds);

  if (propertyTenantsError) throw propertyTenantsError;

  const referencedUserIds = Array.from(
    new Set([
      ...(agreementTenantsData || []).map((row: any) => row.user_id).filter(Boolean),
      ...(propertyTenantsData || []).map((row: any) => row.user_id).filter(Boolean),
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

  const tenantsByAgreement = new Map<string, { id: string; name: string; email: string }[]>();
  for (const row of (agreementTenantsData || []) as LeaseAgreementTenantDbRow[]) {
    const existing = tenantsByAgreement.get(row.lease_agreement_id) || [];
    const authUser = authUsersMap.get(row.user_id);
    existing.push({
      id: row.user_id,
      name: getDisplayName(authUser),
      email: String(authUser?.email || ""),
    });
    tenantsByAgreement.set(row.lease_agreement_id, existing);
  }

  const fallbackTenantsByProperty = new Map<string, { id: string; name: string; email: string }[]>();
  for (const row of (propertyTenantsData || []) as UserPropertyTenantRow[]) {
    const existing = fallbackTenantsByProperty.get(row.property_id) || [];
    const authUser = authUsersMap.get(row.user_id);
    existing.push({
      id: row.user_id,
      name: getDisplayName(authUser),
      email: String(authUser?.email || ""),
    });
    fallbackTenantsByProperty.set(row.property_id, existing);
  }

  const agreementsByProperty = new Map<string, LeaseAgreementSummary[]>();
  for (const row of (agreementsData || []) as LeaseAgreementDbRow[]) {
    const tenants = tenantsByAgreement.get(row.id) || [];
    const agreement: LeaseAgreementSummary = {
      id: row.id,
      propertyId: row.property_id,
      leaseStartDate: row.lease_start_date,
      leaseEndDate: row.lease_end_date,
      monthlyRent: Number(row.monthly_rent || 0),
      status: deriveLeaseAgreementStatus(row.lease_start_date, row.lease_end_date, row.status),
      priorLeaseId: row.prior_lease_id || null,
      notes: row.notes || null,
      createdAt: row.created_at || null,
      updatedAt: row.updated_at || null,
      tenantIds: tenants.map((tenant) => tenant.id),
      tenantNames: tenants.map((tenant) => tenant.name),
      tenantEmails: tenants.map((tenant) => tenant.email).filter(Boolean),
    };
    const existing = agreementsByProperty.get(row.property_id) || [];
    existing.push(agreement);
    agreementsByProperty.set(row.property_id, existing);
  }

  const legacyMap = new Map(
    (legacyFallbacks || []).map((property) => [
      property.id,
      {
        leaseStartDate: property.lease_start || null,
        leaseEndDate: property.lease_end || null,
        monthlyRent: Number(property.target_monthly_rent || 0),
      },
    ])
  );

  for (const propertyId of propertyIds) {
    const agreements = (agreementsByProperty.get(propertyId) || []).sort((a, b) => {
      const aStart = parseDateOnly(a.leaseStartDate)?.getTime() ?? 0;
      const bStart = parseDateOnly(b.leaseStartDate)?.getTime() ?? 0;
      return bStart - aStart;
    });

    const activeLeases = agreements.filter((agreement) => agreement.status === "active");
    const upcomingLeases = agreements.filter((agreement) => agreement.status === "upcoming");
    const expiredLeases = agreements.filter((agreement) => agreement.status === "expired");

    let currentLease: CurrentLeaseSummary | null = null;
    if (activeLeases.length > 0) {
      const selected = activeLeases[0];
      currentLease = {
        id: selected.id,
        leaseStartDate: selected.leaseStartDate,
        leaseEndDate: selected.leaseEndDate,
        monthlyRent: selected.monthlyRent,
        status: selected.status,
        tenantIds: selected.tenantIds,
        tenantNames: selected.tenantNames,
        tenantEmails: selected.tenantEmails,
        source: "lease_agreements",
        hasConflict: activeLeases.length > 1,
      };
    } else if (upcomingLeases.length > 0) {
      const selected = [...upcomingLeases].sort((a, b) => {
        const aStart = parseDateOnly(a.leaseStartDate)?.getTime() ?? Number.MAX_SAFE_INTEGER;
        const bStart = parseDateOnly(b.leaseStartDate)?.getTime() ?? Number.MAX_SAFE_INTEGER;
        return aStart - bStart;
      })[0];
      currentLease = {
        id: selected.id,
        leaseStartDate: selected.leaseStartDate,
        leaseEndDate: selected.leaseEndDate,
        monthlyRent: selected.monthlyRent,
        status: selected.status,
        tenantIds: selected.tenantIds,
        tenantNames: selected.tenantNames,
        tenantEmails: selected.tenantEmails,
        source: "lease_agreements",
        hasConflict: false,
      };
    } else if (expiredLeases.length > 0) {
      const selected = expiredLeases[0];
      currentLease = {
        id: selected.id,
        leaseStartDate: selected.leaseStartDate,
        leaseEndDate: selected.leaseEndDate,
        monthlyRent: selected.monthlyRent,
        status: selected.status,
        tenantIds: selected.tenantIds,
        tenantNames: selected.tenantNames,
        tenantEmails: selected.tenantEmails,
        source: "lease_agreements",
        hasConflict: false,
      };
    }

    if (!currentLease) {
      const legacy = legacyMap.get(propertyId);
      const fallbackTenants = fallbackTenantsByProperty.get(propertyId) || [];
      currentLease = {
        id: null,
        leaseStartDate: legacy?.leaseStartDate || null,
        leaseEndDate: legacy?.leaseEndDate || null,
        monthlyRent: Number(legacy?.monthlyRent || 0),
        status: deriveLeaseAgreementStatus(legacy?.leaseStartDate || null, legacy?.leaseEndDate || null, null),
        tenantIds: fallbackTenants.map((tenant) => tenant.id),
        tenantNames: fallbackTenants.map((tenant) => tenant.name),
        tenantEmails: fallbackTenants.map((tenant) => tenant.email).filter(Boolean),
        source: "legacy_property",
        hasConflict: false,
      };
    }

    snapshotMap.set(propertyId, {
      propertyId,
      agreements,
      currentLease,
    });
  }

  return snapshotMap;
}
