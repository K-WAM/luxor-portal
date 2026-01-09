import { supabaseAdmin } from "@/lib/supabase/server";
import { getDateOnlyParts } from "@/lib/date-only";

type RentPerformanceRow = {
  year: number;
  month: number;
  rent_income: number;
};

type TenantAssignment = {
  tenantId: string;
  startYear: number;
  startMonth: number;
};

const toDueDate = (year: number, month: number) => {
  const mm = String(month).padStart(2, "0");
  return `${year}-${mm}-01`;
};

const getTenantAssignmentsForProperty = async (
  propertyId: string,
  tenantId?: string
) => {
  let query = supabaseAdmin
    .from("user_properties")
    .select("user_id, created_at")
    .eq("property_id", propertyId)
    .eq("role", "tenant");

  if (tenantId) {
    query = query.eq("user_id", tenantId);
  }

  const { data, error } = await query;

  if (error) throw error;

  return (data || [])
    .map((row: any) => {
      const parts = getDateOnlyParts(row.created_at);
      if (!row.user_id || !parts) return null;
      return {
        tenantId: row.user_id,
        startYear: parts.year,
        startMonth: parts.month,
      } as TenantAssignment;
    })
    .filter(Boolean) as TenantAssignment[];
};

export const backfillRentBillsForProperty = async (
  propertyId: string,
  sinceYear = 2023,
  tenantId?: string
) => {
  const tenantAssignments = await getTenantAssignmentsForProperty(
    propertyId,
    tenantId
  );
  if (tenantAssignments.length === 0) {
    return { inserted: 0 };
  }

  const { data: performance, error: perfError } = await supabaseAdmin
    .from("property_monthly_performance")
    .select("year, month, rent_income")
    .eq("property_id", propertyId)
    .gte("year", sinceYear)
    .gt("rent_income", 0);

  if (perfError) throw perfError;
  if (!performance || performance.length === 0) {
    return { inserted: 0 };
  }

  const tenantIds = tenantAssignments.map((assignment) => assignment.tenantId);
  const { data: existing, error: existingError } = await supabaseAdmin
    .from("tenant_bills")
    .select("tenant_id, year, month, bill_type")
    .eq("property_id", propertyId)
    .eq("bill_type", "rent")
    .in("tenant_id", tenantIds);

  if (existingError) throw existingError;

  const existingKeys = new Set<string>();
  (existing || []).forEach((row: any) => {
    existingKeys.add(`${row.tenant_id}-${row.year}-${row.month}`);
  });

  const inserts: Array<Record<string, any>> = [];
  (performance as RentPerformanceRow[]).forEach((row) => {
    tenantAssignments.forEach((assignment) => {
      const isAfterAssignment =
        row.year > assignment.startYear ||
        (row.year === assignment.startYear && row.month >= assignment.startMonth);
      if (!isAfterAssignment) return;
      const key = `${assignment.tenantId}-${row.year}-${row.month}`;
      if (existingKeys.has(key)) return;
      inserts.push({
        property_id: propertyId,
        tenant_id: assignment.tenantId,
        bill_type: "rent",
        description: null,
        amount: row.rent_income || 0,
        due_date: toDueDate(row.year, row.month),
        status: "paid",
        notify_tenant: false,
        month: row.month,
        year: row.year,
      });
      existingKeys.add(key);
    });
  });

  if (inserts.length === 0) {
    return { inserted: 0 };
  }

  const { error: insertError } = await supabaseAdmin
    .from("tenant_bills")
    .insert(inserts);

  if (insertError) throw insertError;
  return { inserted: inserts.length };
};

export const upsertPaidRentBillForMonth = async (params: {
  propertyId: string;
  year: number;
  month: number;
  amount: number;
}) => {
  const tenantAssignments = await getTenantAssignmentsForProperty(
    params.propertyId
  );
  if (tenantAssignments.length === 0) {
    return { upserts: 0 };
  }

  const rows = tenantAssignments
    .filter(
      (assignment) =>
        params.year > assignment.startYear ||
        (params.year === assignment.startYear &&
          params.month >= assignment.startMonth)
    )
    .map((assignment) => ({
      property_id: params.propertyId,
      tenant_id: assignment.tenantId,
      bill_type: "rent",
      description: null,
      amount: params.amount || 0,
      due_date: toDueDate(params.year, params.month),
      status: "paid",
      notify_tenant: false,
      month: params.month,
      year: params.year,
    }));

  if (rows.length === 0) {
    return { upserts: 0 };
  }

  const { error } = await supabaseAdmin
    .from("tenant_bills")
    .upsert(rows, {
      onConflict: "tenant_id,property_id,year,month,bill_type",
    });

  if (error) throw error;
  return { upserts: rows.length };
};
