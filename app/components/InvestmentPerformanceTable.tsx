"use client";

const fmtC = (v: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v);

const fmtPct = (v: number) => `${v.toFixed(2)}%`;

const delta = (actual: number, plan: number, lowerIsBetter = false) => {
  if (!plan) return { text: "—", color: "text-slate-400" };
  const d = ((actual - plan) / Math.abs(plan)) * 100;
  const good = lowerIsBetter ? d <= 0 : d >= 0;
  return { text: `${d >= 0 ? "+" : ""}${d.toFixed(2)}%`, color: good ? "text-emerald-600" : "text-red-600" };
};

export type InvestmentTableActual = {
  grossIncome: number;
  maintenance: number;
  maintenancePct: number;
  hoaPoolGarden: number;
  pmFee: number;
  totalExpenses: number;
  netIncome: number;
  propertyTax: number;
};

export type InvestmentTablePlan = {
  grossIncome: number;
  maintenance: number;
  hoaPoolGarden: number;
  pmFee: number;
  totalExpenses: number;
  netIncome: number;
};

export type InvestmentTableYeTarget = {
  grossIncome: number;
  maintenance: number;
  hoaPoolGarden: number;
  pmFee: number;
  totalExpenses: number;
  netIncome: number;
  propertyTax: number;
} | null;

export type InvestmentTableRoi = {
  preTax: number;
  postTax: number;
  appreciationPct: number;
  planRoi: number;
  yeTargetRoi: number | null;
};

export type InvestmentTableHome = {
  costBasis: number;
  currentMarketValue: number;
  appreciationValue: number;
  appreciationPct: number;
  ytdAppreciationValue: number;
  ytdAppreciationPct: number;
  ytdLabel: string | null;
  monthlyGain: number;
  monthlyGainPct: number;
  annualizedGain: number;
  annualizedGainPct: number;
  monthsOwned: number;
};

type Props = {
  actual: InvestmentTableActual;
  plan: InvestmentTablePlan;
  yeTarget?: InvestmentTableYeTarget;
  roi: InvestmentTableRoi;
  home: InvestmentTableHome;
  closingCosts: string;
  onClosingCostsChange: (v: string) => void;
};

const HDR = "px-2 py-1.5 text-right text-xs font-semibold text-slate-600 bg-amber-50 border border-slate-200";
const HDR_L = "px-2 py-1.5 text-left text-xs font-semibold text-slate-600 bg-amber-50 border border-slate-200";
const TD = "px-2 py-1.5 text-right text-sm border border-slate-200";
const TD_L = "px-2 py-1.5 text-left text-sm text-slate-600 border border-slate-200";
const ROW_SUBHDR = "bg-amber-50";

export default function InvestmentPerformanceTable({ actual, plan, yeTarget, roi, home, closingCosts, onClosingCostsChange }: Props) {
  const closingCostsNum = parseFloat(closingCosts) || 0;
  const roiIfSold = home.costBasis > 0
    ? ((actual.netIncome - actual.propertyTax - closingCostsNum + home.appreciationValue) / home.costBasis) * 100
    : 0;

  const hasYeTarget = !!yeTarget;
  const cols = hasYeTarget ? 5 : 4; // label + actual + plan + [yeTarget] + delta

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

      {/* LEFT: Income & Expenses + Investment Performance */}
      <div>
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr>
              <th className={`${HDR_L} w-2/5`}>Income &amp; Expenses</th>
              <th className={HDR}>Actual</th>
              <th className={HDR}>Plan</th>
              {hasYeTarget && <th className={HDR}>YE Target</th>}
              <th className={HDR}>Δ to Plan</th>
            </tr>
          </thead>
          <tbody>
            {/* Gross Income */}
            {(() => {
              const d = delta(actual.grossIncome, plan.grossIncome);
              return (
                <tr className="hover:bg-slate-50">
                  <td className={TD_L}>Gross Income</td>
                  <td className={`${TD} font-semibold text-slate-900`}>{fmtC(actual.grossIncome)}</td>
                  <td className={`${TD} text-slate-500`}>{fmtC(plan.grossIncome)}</td>
                  {hasYeTarget && <td className={`${TD} text-slate-500`}>{fmtC(yeTarget!.grossIncome)}</td>}
                  <td className={`${TD} text-xs font-medium ${d.color}`}>{d.text}</td>
                </tr>
              );
            })()}

            {/* Maintenance */}
            {(() => {
              const d = delta(actual.maintenance, plan.maintenance, true);
              return (
                <tr className="hover:bg-slate-50">
                  <td className={TD_L}>Maintenance</td>
                  <td className={`${TD} font-semibold ${actual.maintenancePct < 5 ? "text-emerald-700" : actual.maintenancePct < 7 ? "text-yellow-700" : "text-red-700"}`}>
                    {fmtC(actual.maintenance)}
                  </td>
                  <td className={`${TD} text-slate-500`}>{fmtC(plan.maintenance)}</td>
                  {hasYeTarget && <td className={`${TD} text-slate-500`}>{fmtC(yeTarget!.maintenance)}</td>}
                  <td className={`${TD} text-xs font-medium ${d.color}`}>{d.text}</td>
                </tr>
              );
            })()}

            {/* Maintenance as % */}
            <tr className="bg-slate-50/60 text-xs hover:bg-slate-100">
              <td className={`${TD_L} pl-4 text-slate-400`}>↳ as % of rent</td>
              <td className={`${TD} font-medium text-xs ${actual.maintenancePct < 5 ? "text-emerald-600" : actual.maintenancePct < 7 ? "text-yellow-600" : "text-red-600"}`}>
                {fmtPct(actual.maintenancePct)}
              </td>
              <td className={`${TD} text-slate-400`}>5.00%</td>
              {hasYeTarget && <td className={`${TD} text-slate-400`}>5.00%</td>}
              {(() => {
                const d = delta(actual.maintenancePct, 5, true);
                return <td className={`${TD} text-xs font-medium ${d.color}`}>{d.text}</td>;
              })()}
            </tr>

            {/* HOA, Pool, Garden */}
            {(() => {
              const d = delta(actual.hoaPoolGarden, plan.hoaPoolGarden, true);
              return (
                <tr className="hover:bg-slate-50">
                  <td className={TD_L}>HOA, Pool, Garden</td>
                  <td className={`${TD} font-semibold text-slate-900`}>{fmtC(actual.hoaPoolGarden)}</td>
                  <td className={`${TD} text-slate-500`}>{fmtC(plan.hoaPoolGarden)}</td>
                  {hasYeTarget && <td className={`${TD} text-slate-500`}>{fmtC(yeTarget!.hoaPoolGarden)}</td>}
                  <td className={`${TD} text-xs font-medium ${d.color}`}>{d.text}</td>
                </tr>
              );
            })()}

            {/* PM Fee (show if non-zero or yeTarget has it) */}
            {(actual.pmFee > 0 || plan.pmFee > 0 || (hasYeTarget && yeTarget!.pmFee > 0)) && (() => {
              const d = delta(actual.pmFee, plan.pmFee, true);
              return (
                <tr className="hover:bg-slate-50">
                  <td className={TD_L}>PM Fee</td>
                  <td className={`${TD} font-semibold text-slate-900`}>{fmtC(actual.pmFee)}</td>
                  <td className={`${TD} text-slate-500`}>{plan.pmFee > 0 ? fmtC(plan.pmFee) : "—"}</td>
                  {hasYeTarget && <td className={`${TD} text-slate-500`}>{yeTarget!.pmFee > 0 ? fmtC(yeTarget!.pmFee) : "—"}</td>}
                  <td className={`${TD} text-xs font-medium ${d.color}`}>{plan.pmFee > 0 ? d.text : "—"}</td>
                </tr>
              );
            })()}

            {/* Total Expenses */}
            {(() => {
              const d = delta(actual.totalExpenses, plan.totalExpenses, true);
              return (
                <tr className="hover:bg-slate-50">
                  <td className={TD_L}>Total Expenses</td>
                  <td className={`${TD} font-semibold text-slate-900`}>{fmtC(actual.totalExpenses)}</td>
                  <td className={`${TD} text-slate-500`}>{fmtC(plan.totalExpenses)}</td>
                  {hasYeTarget && <td className={`${TD} text-slate-500`}>{fmtC(yeTarget!.totalExpenses)}</td>}
                  <td className={`${TD} text-xs font-medium ${d.color}`}>{d.text}</td>
                </tr>
              );
            })()}

            {/* Net Income */}
            {(() => {
              const d = delta(actual.netIncome, plan.netIncome);
              return (
                <tr className="bg-slate-50 font-semibold border-t border-slate-300 hover:bg-slate-100">
                  <td className={`${TD_L} font-semibold text-slate-800`}>Net Income</td>
                  <td className={`${TD} font-bold ${actual.netIncome >= 0 ? "text-emerald-700" : "text-red-700"}`}>{fmtC(actual.netIncome)}</td>
                  <td className={`${TD} text-slate-500`}>{fmtC(plan.netIncome)}</td>
                  {hasYeTarget && <td className={`${TD} text-slate-500`}>{fmtC(yeTarget!.netIncome)}</td>}
                  <td className={`${TD} text-xs font-medium ${d.color}`}>{d.text}</td>
                </tr>
              );
            })()}

            {/* Property Tax */}
            <tr className="hover:bg-slate-50">
              <td className={TD_L}>Property Tax</td>
              <td className={`${TD} font-semibold text-slate-900`}>{fmtC(actual.propertyTax)}</td>
              <td className={`${TD} text-slate-400`}>—</td>
              {hasYeTarget && <td className={`${TD} text-slate-500`}>{yeTarget!.propertyTax > 0 ? fmtC(yeTarget!.propertyTax) : "—"}</td>}
              {(() => {
                const d = actual.propertyTax > 0
                  ? delta(actual.propertyTax, hasYeTarget && yeTarget!.propertyTax > 0 ? yeTarget!.propertyTax : 0)
                  : { text: "—", color: "text-slate-400" };
                return <td className={`${TD} text-xs font-medium ${d.color}`}>{d.text}</td>;
              })()}
            </tr>

            {/* Investment Performance subheader */}
            <tr className={ROW_SUBHDR}>
              <th className={`${HDR_L}`} colSpan={cols}>Investment Performance</th>
            </tr>

            {/* ROI (Net Income) */}
            {(() => {
              const d = roi.planRoi ? delta(roi.preTax, roi.planRoi) : { text: "—", color: "text-slate-400" };
              return (
                <tr className="bg-slate-50/60 hover:bg-slate-100">
                  <td className={`${TD_L} font-medium`}>Return on Investment (Net Income)</td>
                  <td className={`${TD} font-bold ${roi.preTax >= 5 ? "text-emerald-700" : roi.preTax >= 3 ? "text-yellow-700" : "text-red-700"}`}>
                    {fmtPct(roi.preTax)}
                  </td>
                  <td className={`${TD} text-slate-500`}>{roi.planRoi ? fmtPct(roi.planRoi) : "—"}</td>
                  {hasYeTarget && <td className={`${TD} text-slate-500`}>{roi.yeTargetRoi != null ? fmtPct(roi.yeTargetRoi) : "—"}</td>}
                  <td className={`${TD} text-xs font-medium ${d.color}`}>{d.text}</td>
                </tr>
              );
            })()}

            {/* ROI Post Property Tax */}
            <tr className="hover:bg-slate-50">
              <td className={TD_L}>ROI Post Property Tax</td>
              <td className={`${TD} font-semibold text-slate-900`}>{fmtPct(roi.postTax)}</td>
              <td className={`${TD} text-slate-400`}>—</td>
              {hasYeTarget && <td className={`${TD} text-slate-400`}>—</td>}
              <td className={`${TD} text-slate-400`}>—</td>
            </tr>

            {/* Home Value Appreciation */}
            <tr className="hover:bg-slate-50">
              <td className={TD_L}>Home Value Appreciation</td>
              <td className={`${TD} font-semibold ${roi.appreciationPct >= 0 ? "text-emerald-700" : "text-red-700"}`}>
                {fmtPct(roi.appreciationPct)}
              </td>
              <td className={`${TD} text-slate-400`}>—</td>
              {hasYeTarget && <td className={`${TD} text-slate-400`}>—</td>}
              <td className={`${TD} text-slate-400`}>—</td>
            </tr>

            {/* ROI Post Tax + Appr - Closing Cost */}
            <tr className="bg-slate-50 border-t border-slate-300 hover:bg-slate-100">
              <td className={`${TD_L} font-semibold text-slate-800 text-xs`}>
                ROI Post Tax + Appreciation − Closing Cost
              </td>
              <td className={`${TD} font-bold text-base ${roiIfSold >= 0 ? "text-emerald-700" : "text-red-700"}`}>
                {fmtPct(roiIfSold)}
              </td>
              <td className={`${TD} text-slate-400`}>—</td>
              {hasYeTarget && <td className={`${TD} text-slate-400`}>—</td>}
              <td className={`${TD} text-slate-400`}>—</td>
            </tr>
          </tbody>
        </table>

        {/* Closing costs input */}
        <div className="mt-2 flex items-center gap-2 px-1">
          <label className="text-xs text-slate-500 whitespace-nowrap">Estimated Closing Costs:</label>
          <input
            type="number"
            value={closingCosts}
            onChange={(e) => onClosingCostsChange(e.target.value)}
            className="w-32 px-2 py-1 border border-slate-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="0"
          />
          <span className="text-xs text-slate-400">(affects ROI if sold)</span>
        </div>
      </div>

      {/* RIGHT: Home Performance */}
      <div>
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr>
              <th className={`${HDR_L}`} colSpan={3}>Home Performance</th>
            </tr>
          </thead>
          <tbody>
            <tr className="hover:bg-slate-50">
              <td className={TD_L}>Purchase Price + Repairs</td>
              <td className={`${TD} font-semibold text-slate-900`} colSpan={2}>{fmtC(home.costBasis)}</td>
            </tr>
            <tr className="hover:bg-slate-50">
              <td className={TD_L}>Current Value</td>
              <td className={`${TD} font-semibold text-slate-900`} colSpan={2}>{fmtC(home.currentMarketValue)}</td>
            </tr>
            <tr className="hover:bg-slate-50">
              <td className={TD_L}>Appreciation since purchase</td>
              <td className={`${TD} font-semibold ${home.appreciationValue >= 0 ? "text-emerald-700" : "text-red-700"}`}>
                {fmtC(home.appreciationValue)}
              </td>
              <td className={`${TD} text-xs font-medium ${home.appreciationPct >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                {fmtPct(home.appreciationPct)}
              </td>
            </tr>
            <tr className="hover:bg-slate-50">
              <td className={TD_L}>
                Appreciation YTD{home.ytdLabel ? ` (from ${home.ytdLabel})` : ""}
              </td>
              <td className={`${TD} font-semibold ${home.ytdAppreciationValue >= 0 ? "text-emerald-700" : "text-red-700"}`}>
                {home.ytdLabel ? fmtC(home.ytdAppreciationValue) : "—"}
              </td>
              <td className={`${TD} text-xs font-medium ${home.ytdAppreciationPct >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                {home.ytdLabel ? fmtPct(home.ytdAppreciationPct) : "—"}
              </td>
            </tr>
            <tr className="hover:bg-slate-50">
              <td className={TD_L}>Monthly Gain</td>
              <td className={`${TD} font-semibold ${home.monthlyGain >= 0 ? "text-emerald-700" : "text-red-700"}`}>
                {home.monthsOwned > 0 ? fmtC(home.monthlyGain) : "—"}
              </td>
              <td className={`${TD} text-xs font-medium ${home.monthlyGainPct >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                {home.monthsOwned > 0 ? fmtPct(home.monthlyGainPct) : "—"}
              </td>
            </tr>
            <tr className="hover:bg-slate-50">
              <td className={TD_L}>Annualized Gain</td>
              <td className={`${TD} font-semibold ${home.annualizedGain >= 0 ? "text-emerald-700" : "text-red-700"}`}>
                {home.monthsOwned > 0 ? fmtC(home.annualizedGain) : "—"}
              </td>
              <td className={`${TD} text-xs font-medium ${home.annualizedGainPct >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                {home.monthsOwned > 0 ? fmtPct(home.annualizedGainPct) : "—"}
              </td>
            </tr>
            <tr className="bg-slate-50/60">
              <td className={TD_L}>Months Owned</td>
              <td className={`${TD} font-semibold text-slate-900`} colSpan={2}>
                {home.monthsOwned > 0 ? home.monthsOwned : "—"}
              </td>
            </tr>
            <tr className="hover:bg-slate-50">
              <td className={TD_L}>Estimated Closing Costs</td>
              <td className={`${TD} font-semibold text-slate-600`} colSpan={2}>
                {closingCostsNum > 0 ? fmtC(closingCostsNum) : <span className="text-slate-400 text-xs">Enter below</span>}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
