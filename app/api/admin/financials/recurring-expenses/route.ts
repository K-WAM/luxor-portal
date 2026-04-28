import { NextResponse } from "next/server";
import { getAuthContext, isAdmin } from "@/lib/auth/route-helpers";
import { toDateOnlyString } from "@/lib/date-only";
import { supabaseAdmin } from "@/lib/supabase/server";

const ALLOWED_EXPENSE_TYPES = new Set(["hoa", "pool", "garden", "pm_fee"]);
const ALLOWED_FREQUENCIES = new Set(["monthly", "annual"]);

const normalizeAmount = (value: unknown) => {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizeDate = (value: unknown) => {
  if (value === undefined || value === null || value === "") return null;
  return toDateOnlyString(value as any);
};

const rangesOverlap = (
  startA: string,
  endA: string | null,
  startB: string,
  endB: string | null
) => {
  const aStart = new Date(`${startA}T00:00:00Z`).getTime();
  const aEnd = endA ? new Date(`${endA}T00:00:00Z`).getTime() : Number.POSITIVE_INFINITY;
  const bStart = new Date(`${startB}T00:00:00Z`).getTime();
  const bEnd = endB ? new Date(`${endB}T00:00:00Z`).getTime() : Number.POSITIVE_INFINITY;
  return aStart <= bEnd && bStart <= aEnd;
};

async function ensureAdmin() {
  const { user, role } = await getAuthContext();
  if (!user || !isAdmin(role)) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }
  return null;
}

async function validatePayload({
  propertyId,
  expenseType,
  amount,
  frequency,
  effectiveStartDate,
  effectiveEndDate,
  excludeId,
}: {
  propertyId: string;
  expenseType: string;
  amount: number | null;
  frequency: string;
  effectiveStartDate: string | null;
  effectiveEndDate: string | null;
  excludeId?: string;
}) {
  if (!propertyId) return "Property is required.";
  if (!ALLOWED_EXPENSE_TYPES.has(expenseType)) return "Expense type is invalid.";
  if (!ALLOWED_FREQUENCIES.has(frequency)) return "Frequency is invalid.";
  if (amount === null || amount < 0) return "Amount must be zero or greater.";
  if (!effectiveStartDate) return "Effective start date is required.";
  if (effectiveEndDate && effectiveEndDate < effectiveStartDate) {
    return "Effective end date must be on or after the start date.";
  }

  const { data: property, error: propertyError } = await supabaseAdmin
    .from("properties")
    .select("id")
    .eq("id", propertyId)
    .maybeSingle();

  if (propertyError) throw propertyError;
  if (!property) return "Property not found.";

  const { data: existingRows, error: overlapError } = await supabaseAdmin
    .from("property_recurring_expense_schedules")
    .select("id, effective_start_date, effective_end_date")
    .eq("property_id", propertyId)
    .eq("expense_type", expenseType);

  if (overlapError) throw overlapError;

  const conflictingRow = (existingRows || []).find((row: any) => {
    if (excludeId && row.id === excludeId) return false;
    return rangesOverlap(
      effectiveStartDate,
      effectiveEndDate,
      String(row.effective_start_date),
      row.effective_end_date ? String(row.effective_end_date) : null
    );
  });

  if (conflictingRow) {
    return "This expense type already has an overlapping effective date range for the selected property.";
  }

  return null;
}

export async function GET(request: Request) {
  try {
    const unauthorized = await ensureAdmin();
    if (unauthorized) return unauthorized;

    const { searchParams } = new URL(request.url);
    const propertyId = String(searchParams.get("propertyId") || "").trim();
    if (!propertyId) {
      return NextResponse.json({ error: "Property ID is required" }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("property_recurring_expense_schedules")
      .select("*")
      .eq("property_id", propertyId)
      .order("expense_type", { ascending: true })
      .order("effective_start_date", { ascending: false });

    if (error) throw error;

    return NextResponse.json(data || []);
  } catch (error) {
    console.error("Error fetching recurring expense schedules:", error);
    return NextResponse.json({ error: "Failed to fetch recurring expense schedules" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const unauthorized = await ensureAdmin();
    if (unauthorized) return unauthorized;

    const body = await request.json();
    const propertyId = String(body.propertyId || "").trim();
    const expenseType = String(body.expenseType || "").trim();
    const amount = normalizeAmount(body.amount);
    const frequency = String(body.frequency || "monthly").trim();
    const effectiveStartDate = normalizeDate(body.effectiveStartDate);
    const effectiveEndDate = normalizeDate(body.effectiveEndDate);
    const notes = String(body.notes || "").trim() || null;

    const validationError = await validatePayload({
      propertyId,
      expenseType,
      amount,
      frequency,
      effectiveStartDate,
      effectiveEndDate,
    });
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("property_recurring_expense_schedules")
      .insert({
        property_id: propertyId,
        expense_type: expenseType,
        amount,
        frequency,
        effective_start_date: effectiveStartDate,
        effective_end_date: effectiveEndDate,
        notes,
      })
      .select("*")
      .single();

    if (error) throw error;

    return NextResponse.json(data);
  } catch (error) {
    console.error("Error creating recurring expense schedule:", error);
    return NextResponse.json({ error: "Failed to create recurring expense schedule" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const unauthorized = await ensureAdmin();
    if (unauthorized) return unauthorized;

    const body = await request.json();
    const id = String(body.id || "").trim();
    const propertyId = String(body.propertyId || "").trim();
    const expenseType = String(body.expenseType || "").trim();
    const amount = normalizeAmount(body.amount);
    const frequency = String(body.frequency || "monthly").trim();
    const effectiveStartDate = normalizeDate(body.effectiveStartDate);
    const effectiveEndDate = normalizeDate(body.effectiveEndDate);
    const notes = String(body.notes || "").trim() || null;

    if (!id) {
      return NextResponse.json({ error: "Schedule ID is required." }, { status: 400 });
    }

    const validationError = await validatePayload({
      propertyId,
      expenseType,
      amount,
      frequency,
      effectiveStartDate,
      effectiveEndDate,
      excludeId: id,
    });
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("property_recurring_expense_schedules")
      .update({
        property_id: propertyId,
        expense_type: expenseType,
        amount,
        frequency,
        effective_start_date: effectiveStartDate,
        effective_end_date: effectiveEndDate,
        notes,
      })
      .eq("id", id)
      .select("*")
      .single();

    if (error) throw error;

    return NextResponse.json(data);
  } catch (error) {
    console.error("Error updating recurring expense schedule:", error);
    return NextResponse.json({ error: "Failed to update recurring expense schedule" }, { status: 500 });
  }
}
