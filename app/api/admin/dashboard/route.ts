import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { calculateCanonicalMetrics } from "@/lib/calculations/canonical-metrics";
import { getAuthContext, isAdmin } from "@/lib/auth/route-helpers";
import { getDateOnlyParts } from "@/lib/date-only";
import { calculateExpectedAnnualNet, calculateExpectedRoi } from "@/lib/financial-calculations";

const toUtcDateOnlyString = (date: Date) => date.toISOString().slice(0, 10);
const getJoinedPropertyAddress = (joined: any) =>
  Array.isArray(joined) ? joined[0]?.address || "" : joined?.address || "";
const toMonthKey = (year: number, month: number) => `${year}-${String(month).padStart(2, "0")}`;

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

const toNumber = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
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

const aggregatePaidRentByMonth = (paidBills: PaidRentBillRow[], monthKeys: Set<string>) => {
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

export async function GET(request: Request) {
  try {
    const { user, role } = await getAuthContext();
    if (!user || !isAdmin(role)) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const yearParam = searchParams.get("year");
    const currentYear = yearParam ? parseInt(yearParam, 10) || new Date().getFullYear() : new Date().getFullYear();
    const currentMonth = new Date().getMonth() + 1;
    const currentMonthKey = toMonthKey(currentYear, currentMonth);
    const now = new Date();
    const monthAfterNextStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 2, 1));
    const endOfNextMonth = new Date(Date.UTC(monthAfterNextStart.getUTCFullYear(), monthAfterNextStart.getUTCMonth(), 0));
    const endOfNextMonthDate = toUtcDateOnlyString(endOfNextMonth);
    const monthAfterNextStartDate = toUtcDateOnlyString(monthAfterNextStart);

    // Fetch all properties with their latest financial data
    const { data: properties, error: propsError } = await supabaseAdmin
      .from("properties")
      .select(`
        id,
        address,
        target_monthly_rent,
        lease_start,
        lease_end,
        purchase_date,
        current_market_estimate,
        planned_garden_cost,
        planned_pool_cost,
        planned_hoa_cost,
        planned_pm_fee_monthly,
        total_cost,
        home_cost,
        home_repair_cost,
        closing_costs,
        deposit,
        last_month_rent_collected
      `);

    if (propsError) {
      console.error("Error fetching properties:", propsError);
      return NextResponse.json(
        { error: "Failed to fetch properties" },
        { status: 500 }
      );
    }

    // For each property, get financial metrics
    const pendingPayments: { property_id: string; address: string; month: number; year: number; amount_due: number }[] = [];

    const today = new Date();
    const startOfTodayMonth = new Date(Date.UTC(today.getFullYear(), today.getMonth(), 1));

    const propertiesWithMetrics = await Promise.all(
      (properties || []).map(async (property) => {
        // Get monthly performance data for current year
        const { data: monthlyData } = await supabaseAdmin
          .from("property_monthly_performance")
          .select("*")
          .eq("property_id", property.id)
          .eq("year", currentYear)
          .order("month", { ascending: false });

        const currentMonthStart = `${currentYear}-${String(currentMonth).padStart(2, "0")}-01`;
        const currentMonthEndDate = new Date(Date.UTC(currentYear, currentMonth, 0));
        const currentMonthEnd = `${currentMonthEndDate.getUTCFullYear()}-${String(
          currentMonthEndDate.getUTCMonth() + 1
        ).padStart(2, "0")}-${String(currentMonthEndDate.getUTCDate()).padStart(2, "0")}`;
        const { data: currentMonthPaidRentBills } = await supabaseAdmin
          .from("tenant_bills")
          .select("id, amount, paid_date, due_date, year, month, bill_scope, lease_agreement_id")
          .eq("property_id", property.id)
          .eq("bill_type", "rent")
          .eq("status", "paid")
          .gte("due_date", currentMonthStart)
          .lte("due_date", currentMonthEnd);

        // Get last month rent was paid across all years
        const { data: lastRentRow } = await supabaseAdmin
          .from("property_monthly_performance")
          .select("month, year, updated_at, rent_income, maintenance")
          .eq("property_id", property.id)
          .gt("rent_income", 0)
          .order("year", { ascending: false })
          .order("month", { ascending: false })
          .limit(1)
          .maybeSingle();

        // Get year-end targets for projected ROI
        const { data: targets } = await supabaseAdmin
          .from("property_annual_targets")
          .select("*")
          .eq("property_id", property.id)
          .eq("year", currentYear);

        const yeTarget = targets?.find((t) => t.target_type === "ye_target") || null;

        const ye_target_property_tax = parseFloat(yeTarget?.property_tax || "0") || 0;

        // Use CANONICAL METRICS - single source of truth matching Excel formulas
        // Post-tax ROI: use actual property_tax if present, otherwise fall back to YE target estimate.
        const metrics = calculateCanonicalMetrics(
          {
            home_cost: property.home_cost || 0,
            home_repair_cost: property.home_repair_cost || 0,
            closing_costs: property.closing_costs || 0,
            total_cost: property.total_cost || 0,
            current_market_estimate: property.current_market_estimate || 0,
            purchase_date: property.purchase_date || null,
            lease_start: property.lease_start || null,
            lease_end: property.lease_end || null,
            target_monthly_rent: property.target_monthly_rent || 0,
            deposit: property.deposit || 0,
            last_month_rent_collected: !!property.last_month_rent_collected,
          },
          monthlyData || [],
          { estimatedAnnualPropertyTax: ye_target_property_tax }
        );

        const expectedNet = calculateExpectedAnnualNet({
          targetMonthlyRent: property.target_monthly_rent || 0,
          plannedPoolMonthly: property.planned_pool_cost || 0,
          plannedGardenMonthly: property.planned_garden_cost || 0,
          plannedHoaMonthly: property.planned_hoa_cost || 0,
          plannedPmFeeMonthly: property.planned_pm_fee_monthly || 0,
        });

        const projected_roi = calculateExpectedRoi({
          targetMonthlyRent: property.target_monthly_rent || 0,
          plannedPoolMonthly: property.planned_pool_cost || 0,
          plannedGardenMonthly: property.planned_garden_cost || 0,
          plannedHoaMonthly: property.planned_hoa_cost || 0,
          plannedPmFeeMonthly: property.planned_pm_fee_monthly || 0,
          costBasis: metrics.cost_basis || 0,
        });

        const projected_roi_post_tax =
          metrics.cost_basis > 0
            ? ((expectedNet - ye_target_property_tax) / metrics.cost_basis) * 100
            : 0;

        const monthNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
        const lastRentLabel = lastRentRow
          ? `${monthNames[(lastRentRow.month || 1) - 1]} ${lastRentRow.year}`
          : "Never";

        // Build pending payments list (only months within lease term, up to current month)
        const leaseStart = property.lease_start ? getDateOnlyParts(property.lease_start) : null;
        const leaseEnd = property.lease_end ? getDateOnlyParts(property.lease_end) : null;
        for (let m = 1; m <= currentMonth; m++) {
          const monthDate = new Date(Date.UTC(currentYear, m - 1, 1));
          const monthIndex = currentYear * 12 + m;
          const leaseStartIndex = leaseStart ? leaseStart.year * 12 + leaseStart.month : null;
          const leaseEndIndex = leaseEnd ? leaseEnd.year * 12 + leaseEnd.month : null;
          // Only consider if within lease range and not beyond current month
          const withinLease =
            (!leaseStartIndex || monthIndex >= leaseStartIndex) &&
            (!leaseEndIndex || monthIndex <= leaseEndIndex);
          const notFuture = monthDate <= startOfTodayMonth;
          if (!withinLease || !notFuture) continue;

          const row = (monthlyData || []).find((r) => r.month === m && r.year === currentYear);
          const rentIncome = row?.rent_income || 0;
          if (rentIncome <= 0) {
            pendingPayments.push({
              property_id: property.id,
              address: property.address,
              month: m,
              year: currentYear,
              amount_due: property.target_monthly_rent || 0,
            });
          }
        }

        const currentMonthPaidRentMap = aggregatePaidRentByMonth(
          (currentMonthPaidRentBills || []) as PaidRentBillRow[],
          new Set([currentMonthKey])
        );
        const currentMonthBillingRent = currentMonthPaidRentMap.get(currentMonthKey) || 0;
        const currentMonthRow = (monthlyData || []).find(r => r.month === currentMonth);
        const current_month_rent_paid =
          currentMonthBillingRent > 0 || (currentMonthRow?.rent_income || 0) > 0;

        // Performance status: grade against plan-based projected ROI (same unified calc)
        const performance_status: "green" | "yellow" | "red" =
          projected_roi >= 5 && metrics.maintenance_pct < 5 ? "green" :
          projected_roi >= 3 && metrics.maintenance_pct < 7 ? "yellow" : "red";

        return {
          id: property.id,
          address: property.address,
          monthly_rent: property.target_monthly_rent || 0,
          lease_end: property.lease_end || null,
          last_rent_paid: lastRentLabel,
          maintenance_pct: metrics.maintenance_pct,
          roi_before_tax: metrics.roi_pre_tax.toFixed(2), // Canonical: net_income / cost_basis
          roi_after_tax: metrics.roi_post_tax.toFixed(2), // Canonical: (net_income - property_tax) / cost_basis
          current_value: metrics.current_market_value || 0,
          projected_roi: projected_roi.toFixed(2),
          projected_roi_post_tax: projected_roi_post_tax.toFixed(2),
          projected_net_income: expectedNet,
          ytd_net_income: metrics.ytd.net_income,
          current_month_rent_paid,
          performance_status,
        };
      })
    );

    // Get all maintenance requests (all statuses) for per-property counts
    const { data: allMaintenanceRequests } = await supabaseAdmin
      .from("maintenance_requests")
      .select("id, property_id, status, created_at");

    const maintNow = new Date();
    const MAINT_RED_DAYS = 21;
    const maintCountsByProperty = new Map<string, { open: number; closed: number; red: number }>();
    if (allMaintenanceRequests) {
      for (const req of allMaintenanceRequests) {
        if (!req.property_id) continue;
        const counts = maintCountsByProperty.get(req.property_id) || { open: 0, closed: 0, red: 0 };
        if (req.status === "closed") {
          counts.closed++;
        } else {
          counts.open++;
          if (req.created_at) {
            const daysDiff = (maintNow.getTime() - new Date(req.created_at).getTime()) / (1000 * 60 * 60 * 24);
            if (daysDiff > MAINT_RED_DAYS) counts.red++;
          }
        }
        maintCountsByProperty.set(req.property_id, counts);
      }
    }

    // Enrich properties with maintenance counts
    const propertiesWithMaintenance = propertiesWithMetrics.map((p) => ({
      ...p,
      maintenance_open_count: maintCountsByProperty.get(p.id)?.open ?? 0,
      maintenance_closed_count: maintCountsByProperty.get(p.id)?.closed ?? 0,
      maintenance_red_count: maintCountsByProperty.get(p.id)?.red ?? 0,
    }));

    // Get all open maintenance requests
    const { data: openRequests, error: reqError } = await supabaseAdmin
      .from("maintenance_requests")
      .select(`
        id,
        property_id,
        tenant_name,
        tenant_email,
        category,
        description,
        status,
        created_at
      `)
      .neq("status", "closed")
      .order("created_at", { ascending: false });

    if (reqError) {
      console.error("Error fetching maintenance requests:", reqError);
    }

    // Get maintenance requests with property addresses
    const maintenanceWithProperties = await Promise.all(
      (openRequests || []).map(async (req) => {
        if (req.property_id) {
          const { data: prop } = await supabaseAdmin
            .from("properties")
            .select("address")
            .eq("id", req.property_id)
            .single();

          return {
            ...req,
            property_address: prop?.address || "Unknown",
          };
        }
        return {
          ...req,
          property_address: "N/A",
        };
      })
    );

    // Get all users from auth
    const { data: authUsers, error: authError } = await supabaseAdmin.auth.admin.listUsers();

    if (authError) {
      console.error("Error fetching users:", authError);
    }

    const authUserList = authUsers?.users || [];
    const userEmailMap = new Map<string, string>();
    const userNameMap = new Map<string, string>();
    authUserList.forEach((u) => {
      const metadata = (u.user_metadata as Record<string, any>) || {};
      const name =
        (typeof metadata.full_name === "string" && metadata.full_name.trim()) ||
        (typeof metadata.name === "string" && metadata.name.trim()) ||
        (u.email ? u.email.split("@")[0] : "") ||
        u.id;

      userEmailMap.set(u.id, u.email || "");
      userNameMap.set(u.id, name);
    });

    const [tenantBillingSummary, ownerBillingSummary] = await Promise.all([
      supabaseAdmin
        .from("tenant_bills")
        .select(`
          id,
          tenant_id,
          property_id,
          amount,
          description,
          due_date,
          status,
          properties ( address )
        `)
        .neq("status", "paid")
        .neq("status", "voided")
        .not("due_date", "is", null)
        .lte("due_date", endOfNextMonthDate)
        .order("due_date", { ascending: true }),
      supabaseAdmin
        .from("billing_invoices")
        .select(`
          id,
          owner_id,
          property_id,
          total_due,
          fee_amount,
          description,
          due_date,
          status,
          properties ( address )
        `)
        .neq("status", "paid")
        .neq("status", "voided")
        .not("due_date", "is", null)
        .lte("due_date", endOfNextMonthDate)
        .order("due_date", { ascending: true }),
    ]);

    if (tenantBillingSummary.error) {
      console.error("Error fetching tenant billing summary:", tenantBillingSummary.error);
      return NextResponse.json({ error: "Failed to fetch tenant billing summary" }, { status: 500 });
    }

    if (ownerBillingSummary.error) {
      console.error("Error fetching owner billing summary:", ownerBillingSummary.error);
      return NextResponse.json({ error: "Failed to fetch owner billing summary" }, { status: 500 });
    }

    const billingSummaryRows = [
      ...((tenantBillingSummary.data || []) as any[]).map((bill) => ({
        id: bill.id,
        billType: "tenant",
        counterpartyId: bill.tenant_id,
        counterpartyName: userNameMap.get(bill.tenant_id) || userEmailMap.get(bill.tenant_id) || "Tenant",
        counterpartyEmail: userEmailMap.get(bill.tenant_id) || "",
        propertyId: bill.property_id,
        propertyAddress: getJoinedPropertyAddress(bill.properties),
        dueDate: bill.due_date,
        status: bill.status,
        amount: Number(bill.amount || 0),
        description: bill.description || "",
      })),
      ...((ownerBillingSummary.data || []) as any[]).map((bill) => ({
        id: bill.id,
        billType: "owner",
        counterpartyId: bill.owner_id,
        counterpartyName: userNameMap.get(bill.owner_id) || userEmailMap.get(bill.owner_id) || "Owner",
        counterpartyEmail: userEmailMap.get(bill.owner_id) || "",
        propertyId: bill.property_id,
        propertyAddress: getJoinedPropertyAddress(bill.properties),
        dueDate: bill.due_date,
        status: bill.status,
        amount: Number(bill.total_due ?? bill.fee_amount ?? 0),
        description: bill.description || "",
      })),
    ].filter((bill) => bill.dueDate && bill.dueDate < monthAfterNextStartDate);

    // Get user-property associations
    const { data: userProperties, error: upError } = await supabaseAdmin
      .from("user_properties")
      .select(`
        user_id,
        property_id,
        role,
        properties (address)
      `);

    if (upError) {
      console.error("Error fetching user properties:", upError);
    }

    // Combine user data
    const users = (authUsers?.users || []).map((user) => {
      const userProps = userProperties?.filter((up) => up.user_id === user.id) || [];
      const roles = [...new Set(userProps.map((up) => up.role))];
      const propertyAddresses = userProps
        .map((up) => (up.properties as any)?.address)
        .filter(Boolean);

      return {
        id: user.id,
        email: user.email || "",
        phone: user.phone || "",
        created_at: user.created_at,
        last_sign_in: user.last_sign_in_at,
        roles: roles.join(", ") || "none",
        properties: propertyAddresses.join(", ") || "none",
        status: "active",
      };
    });

    // TODO: Get invited users (if you have an invites table)
    // For now, we'll just return active users

    return NextResponse.json({
      properties: propertiesWithMaintenance,
      openMaintenanceRequests: maintenanceWithProperties,
      users,
      pendingPayments,
      billingSummaryRows,
    });
  } catch (error) {
    console.error("Error in GET /api/admin/dashboard:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
