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
  grossIncome: number;       // recurring only (deposit excluded)
  maintenance: number;
  maintenancePct: number;
  hoaPoolGarden: number;
  pmFee: number;
  totalExpenses: number;
  netIncome: number;         // recurring only (deposit excluded)
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
  preTax: number;            // recurring (deposit excluded)
  postTax: number;           // recurring post property tax
  appreciationPct: number;   // since purchase
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
  /** Amount of last-month deposit collected (0 if not collected). */
  lastMonthDeposit?: number;
  /** Label for lease-end month, e.g. "Dec 2025" — shown on deposit row. */
  leaseEndMonthLabel?: string | null;
};

// Style constants
const HDR = "px-3 py-2.5 text-right text-[11px] font-semibold text-slate-500 uppercase tracking-wider bg-slate-50 border-b border-slate-200";
const HDR_L = "px-3 py-2.5 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider bg-slate-50 border-b border-slate-200";
const TD = "px-3 py-2 text-right text-sm tabular-nums border-b border-slate-100";
const TD_L = "px-3 py-2 text-left text-sm text-slate-600 border-b border-slate-100";
const SUB_TD = "px-3 py-1.5 text-right text-xs tabular-nums text-slate-400 border-b border-slate-100";
const SUB_TD_L = "px-3 py-1.5 text-left text-xs text-slate-400 border-b border-slate-100";
const TOTAL_TD = "px-3 py-2 text-right text-sm tabular-nums font-semibold text-slate-700 border-b border-slate-200 bg-slate-50/60";
const TOTAL_TD_L = "px-3 py-2 text-left text-sm font-semibold text-slate-700 border-b border-slate-200 bg-slate-50/60";

export default function InvestmentPerformanceTable({
  actual, plan, yeTarget, roi, home,
  closingCosts, onClosingCostsChange,
  lastMonthDeposit = 0, leaseEndMonthLabel = null,
}: Props) {
  const closingCostsNum = parseFloat(closingCosts) || 0;
  const hasDeposit = lastMonthDeposit > 0;

  // With-deposit variants (computed only when deposit exists)
  const grossWithDeposit = actual.grossIncome + lastMonthDeposit;
  const netWithDeposit = actual.netIncome + lastMonthDeposit;
  const roiWithDeposit = home.costBasis > 0 ? (netWithDeposit / home.costBasis) * 100 : 0;
  const postTaxWithDeposit = home.costBasis > 0
    ? ((netWithDeposit - (actual.propertyTax || 0)) / home.costBasis) * 100
    : 0;

  // ROI if sold (uses recurring net income — deposit is not a recurring income stream)
  const roiIfSold = home.costBasis > 0
    ? ((actual.netIncome - actual.propertyTax - closingCostsNum + home.appreciationValue) / home.costBasis) * 100
    : 0;

  const hasYeTarget = !!yeTarget;
  const cols = hasYeTarget ? 5 : 4;

  // Dash cell for sub-rows (no plan/yeTarget/delta comparison)
  const dashes = (
    <>
      <td className={SUB_TD}>—</td>
      {hasYeTarget && <td className={SUB_TD}>—</td>}
      <td className={SUB_TD}>—</td>
    </>
  );
  const totalDashes = (
    <>
      <td className={TOTAL_TD}>—</td>
      {hasYeTarget && <td className={TOTAL_TD}>—</td>}
      <td className={TOTAL_TD}>—</td>
    </>
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

      {/* LEFT: Income & Expenses + Investment Performance */}
      <div className="space-y-3">
        <div className="rounded-xl overflow-hidden border border-slate-200 shadow-sm">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr>
                <th className={`${HDR_L} w-[44%]`}>Income &amp; Expenses</th>
                <th className={HDR}>Actual</th>
                <th className={HDR}>Plan</th>
                {hasYeTarget && <th className={HDR}>YE Target</th>}
                <th className={HDR}>Δ to Plan</th>
              </tr>
            </thead>
            <tbody>

              {/* ── Gross Income (recurring) ── */}
              {(() => {
                const d = delta(actual.grossIncome, plan.grossIncome);
                return (
                  <tr className="hover:bg-slate-50/70">
                    <td className={TD_L}>
                      Gross Income{hasDeposit ? <span className="ml-1 text-[10px] text-slate-400 font-normal">recurring</span> : null}
                    </td>
                    <td className={`${TD} font-semibold text-slate-900`}>{fmtC(actual.grossIncome)}</td>
                    <td className={`${TD} text-slate-500`}>{fmtC(plan.grossIncome)}</td>
                    {hasYeTarget && <td className={`${TD} text-slate-500`}>{fmtC(yeTarget!.grossIncome)}</td>}
                    <td className={`${TD} text-xs font-semibold ${d.color}`}>{d.text}</td>
                  </tr>
                );
              })()}

              {/* Deposit sub-row + Total Collected — only when deposit was collected */}
              {hasDeposit && (
                <>
                  <tr>
                    <td className={`${SUB_TD_L} pl-5`}>
                      ↳ Last-Month Deposit{leaseEndMonthLabel ? ` (${leaseEndMonthLabel})` : ""}
                    </td>
                    <td className={`${SUB_TD} text-slate-500`}>+{fmtC(lastMonthDeposit)}</td>
                    {dashes}
                  </tr>
                  <tr>
                    <td className={`${TOTAL_TD_L} pl-5`}>= Total Collected</td>
                    <td className={TOTAL_TD}>{fmtC(grossWithDeposit)}</td>
                    {totalDashes}
                  </tr>
                </>
              )}

              {/* ── Maintenance ── */}
              {(() => {
                const d = delta(actual.maintenance, plan.maintenance, true);
                return (
                  <tr className="hover:bg-slate-50/70">
                    <td className={TD_L}>Maintenance</td>
                    <td className={`${TD} font-semibold ${actual.maintenancePct < 5 ? "text-emerald-700" : actual.maintenancePct < 7 ? "text-amber-700" : "text-red-700"}`}>
                      {fmtC(actual.maintenance)}
                    </td>
                    <td className={`${TD} text-slate-500`}>{fmtC(plan.maintenance)}</td>
                    {hasYeTarget && <td className={`${TD} text-slate-500`}>{fmtC(yeTarget!.maintenance)}</td>}
                    <td className={`${TD} text-xs font-semibold ${d.color}`}>{d.text}</td>
                  </tr>
                );
              })()}

              {/* Maintenance as % */}
              <tr className="bg-slate-50/40">
                <td className={`${SUB_TD_L} pl-5`}>↳ as % of rent</td>
                <td className={`${SUB_TD} font-semibold ${actual.maintenancePct < 5 ? "text-emerald-600" : actual.maintenancePct < 7 ? "text-amber-600" : "text-red-600"}`}>
                  {fmtPct(actual.maintenancePct)}
                </td>
                <td className={SUB_TD}>5.00%</td>
                {hasYeTarget && <td className={SUB_TD}>5.00%</td>}
                {(() => {
                  const d = delta(actual.maintenancePct, 5, true);
                  return <td className={`${SUB_TD} font-semibold ${d.color}`}>{d.text}</td>;
                })()}
              </tr>

              {/* ── HOA, Pool, Garden ── */}
              {(() => {
                const d = delta(actual.hoaPoolGarden, plan.hoaPoolGarden, true);
                return (
                  <tr className="hover:bg-slate-50/70">
                    <td className={TD_L}>HOA, Pool, Garden</td>
                    <td className={`${TD} font-semibold text-slate-900`}>{fmtC(actual.hoaPoolGarden)}</td>
                    <td className={`${TD} text-slate-500`}>{fmtC(plan.hoaPoolGarden)}</td>
                    {hasYeTarget && <td className={`${TD} text-slate-500`}>{fmtC(yeTarget!.hoaPoolGarden)}</td>}
                    <td className={`${TD} text-xs font-semibold ${d.color}`}>{d.text}</td>
                  </tr>
                );
              })()}

              {/* ── PM Fee ── */}
              {(actual.pmFee > 0 || plan.pmFee > 0 || (hasYeTarget && yeTarget!.pmFee > 0)) && (() => {
                const d = delta(actual.pmFee, plan.pmFee, true);
                return (
                  <tr className="hover:bg-slate-50/70">
                    <td className={TD_L}>PM Fee</td>
                    <td className={`${TD} font-semibold text-slate-900`}>{fmtC(actual.pmFee)}</td>
                    <td className={`${TD} text-slate-500`}>{plan.pmFee > 0 ? fmtC(plan.pmFee) : "—"}</td>
                    {hasYeTarget && <td className={`${TD} text-slate-500`}>{yeTarget!.pmFee > 0 ? fmtC(yeTarget!.pmFee) : "—"}</td>}
                    <td className={`${TD} text-xs font-semibold ${d.color}`}>{plan.pmFee > 0 ? d.text : "—"}</td>
                  </tr>
                );
              })()}

              {/* ── Total Expenses ── */}
              {(() => {
                const d = delta(actual.totalExpenses, plan.totalExpenses, true);
                return (
                  <tr className="hover:bg-slate-50/70">
                    <td className={`${TD_L} font-medium text-slate-700`}>Total Expenses</td>
                    <td className={`${TD} font-semibold text-slate-900`}>{fmtC(actual.totalExpenses)}</td>
                    <td className={`${TD} text-slate-500`}>{fmtC(plan.totalExpenses)}</td>
                    {hasYeTarget && <td className={`${TD} text-slate-500`}>{fmtC(yeTarget!.totalExpenses)}</td>}
                    <td className={`${TD} text-xs font-semibold ${d.color}`}>{d.text}</td>
                  </tr>
                );
              })()}

              {/* ── Net Income (recurring) ── */}
              {(() => {
                const d = delta(actual.netIncome, plan.netIncome);
                return (
                  <tr className="bg-slate-50 border-t-2 border-slate-200">
                    <td className={`${TD_L} font-semibold text-slate-800`}>
                      Net Income{hasDeposit ? <span className="ml-1 text-[10px] text-slate-400 font-normal">recurring</span> : null}
                    </td>
                    <td className={`${TD} font-bold text-base ${actual.netIncome >= 0 ? "text-emerald-700" : "text-red-700"}`}>{fmtC(actual.netIncome)}</td>
                    <td className={`${TD} font-medium text-slate-600`}>{fmtC(plan.netIncome)}</td>
                    {hasYeTarget && <td className={`${TD} font-medium text-slate-600`}>{fmtC(yeTarget!.netIncome)}</td>}
                    <td className={`${TD} text-xs font-semibold ${d.color}`}>{d.text}</td>
                  </tr>
                );
              })()}

              {/* Net Income with deposit sub-row */}
              {hasDeposit && (
                <>
                  <tr>
                    <td className={`${SUB_TD_L} pl-5`}>
                      ↳ + Last-Month Deposit{leaseEndMonthLabel ? ` (${leaseEndMonthLabel})` : ""}
                    </td>
                    <td className={`${SUB_TD} text-slate-500`}>+{fmtC(lastMonthDeposit)}</td>
                    {dashes}
                  </tr>
                  <tr>
                    <td className={`${TOTAL_TD_L} pl-5`}>= Net Income incl. Deposit</td>
                    <td className={`${TOTAL_TD} ${netWithDeposit >= 0 ? "text-emerald-700" : "text-red-700"}`}>{fmtC(netWithDeposit)}</td>
                    {totalDashes}
                  </tr>
                </>
              )}

              {/* ── Property Tax (below the line) ── */}
              <tr className="hover:bg-slate-50/70">
                <td className={`${TD_L} text-slate-400 text-xs italic`}>Property Tax (excl. from net)</td>
                <td className={`${TD} text-slate-400`}>{fmtC(actual.propertyTax)}</td>
                <td className={`${TD} text-slate-300`}>—</td>
                {hasYeTarget && <td className={`${TD} text-slate-400`}>{yeTarget!.propertyTax > 0 ? fmtC(yeTarget!.propertyTax) : "—"}</td>}
                <td className={`${TD} text-slate-300`}>—</td>
              </tr>

              {/* ── Investment Performance subheader ── */}
              <tr className="bg-slate-50 border-t border-slate-200">
                <th
                  className="px-3 py-2 text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-slate-200"
                  colSpan={cols}
                >
                  Investment Performance
                </th>
              </tr>

              {/* ROI – Recurring (no deposit) */}
              {(() => {
                const d = roi.planRoi ? delta(roi.preTax, roi.planRoi) : { text: "—", color: "text-slate-400" };
                return (
                  <tr className="hover:bg-slate-50/70">
                    <td className={`${TD_L} font-medium`}>
                      ROI — Net Income{hasDeposit ? <span className="ml-1 text-[10px] text-slate-400 font-normal">recurring</span> : null}
                    </td>
                    <td className={`${TD} font-bold text-base ${roi.preTax >= 5 ? "text-emerald-700" : roi.preTax >= 3 ? "text-amber-700" : "text-red-700"}`}>
                      {fmtPct(roi.preTax)}
                    </td>
                    <td className={`${TD} text-slate-500`}>{roi.planRoi ? fmtPct(roi.planRoi) : "—"}</td>
                    {hasYeTarget && <td className={`${TD} text-slate-500`}>{roi.yeTargetRoi != null ? fmtPct(roi.yeTargetRoi) : "—"}</td>}
                    <td className={`${TD} text-xs font-semibold ${d.color}`}>{d.text}</td>
                  </tr>
                );
              })()}

              {/* ROI – incl. deposit (sub-row, only when deposit exists) */}
              {hasDeposit && (
                <tr className="bg-slate-50/40">
                  <td className={`${SUB_TD_L} pl-5`}>↳ ROI incl. Last-Month Deposit</td>
                  <td className={`${SUB_TD} font-semibold ${roiWithDeposit >= 5 ? "text-emerald-600" : roiWithDeposit >= 3 ? "text-amber-600" : "text-red-600"}`}>
                    {fmtPct(roiWithDeposit)}
                  </td>
                  {dashes}
                </tr>
              )}

              {/* ROI Post Property Tax */}
              <tr className="hover:bg-slate-50/70">
                <td className={TD_L}>
                  ROI Post Property Tax{hasDeposit ? <span className="ml-1 text-[10px] text-slate-400 font-normal">recurring</span> : null}
                </td>
                <td className={`${TD} font-semibold text-slate-900`}>{fmtPct(roi.postTax)}</td>
                <td className={`${TD} text-slate-400`}>—</td>
                {hasYeTarget && <td className={`${TD} text-slate-400`}>—</td>}
                <td className={`${TD} text-slate-400`}>—</td>
              </tr>
              {hasDeposit && (
                <tr className="bg-slate-50/40">
                  <td className={`${SUB_TD_L} pl-5`}>↳ Post Tax incl. Deposit</td>
                  <td className={`${SUB_TD} font-semibold ${postTaxWithDeposit >= 5 ? "text-emerald-600" : postTaxWithDeposit >= 3 ? "text-amber-600" : "text-red-600"}`}>
                    {fmtPct(postTaxWithDeposit)}
                  </td>
                  {dashes}
                </tr>
              )}

              {/* Home Value Appreciation */}
              <tr className="hover:bg-slate-50/70">
                <td className={TD_L}>Home Value Appreciation</td>
                <td className={`${TD} font-semibold ${roi.appreciationPct >= 0 ? "text-emerald-700" : "text-red-700"}`}>
                  {fmtPct(roi.appreciationPct)}
                </td>
                <td className={`${TD} text-slate-400`}>—</td>
                {hasYeTarget && <td className={`${TD} text-slate-400`}>—</td>}
                <td className={`${TD} text-slate-400`}>—</td>
              </tr>

              {/* ROI if Sold */}
              <tr className="bg-slate-50 border-t-2 border-slate-200">
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
        </div>

        {/* Closing costs input */}
        <div className="flex items-center gap-3 px-1">
          <label className="text-xs text-slate-500 whitespace-nowrap">Estimated Closing Costs:</label>
          <input
            type="number"
            value={closingCosts}
            onChange={(e) => onClosingCostsChange(e.target.value)}
            className="w-32 px-2.5 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            placeholder="0"
          />
          <span className="text-xs text-slate-400">affects ROI if sold</span>
        </div>
      </div>

      {/* RIGHT: Home Performance */}
      <div className="rounded-xl overflow-hidden border border-slate-200 shadow-sm">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr>
              <th className={`${HDR_L}`} colSpan={3}>Home Performance</th>
            </tr>
          </thead>
          <tbody>
            <tr className="hover:bg-slate-50/70">
              <td className={TD_L}>Purchase Price + Repairs</td>
              <td className={`${TD} font-semibold text-slate-900`} colSpan={2}>{fmtC(home.costBasis)}</td>
            </tr>
            <tr className="hover:bg-slate-50/70">
              <td className={TD_L}>Current Value</td>
              <td className={`${TD} font-semibold text-slate-900`} colSpan={2}>{fmtC(home.currentMarketValue)}</td>
            </tr>
            <tr className="hover:bg-slate-50/70">
              <td className={TD_L}>Appreciation since purchase</td>
              <td className={`${TD} font-semibold ${home.appreciationValue >= 0 ? "text-emerald-700" : "text-red-700"}`}>
                {fmtC(home.appreciationValue)}
              </td>
              <td className={`${TD} text-xs font-semibold ${home.appreciationPct >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                {fmtPct(home.appreciationPct)}
              </td>
            </tr>
            <tr className="hover:bg-slate-50/70">
              <td className={TD_L}>
                Appreciation YTD{home.ytdLabel ? ` (from ${home.ytdLabel})` : ""}
              </td>
              <td className={`${TD} font-semibold ${home.ytdAppreciationValue >= 0 ? "text-emerald-700" : "text-red-700"}`}>
                {home.ytdLabel ? fmtC(home.ytdAppreciationValue) : "—"}
              </td>
              <td className={`${TD} text-xs font-semibold ${home.ytdAppreciationPct >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                {home.ytdLabel ? fmtPct(home.ytdAppreciationPct) : "—"}
              </td>
            </tr>
            <tr className="hover:bg-slate-50/70">
              <td className={TD_L}>Monthly Gain</td>
              <td className={`${TD} font-semibold ${home.monthlyGain >= 0 ? "text-emerald-700" : "text-red-700"}`}>
                {home.monthsOwned > 0 ? fmtC(home.monthlyGain) : "—"}
              </td>
              <td className={`${TD} text-xs font-semibold ${home.monthlyGainPct >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                {home.monthsOwned > 0 ? fmtPct(home.monthlyGainPct) : "—"}
              </td>
            </tr>
            <tr className="hover:bg-slate-50/70">
              <td className={TD_L}>Annualized Gain</td>
              <td className={`${TD} font-semibold ${home.annualizedGain >= 0 ? "text-emerald-700" : "text-red-700"}`}>
                {home.monthsOwned > 0 ? fmtC(home.annualizedGain) : "—"}
              </td>
              <td className={`${TD} text-xs font-semibold ${home.annualizedGainPct >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                {home.monthsOwned > 0 ? fmtPct(home.annualizedGainPct) : "—"}
              </td>
            </tr>
            <tr className="bg-slate-50/60">
              <td className={TD_L}>Months Owned</td>
              <td className={`${TD} font-semibold text-slate-900`} colSpan={2}>
                {home.monthsOwned > 0 ? home.monthsOwned : "—"}
              </td>
            </tr>
            <tr className="hover:bg-slate-50/70">
              <td className={TD_L}>Estimated Closing Costs</td>
              <td className={`${TD} font-semibold text-slate-600`} colSpan={2}>
                {closingCostsNum > 0 ? fmtC(closingCostsNum) : <span className="text-slate-400 text-xs">Enter below ↙</span>}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
