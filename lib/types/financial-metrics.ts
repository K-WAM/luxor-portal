// Property financial data types

export type PropertyFinancials = {
  id: string;
  address: string;
  home_cost: number;
  home_repair_cost: number;
  closing_costs: number;
  total_cost: number;
  current_market_estimate: number;
  target_monthly_rent: number;
  planned_garden_cost: number;
  planned_pool_cost: number;
  planned_hoa_cost: number;
  purchase_date: string;
  lease_start?: string;
  lease_end?: string;
};

export type MonthlyPerformance = {
  month: number;
  month_name: string;
  rent_income: number;
  maintenance: number;
  pool: number;
  garden: number;
  hoa_payments: number;
  pm_fee?: number;
  total_expenses: number;
  net_income: number;
  property_tax: number;
  property_market_estimate: number;
};

export type AnnualTarget = {
  target_type: 'plan' | 'ye_target';
  rent_income: number;
  maintenance: number;
  pool: number;
  garden: number;
  hoa: number;
  property_tax: number;
  total_expenses: number;
  net_income: number;
  maintenance_percentage_target: number;
};

export type OperatingSummaryMetrics = {
  gross_income: number;
  maintenance: number;
  maintenance_pct_of_income: number;
  hoa_pool_garden: number;
  total_expenses: number;
  net_income: number;
  property_tax: number;
  property_tax_pct_of_income: number;
};

export type OperatingSummary = {
  actual: OperatingSummaryMetrics;
  plan: OperatingSummaryMetrics;
  yeTarget: OperatingSummaryMetrics;
  deltaToPlan: {
    gross_income: number;
    maintenance: number;
    maintenance_pct_of_income: number;
    hoa_pool_garden: number;
    total_expenses: number;
    net_income: number;
  };
};

export type HomePerformance = {
  purchase_price_plus_repairs: number;
  current_value: number;
  appreciation: number;
  appreciation_percentage: number;
  months_owned: number;
  monthly_gain: number;
  annualized_gain_percentage: number;
};

export type InvestmentPerformance = {
  roi_net_income: number;
  roi_post_property_tax: number;
  roi_home_appreciation: number;
  roi_composite: number; // Post tax + appreciation + rent - closing costs
};

export type OwnerDashboardMetrics = {
  property: PropertyFinancials;
  monthly: MonthlyPerformance[];
  operatingSummary: OperatingSummary;
  homePerformance: HomePerformance;
  investmentPerformance: InvestmentPerformance;
};

export type PerformanceStatus = 'green' | 'yellow' | 'red';

export type AssetPerformanceNarrative = {
  status: PerformanceStatus;
  investmentPerformanceText: string;
  operatingIncomeText: string;
  propertyTaxesText: string;
  homeValueText: string;
};
