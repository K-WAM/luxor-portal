"use client";

import { useState, useMemo } from "react";
import { PeriodType } from "../components/ui/PeriodToggle";
import { formatMonthYear, getDateOnlyParts } from "@/lib/date-only";

interface PeriodFilterResult {
  periodType: PeriodType;
  setPeriodType: (type: PeriodType) => void;
  startMonth: number;
  endMonth: number;
  monthsInPeriod: number[];
  label: string;
}

interface UsePeriodFilterOptions {
  leaseStart?: string | null; // ISO date string
  leaseEnd?: string | null; // ISO date string
  currentYear: number;
}

/**
 * Get all years and months for a lease term
 * Returns array of {year, month} objects spanning the entire lease
 */
export function getLeaseTermMonths(
  leaseStart: string,
  leaseEnd: string
): Array<{ year: number; month: number }> {
  const start = getDateOnlyParts(leaseStart);
  const end = getDateOnlyParts(leaseEnd);
  if (!start || !end) return [];

  const months: Array<{ year: number; month: number }> = [];
  let year = start.year;
  let month = start.month;

  while (year < end.year || (year === end.year && month <= end.month)) {
    months.push({ year, month });
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }

  return months;
}

/**
 * Custom hook to manage period filtering (YTD vs Lease Term)
 * Calculates the appropriate month range based on the selected period type
 *
 * @param options - Configuration options including lease dates and current year
 * @returns Period filter state and calculated date ranges
 */
export function usePeriodFilter({
  leaseStart,
  leaseEnd,
  currentYear,
}: UsePeriodFilterOptions): PeriodFilterResult {
  const [periodType, setPeriodType] = useState<PeriodType>("ytd");

  const { startMonth, endMonth, monthsInPeriod, label } = useMemo(() => {
    if (periodType === "ytd") {
      // YTD: January (1) to December (12)
      const months = Array.from({ length: 12 }, (_, i) => i + 1);
      return {
        startMonth: 1,
        endMonth: 12,
        monthsInPeriod: months,
        label: `Year-to-Date ${currentYear}`,
      };
    }

    if (periodType === "alltime") {
      // All Time: All months, no filtering
      const months = Array.from({ length: 12 }, (_, i) => i + 1);
      return {
        startMonth: 1,
        endMonth: 12,
        monthsInPeriod: months,
        label: "All Time",
      };
    }

    // Lease Term: Based on lease_start and lease_end dates
    // For lease term, we show ALL months in the lease regardless of selected year
    if (!leaseStart || !leaseEnd) {
      // Fallback to YTD if lease dates are not available
      const months = Array.from({ length: 12 }, (_, i) => i + 1);
      return {
        startMonth: 1,
        endMonth: 12,
        monthsInPeriod: months,
        label: `Year-to-Date ${currentYear} (No lease dates)`,
      };
    }

    const leaseMonths = getLeaseTermMonths(leaseStart, leaseEnd);

    // Extract just the month numbers for the filter (will be used with year matching)
    const monthNumbers = Array.from(new Set(leaseMonths.map((m) => m.month)));

    return {
      startMonth: leaseMonths[0]?.month || 1,
      endMonth: leaseMonths[leaseMonths.length - 1]?.month || 12,
      monthsInPeriod: monthNumbers,
      label: `Lease Term (${formatMonthYear(leaseStart)} - ${formatMonthYear(
        leaseEnd
      )}) - ${leaseMonths.length} months`,
    };
  }, [periodType, leaseStart, leaseEnd, currentYear]);

  return {
    periodType,
    setPeriodType,
    startMonth,
    endMonth,
    monthsInPeriod,
    label,
  };
}
