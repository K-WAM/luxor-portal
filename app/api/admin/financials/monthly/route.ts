import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getAuthContext, isAdmin } from "@/lib/auth/route-helpers";
import { getDateOnlyParts, toDateOnlyString } from "@/lib/date-only";

type StoredMonthlyPerformanceRow = {
  id?: string;
  property_id: string;
  year: number;
  month: number;
  rent_income?: number | null;
  maintenance?: number | null;
  pool?: number | null;
  garden?: number | null;
  hoa_payments?: number | null;
  pm_fee?: number | null;
  property_tax?: number | null;
  property_market_estimate?: number | null;
  rent_income_override?: number | null;
  property_tax_override?: number | null;
  market_value_override?: number | null;
  notes?: string | null;
  updated_at?: string | null;
};

type PropertyFinancialFallback = {
  planned_pool_cost?: number | null;
  planned_garden_cost?: number | null;
  planned_hoa_cost?: number | null;
  planned_hoa_cost_2?: number | null;
  planned_pm_fee_monthly?: number | null;
  hoa_frequency?: string | null;
  hoa_frequency_2?: string | null;
};

type RecurringExpenseScheduleRow = {
  expense_type: "hoa" | "pool" | "garden" | "pm_fee";
  amount: number | string;
  frequency: "monthly" | "quarterly" | "annual";
  effective_start_date: string;
  effective_end_date: string | null;
};

type PaidRentBillRow = {
  id: string;
  amount: number | string | null;
  paid_date: string | null;
  due_date: string | null;
  year: number | null;
  month: number | null;
  bill_scope?: string | null;
  lease_agreement_id?: string | null;
};

type ValueSource = "override" | "billing" | "schedule" | "stored" | "legacy_fallback" | "future_blank";

type ComputedMonthlyRow = {
  month: number;
  year: number;
  month_name: string;
  rent_income: number;
  maintenance: number;
  pool: number;
  garden: number;
  hoa_payments: number;
  pm_fee: number;
  property_tax: number;
  property_market_estimate: number | null;
  total_expenses: number;
  net_income: number;
  updated_at: string | null;
  hasStoredRecord: boolean;
  is_future: boolean;
  notes: string;
  rent_income_override: number | null;
  property_tax_override: number | null;
  market_value_override: number | null;
  stored_rent_income: number;
  stored_pool: number;
  stored_garden: number;
  stored_hoa_payments: number;
  stored_pm_fee: number;
  stored_property_tax: number;
  stored_property_market_estimate: number | null;
  billing_rent_income: number;
  schedule_pool: number | null;
  schedule_garden: number | null;
  schedule_hoa_payments: number | null;
  schedule_pm_fee: number | null;
  rent_income_source: ValueSource;
  pool_source: ValueSource;
  garden_source: ValueSource;
  hoa_payments_source: ValueSource;
  pm_fee_source: ValueSource;
  property_tax_source: ValueSource;
  property_market_estimate_source: ValueSource;
};

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const isNotNullish = <T>(value: T | null | undefined): value is T =>
  value !== null && value !== undefined;

const toNumber = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toNullableNumber = (value: unknown) => {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const toMonthKey = (year: number, month: number) =>
  `${year}-${String(month).padStart(2, "0")}`;

const getMonthName = (year: number, month: number) =>
  `${MONTH_NAMES[month - 1]} ${year}`;

const getMonthBounds = (year: number, month: number) => {
  const monthStart = `${year}-${String(month).padStart(2, "0")}-01`;
  const monthEndDate = new Date(Date.UTC(year, month, 0));
  const monthEnd = `${monthEndDate.getUTCFullYear()}-${String(
    monthEndDate.getUTCMonth() + 1
  ).padStart(2, "0")}-${String(monthEndDate.getUTCDate()).padStart(2, "0")}`;
  return { monthStart, monthEnd };
};

const monthIndex = (year: number, month: number) => year * 12 + (month - 1);

const compareMonthKeys = (year: number, month: number, currentYear: number, currentMonth: number) => {
  if (year !== currentYear) return year > currentYear ? 1 : -1;
  if (month !== currentMonth) return month > currentMonth ? 1 : -1;
  return 0;
};

const buildMonthRange = (
  startYear: number,
  startMonth: number,
  endYear: number,
  endMonth: number
) => {
  const rows: Array<{ year: number; month: number; month_name: string }> = [];
  let year = startYear;
  let month = startMonth;

  while (year < endYear || (year === endYear && month <= endMonth)) {
    rows.push({
      year,
      month,
      month_name: getMonthName(year, month),
    });
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }

  return rows;
};

const getLegacyRecurringFallback = (
  property: PropertyFinancialFallback | null,
  expenseType: "pool" | "garden" | "hoa" | "pm_fee"
) => {
  if (!property) return null;

  if (expenseType === "pool") {
    return toNullableNumber(property.planned_pool_cost);
  }
  if (expenseType === "garden") {
    return toNullableNumber(property.planned_garden_cost);
  }
  if (expenseType === "pm_fee") {
    return toNullableNumber(property.planned_pm_fee_monthly);
  }

  const monthlyHoaAmounts = [
    String(property.hoa_frequency || "monthly").toLowerCase() === "monthly"
      ? toNullableNumber(property.planned_hoa_cost)
      : null,
    String(property.hoa_frequency_2 || "monthly").toLowerCase() === "monthly"
      ? toNullableNumber(property.planned_hoa_cost_2)
      : null,
  ].filter(isNotNullish);

  if (!monthlyHoaAmounts.length) return null;
  return monthlyHoaAmounts.reduce((sum, amount) => sum + amount, 0);
};

const resolveScheduleValue = (
  schedules: RecurringExpenseScheduleRow[],
  expenseType: "pool" | "garden" | "hoa" | "pm_fee",
  year: number,
  month: number
) => {
  const { monthStart } = getMonthBounds(year, month);

  const activeSchedules = schedules
    .filter((schedule) => schedule.expense_type === expenseType)
    .filter((schedule) => {
      const start = toDateOnlyString(schedule.effective_start_date);
      const end = toDateOnlyString(schedule.effective_end_date);
      if (!start) return false;
      if (start > monthStart) return false;
      if (end && end < monthStart) return false;
      return true;
    })
    .sort((a, b) =>
      String(b.effective_start_date).localeCompare(String(a.effective_start_date))
    );

  if (!activeSchedules.length) return null;

  const resolveSingleScheduleAmount = (schedule: RecurringExpenseScheduleRow) => {
    const amount = toNullableNumber(schedule.amount);
    if (!isNotNullish(amount)) return null;

    if (schedule.frequency === "annual") return amount / 12;
    if (schedule.frequency === "quarterly") {
      const startParts = getDateOnlyParts(schedule.effective_start_date);
      if (!startParts) return null;
      const monthsSinceStart =
        monthIndex(year, month) - monthIndex(startParts.year, startParts.month);
      if (monthsSinceStart < 0 || monthsSinceStart % 3 !== 0) return 0;
      return amount;
    }
    return amount;
  };

  if (expenseType === "hoa") {
    const activeAmounts = activeSchedules
      .map(resolveSingleScheduleAmount)
      .filter(isNotNullish);
    if (!activeAmounts.length) return null;
    return activeAmounts.reduce((sum, value) => sum + value, 0);
  }

  return resolveSingleScheduleAmount(activeSchedules[0]);
};

const buildPaidRentDedupKey = (bill: PaidRentBillRow) => {
  const dueParts = getDateOnlyParts(bill.due_date);
  const billedYear =
    Number.isFinite(bill.year as number) && bill.year ? Number(bill.year) : dueParts?.year;
  const billedMonth =
    Number.isFinite(bill.month as number) && bill.month ? Number(bill.month) : dueParts?.month;

  if (String(bill.bill_scope || "").toLowerCase() === "lease" && bill.lease_agreement_id) {
    return `lease:${bill.lease_agreement_id}:${billedYear || "na"}-${billedMonth || "na"}`;
  }

  return `tenant:${billedYear || "na"}-${billedMonth || "na"}`;
};

const aggregatePaidRentByMonth = (
  paidBills: PaidRentBillRow[],
  monthKeys: Set<string>
) => {
  const monthlyBuckets = new Map<string, Map<string, number>>();

  for (const bill of paidBills) {
    const dueParts = getDateOnlyParts(bill.due_date);
    const billedYear =
      Number.isFinite(bill.year as number) && bill.year ? Number(bill.year) : dueParts?.year;
    const billedMonth =
      Number.isFinite(bill.month as number) && bill.month ? Number(bill.month) : dueParts?.month;
    if (!billedYear || !billedMonth) continue;

    const billedMonthKey = toMonthKey(billedYear, billedMonth);
    if (!monthKeys.has(billedMonthKey)) continue;

    const dedupKey = buildPaidRentDedupKey(bill);
    const amount = toNumber(bill.amount, 0);
    if (amount <= 0) continue;

    const monthBucket = monthlyBuckets.get(billedMonthKey) || new Map<string, number>();
    monthBucket.set(dedupKey, Math.max(monthBucket.get(dedupKey) || 0, amount));
    monthlyBuckets.set(billedMonthKey, monthBucket);
  }

  const totals = new Map<string, number>();
  for (const [monthKey, bucket] of monthlyBuckets.entries()) {
    totals.set(
      monthKey,
      Array.from(bucket.values()).reduce((sum, value) => sum + value, 0)
    );
  }

  return totals;
};

const buildComputedMonthlyRow = (input: {
  year: number;
  month: number;
  storedRow: StoredMonthlyPerformanceRow | null;
  billingRentIncome: number;
  property: PropertyFinancialFallback | null;
  schedules: RecurringExpenseScheduleRow[];
  currentYear: number;
  currentMonth: number;
}) => {
  const { year, month, storedRow, billingRentIncome, property, schedules, currentYear, currentMonth } =
    input;

  const hasStoredRecord = !!storedRow;
  const isFuture = compareMonthKeys(year, month, currentYear, currentMonth) > 0;

  const storedRentIncome = toNumber(storedRow?.rent_income, 0);
  const storedMaintenance = toNumber(storedRow?.maintenance, 0);
  const storedPool = toNumber(storedRow?.pool, 0);
  const storedGarden = toNumber(storedRow?.garden, 0);
  const storedHoa = toNumber(storedRow?.hoa_payments, 0);
  const storedPmFee = toNumber(storedRow?.pm_fee, 0);
  const storedPropertyTax = toNumber(storedRow?.property_tax, 0);
  const storedMarketValue = toNullableNumber(storedRow?.property_market_estimate);

  const rentOverride = toNullableNumber(storedRow?.rent_income_override);
  const propertyTaxOverride = toNullableNumber(storedRow?.property_tax_override);
  const marketValueOverride = toNullableNumber(storedRow?.market_value_override);

  const schedulePool = isFuture ? null : resolveScheduleValue(schedules, "pool", year, month);
  const scheduleGarden = isFuture ? null : resolveScheduleValue(schedules, "garden", year, month);
  const scheduleHoa = isFuture ? null : resolveScheduleValue(schedules, "hoa", year, month);
  const schedulePmFee = isFuture ? null : resolveScheduleValue(schedules, "pm_fee", year, month);

  const legacyPool = getLegacyRecurringFallback(property, "pool");
  const legacyGarden = getLegacyRecurringFallback(property, "garden");
  const legacyHoa = getLegacyRecurringFallback(property, "hoa");
  const legacyPmFee = getLegacyRecurringFallback(property, "pm_fee");

  let rentIncomeSource: ValueSource = "stored";
  let rentIncome = storedRentIncome;
  if (isNotNullish(rentOverride)) {
    rentIncome = rentOverride;
    rentIncomeSource = "override";
  } else if (!isFuture && billingRentIncome > 0) {
    rentIncome = billingRentIncome;
    rentIncomeSource = "billing";
  } else if (storedRentIncome > 0 || hasStoredRecord) {
    rentIncome = storedRentIncome;
    rentIncomeSource = "stored";
  } else {
    rentIncome = 0;
    rentIncomeSource = isFuture ? "future_blank" : "stored";
  }

  const resolveRecurringValue = (
    scheduleValue: number | null,
    storedValue: number,
    legacyValue: number | null
  ): { value: number; source: ValueSource } => {
    if (isNotNullish(scheduleValue)) return { value: scheduleValue, source: "schedule" };
    if (storedValue > 0 || hasStoredRecord) return { value: storedValue, source: "stored" };
    if (!isFuture && isNotNullish(legacyValue)) return { value: legacyValue, source: "legacy_fallback" };
    return { value: 0, source: isFuture ? "future_blank" : "stored" };
  };

  const pool = resolveRecurringValue(schedulePool, storedPool, legacyPool);
  const garden = resolveRecurringValue(scheduleGarden, storedGarden, legacyGarden);
  const hoa = resolveRecurringValue(scheduleHoa, storedHoa, legacyHoa);
  const pmFee = resolveRecurringValue(schedulePmFee, storedPmFee, legacyPmFee);

  const propertyTax = isNotNullish(propertyTaxOverride)
    ? { value: propertyTaxOverride, source: "override" as ValueSource }
    : storedPropertyTax > 0 || hasStoredRecord
      ? { value: storedPropertyTax, source: "stored" as ValueSource }
      : { value: 0, source: "stored" as ValueSource };

  const marketValue = isNotNullish(marketValueOverride)
    ? { value: marketValueOverride, source: "override" as ValueSource }
    : isNotNullish(storedMarketValue)
      ? { value: storedMarketValue, source: "stored" as ValueSource }
      : { value: null, source: "stored" as ValueSource };

  const totalExpenses = storedMaintenance + pool.value + garden.value + hoa.value + pmFee.value;
  const netIncome = rentIncome - totalExpenses;

  return {
    month,
    year,
    month_name: getMonthName(year, month),
    rent_income: rentIncome,
    maintenance: storedMaintenance,
    pool: pool.value,
    garden: garden.value,
    hoa_payments: hoa.value,
    pm_fee: pmFee.value,
    property_tax: propertyTax.value,
    property_market_estimate: marketValue.value,
    total_expenses: totalExpenses,
    net_income: netIncome,
    updated_at: storedRow?.updated_at || null,
    hasStoredRecord,
    is_future: isFuture,
    notes: String(storedRow?.notes || ""),
    rent_income_override: rentOverride,
    property_tax_override: propertyTaxOverride,
    market_value_override: marketValueOverride,
    stored_rent_income: storedRentIncome,
    stored_pool: storedPool,
    stored_garden: storedGarden,
    stored_hoa_payments: storedHoa,
    stored_pm_fee: storedPmFee,
    stored_property_tax: storedPropertyTax,
    stored_property_market_estimate: storedMarketValue,
    billing_rent_income: !isFuture ? billingRentIncome : 0,
    schedule_pool: schedulePool,
    schedule_garden: scheduleGarden,
    schedule_hoa_payments: scheduleHoa,
    schedule_pm_fee: schedulePmFee,
    rent_income_source: rentIncomeSource,
    pool_source: pool.source,
    garden_source: garden.source,
    hoa_payments_source: hoa.source,
    pm_fee_source: pmFee.source,
    property_tax_source: propertyTax.source,
    property_market_estimate_source: marketValue.source,
  } satisfies ComputedMonthlyRow;
};

async function ensureAdmin() {
  const { user, role } = await getAuthContext();
  if (!user || !isAdmin(role)) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }
  return null;
}

async function loadComputedMonthlyRows(
  propertyId: string,
  monthRange: Array<{ year: number; month: number; month_name: string }>
) {
  const monthKeys = new Set(monthRange.map(({ year, month }) => toMonthKey(year, month)));
  const orderedMonthKeys = monthRange.map(({ year, month }) => toMonthKey(year, month));
  const { monthStart: rangeStart } = getMonthBounds(monthRange[0].year, monthRange[0].month);
  const { monthEnd: rangeEnd } = getMonthBounds(
    monthRange[monthRange.length - 1].year,
    monthRange[monthRange.length - 1].month
  );

  const [{ data: property, error: propertyError }, { data: storedRows, error: storedRowsError }, { data: paidRentBills, error: paidRentBillsError }, { data: schedules, error: schedulesError }] =
    await Promise.all([
      supabaseAdmin
        .from("properties")
        .select("planned_pool_cost, planned_garden_cost, planned_hoa_cost, planned_hoa_cost_2, planned_pm_fee_monthly, hoa_frequency, hoa_frequency_2")
        .eq("id", propertyId)
        .maybeSingle(),
      supabaseAdmin
        .from("property_monthly_performance")
        .select("*")
        .eq("property_id", propertyId),
      supabaseAdmin
        .from("tenant_bills")
        .select("id, amount, paid_date, due_date, year, month, bill_scope, lease_agreement_id")
        .eq("property_id", propertyId)
        .eq("bill_type", "rent")
        .eq("status", "paid")
        .gte("due_date", rangeStart)
        .lte("due_date", rangeEnd),
      supabaseAdmin
        .from("property_recurring_expense_schedules")
        .select("expense_type, amount, frequency, effective_start_date, effective_end_date")
        .eq("property_id", propertyId),
    ]);

  if (propertyError) throw propertyError;
  if (storedRowsError) throw storedRowsError;
  if (paidRentBillsError) throw paidRentBillsError;
  if (schedulesError) throw schedulesError;

  const storedRowMap = new Map<string, StoredMonthlyPerformanceRow>();
  for (const row of (storedRows || []) as StoredMonthlyPerformanceRow[]) {
    const key = toMonthKey(row.year, row.month);
    if (monthKeys.has(key)) {
      storedRowMap.set(key, row);
    }
  }

  const paidRentMap = aggregatePaidRentByMonth((paidRentBills || []) as PaidRentBillRow[], monthKeys);
  const now = new Date();
  const currentYear = now.getUTCFullYear();
  const currentMonth = now.getUTCMonth() + 1;

  return orderedMonthKeys.map((key) => {
    const [yearStr, monthStr] = key.split("-");
    return buildComputedMonthlyRow({
      year: Number(yearStr),
      month: Number(monthStr),
      storedRow: storedRowMap.get(key) || null,
      billingRentIncome: paidRentMap.get(key) || 0,
      property: (property as PropertyFinancialFallback | null) || null,
      schedules: (schedules || []) as RecurringExpenseScheduleRow[],
      currentYear,
      currentMonth,
    });
  });
}

// GET - Fetch computed monthly performance data
export async function GET(request: Request) {
  try {
    const unauthorized = await ensureAdmin();
    if (unauthorized) return unauthorized;

    const { searchParams } = new URL(request.url);
    const propertyId = String(searchParams.get("propertyId") || "").trim();
    const year = searchParams.get("year");
    const month = searchParams.get("month");
    const startYear = searchParams.get("startYear");
    const startMonth = searchParams.get("startMonth");
    const endYear = searchParams.get("endYear");
    const endMonth = searchParams.get("endMonth");

    if (!propertyId) {
      return NextResponse.json({ error: "Property ID is required" }, { status: 400 });
    }

    if (startYear && startMonth && endYear && endMonth) {
      const monthRange = buildMonthRange(
        parseInt(startYear, 10),
        parseInt(startMonth, 10),
        parseInt(endYear, 10),
        parseInt(endMonth, 10)
      );
      if (!monthRange.length) {
        return NextResponse.json({ rows: [] });
      }
      const rows = await loadComputedMonthlyRows(propertyId, monthRange);
      return NextResponse.json({ rows });
    }

    if (!year || !month) {
      return NextResponse.json(
        { error: "Property ID, year, and month are required" },
        { status: 400 }
      );
    }

    const rows = await loadComputedMonthlyRows(propertyId, [
      {
        year: parseInt(year, 10),
        month: parseInt(month, 10),
        month_name: getMonthName(parseInt(year, 10), parseInt(month, 10)),
      },
    ]);

    return NextResponse.json(rows[0] || {});
  } catch (error) {
    console.error("Error in GET /api/admin/financials/monthly:", error);
    return NextResponse.json(
      { error: "Failed to fetch monthly performance" },
      { status: 500 }
    );
  }
}

// PUT - Update or create monthly performance overrides/manual fields
export async function PUT(request: Request) {
  try {
    const unauthorized = await ensureAdmin();
    if (unauthorized) return unauthorized;

    const body = await request.json();
    const propertyId = String(body.propertyId || "").trim();
    const year = Number(body.year);
    const month = Number(body.month);

    if (!propertyId || !Number.isFinite(year) || !Number.isFinite(month)) {
      return NextResponse.json(
        { error: "Property ID, year, and month are required" },
        { status: 400 }
      );
    }

    const updateData: Record<string, unknown> = {
      property_id: propertyId,
      year,
      month,
      updated_at: new Date().toISOString(),
    };

    if (body.rent_income !== undefined) {
      updateData.rent_income = toNumber(body.rent_income, 0);
    }
    if (body.rent_paid !== undefined) {
      updateData.rent_paid = !!body.rent_paid;
    }
    if (body.maintenance !== undefined) {
      updateData.maintenance = toNumber(body.maintenance, 0);
    }
    if (body.pool !== undefined) {
      updateData.pool = toNumber(body.pool, 0);
    }
    if (body.garden !== undefined) {
      updateData.garden = toNumber(body.garden, 0);
    }
    if (body.hoa_payments !== undefined) {
      updateData.hoa_payments = toNumber(body.hoa_payments, 0);
    }
    if (body.pm_fee !== undefined) {
      updateData.pm_fee = toNumber(body.pm_fee, 0);
    }
    if (body.property_tax !== undefined) {
      updateData.property_tax = toNumber(body.property_tax, 0);
    }
    if (body.property_market_estimate !== undefined) {
      updateData.property_market_estimate = toNullableNumber(body.property_market_estimate);
    }

    if (body.rent_income_override !== undefined) {
      updateData.rent_income_override = toNullableNumber(body.rent_income_override);
    }
    if (body.property_tax_override !== undefined) {
      updateData.property_tax_override = toNullableNumber(body.property_tax_override);
    }
    if (body.market_value_override !== undefined) {
      updateData.market_value_override = toNullableNumber(body.market_value_override);
    }
    if (body.notes !== undefined) {
      updateData.notes = String(body.notes || "").trim() || null;
    }

    const { error } = await supabaseAdmin
      .from("property_monthly_performance")
      .upsert(updateData, {
        onConflict: "property_id,year,month",
      });

    if (error) {
      console.error("Error upserting monthly performance:", error);
      return NextResponse.json(
        { error: "Failed to save monthly performance" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error in PUT /api/admin/financials/monthly:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
