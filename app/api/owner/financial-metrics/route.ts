import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { calculateCanonicalMetrics, getPerformanceStatus } from '@/lib/calculations/canonical-metrics';
import { getAuthContext, getAccessiblePropertyIds, isAdmin } from '@/lib/auth/route-helpers';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const propertyId = searchParams.get('propertyId');
    const year = searchParams.get('year') || new Date().getFullYear().toString();

    const { user, role } = await getAuthContext();
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    if (!propertyId) {
      return NextResponse.json(
        { error: 'Property ID is required' },
        { status: 400 }
      );
    }

    if (!isAdmin(role)) {
      const allowed = await getAccessiblePropertyIds(user.id, role);
      if (!allowed.includes(propertyId)) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    // Fetch property financial data
    const { data: property, error: propertyError } = await supabaseAdmin
      .from('properties')
      .select('*')
      .eq('id', propertyId)
      .single();

    if (propertyError || !property) {
      return NextResponse.json(
        { error: 'Property not found' },
        { status: 404 }
      );
    }

    // Fetch ALL monthly performance data for the year
    const { data: monthlyDataRaw, error: monthlyError } = await supabaseAdmin
      .from('property_monthly_performance')
      .select('*')
      .eq('property_id', propertyId)
      .eq('year', parseInt(year))
      .order('month', { ascending: true });

    if (monthlyError) {
      console.error('Error fetching monthly data:', monthlyError);
    }

    // Generate all 12 months (matching admin behavior)
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const allMonths = monthNames.map((name, index) => {
      const month = index + 1;
      const existingData = monthlyDataRaw?.find(m => m.month === month);

      if (existingData) {
        return {
          ...existingData,
          year: parseInt(existingData.year || year),
          rent_income: parseFloat(existingData.rent_income || 0),
          maintenance: parseFloat(existingData.maintenance || 0),
          pool: parseFloat(existingData.pool || 0),
          garden: parseFloat(existingData.garden || 0),
          hoa_payments: parseFloat(existingData.hoa_payments || 0),
          property_tax: parseFloat(existingData.property_tax || 0),
          total_expenses: parseFloat(existingData.total_expenses || 0),
          net_income: parseFloat(existingData.net_income || 0),
          property_market_estimate: existingData.property_market_estimate !== null
            ? parseFloat(existingData.property_market_estimate || 0)
            : null,
        };
      }

      // Return empty placeholder for missing months
      return {
        property_id: propertyId,
        year: parseInt(year),
        month,
        rent_income: 0,
        maintenance: 0,
        pool: 0,
        garden: 0,
        hoa_payments: 0,
        property_tax: 0,
        total_expenses: 0,
        net_income: 0,
        property_market_estimate: null,
        updated_at: null,
      };
    });

    const monthlyData = allMonths;

    // Fetch annual targets (plan and YE target)
    const { data: targets, error: targetsError } = await supabaseAdmin
      .from('property_annual_targets')
      .select('*')
      .eq('property_id', propertyId)
      .eq('year', parseInt(year));

    if (targetsError) {
      console.error('Error fetching targets:', targetsError);
    }

    const planTarget = targets?.find(t => t.target_type === 'plan') || null;
    const yeTarget = targets?.find(t => t.target_type === 'ye_target') || null;

    // Use canonical calculation function
    // Post-tax ROI: use actual property_tax if present, otherwise fall back to YE target estimate.
    const estimatedAnnualPropertyTax = parseFloat(yeTarget?.property_tax || 0) || 0;
    const propertyInput = {
      ...property,
      home_cost: parseFloat(property.home_cost || 0),
      home_repair_cost: parseFloat(property.home_repair_cost || 0),
      closing_costs: parseFloat(property.closing_costs || 0),
      total_cost: parseFloat(property.total_cost || 0),
      current_market_estimate: parseFloat(property.current_market_estimate || 0),
      target_monthly_rent: parseFloat(property.target_monthly_rent || 0),
      deposit: parseFloat(property.deposit || 0),
      // Infer last-month-rent if the flag is truthy OR a deposit exists (Buena Ventura case)
      last_month_rent_collected:
        property.last_month_rent_collected !== null && property.last_month_rent_collected !== undefined
          ? !!property.last_month_rent_collected
          : (parseFloat(property.deposit || 0) || 0) > 0,
    };

    const metrics = calculateCanonicalMetrics(propertyInput, monthlyData, {
      estimatedAnnualPropertyTax,
    });
    const status = getPerformanceStatus(metrics);

    // Transform monthly data for display
    const monthly = (monthlyData || []).map(m => {
      const monthDate = new Date(parseInt(year), m.month - 1, 1);
      const month_name = monthDate.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });

      return {
        month: m.month,
        month_name,
        rent_income: parseFloat(m.rent_income || 0),
        maintenance: parseFloat(m.maintenance || 0),
        pool: parseFloat(m.pool || 0),
        garden: parseFloat(m.garden || 0),
        hoa_payments: parseFloat(m.hoa_payments || 0),
        total_expenses: parseFloat(m.total_expenses || 0),
        net_income: parseFloat(m.net_income || 0),
        property_tax: parseFloat(m.property_tax || 0),
        property_market_estimate:
          m.property_market_estimate !== null
            ? parseFloat(m.property_market_estimate || 0)
            : null,
        updated_at: m.updated_at || null,
        year: parseInt(year),
      };
    });

    // Transform property data
    const propertyFinancials = {
      id: property.id,
      address: property.address,
      home_cost: parseFloat(property.home_cost || 0),
      home_repair_cost: parseFloat(property.home_repair_cost || 0),
      closing_costs: parseFloat(property.closing_costs || 0),
      total_cost: parseFloat(property.total_cost || 0),
      current_market_estimate: parseFloat(property.current_market_estimate || 0),
      target_monthly_rent: parseFloat(property.target_monthly_rent || 0),
      planned_garden_cost: parseFloat(property.planned_garden_cost || 0),
      planned_pool_cost: parseFloat(property.planned_pool_cost || 0),
      planned_hoa_cost: parseFloat(property.planned_hoa_cost || 0),
      purchase_date: property.purchase_date,
      lease_start: property.lease_start,
      lease_end: property.lease_end,
      deposit: property.deposit,
      last_month_rent_collected: property.last_month_rent_collected,
    };

    return NextResponse.json({
      property: propertyFinancials,
      monthly,
      metrics: {
        ytd: metrics.ytd,
        cost_basis: metrics.cost_basis,
        current_market_value: metrics.current_market_value,
        appreciation_value: metrics.appreciation_value,
        appreciation_pct: metrics.appreciation_pct,
        roi_pre_tax: metrics.roi_pre_tax,
        roi_post_tax: metrics.roi_post_tax,
        roi_with_appreciation: metrics.roi_with_appreciation,
        roi_if_sold_today: metrics.roi_if_sold_today,
        maintenance_pct: metrics.maintenance_pct,
        months_owned: metrics.months_owned,
        status,
      },
      planTarget: planTarget ? {
        target_type: planTarget.target_type,
        rent_income: parseFloat(planTarget.rent_income || 0),
        maintenance: parseFloat(planTarget.maintenance || 0),
        pool: parseFloat(planTarget.pool || 0),
        garden: parseFloat(planTarget.garden || 0),
        hoa: parseFloat(planTarget.hoa || 0),
        property_tax: parseFloat(planTarget.property_tax || 0),
        total_expenses: parseFloat(planTarget.total_expenses || 0),
        net_income: parseFloat(planTarget.net_income || 0),
        maintenance_percentage_target: parseFloat(planTarget.maintenance_percentage_target || 5),
      } : null,
      yeTarget: yeTarget ? {
        target_type: yeTarget.target_type,
        rent_income: parseFloat(yeTarget.rent_income || 0),
        maintenance: parseFloat(yeTarget.maintenance || 0),
        pool: parseFloat(yeTarget.pool || 0),
        garden: parseFloat(yeTarget.garden || 0),
        hoa: parseFloat(yeTarget.hoa || 0),
        property_tax: parseFloat(yeTarget.property_tax || 0),
        total_expenses: parseFloat(yeTarget.total_expenses || 0),
        net_income: parseFloat(yeTarget.net_income || 0),
        maintenance_percentage_target: parseFloat(yeTarget.maintenance_percentage_target || 5),
      } : null,
    });
  } catch (error: any) {
    console.error('Error fetching financial metrics:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch financial metrics' },
      { status: 500 }
    );
  }
}
