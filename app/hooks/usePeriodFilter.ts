"use client";

import { useState, useMemo } from "react";
import { PeriodType } from "../components/ui/PeriodToggle";

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
export function getLeaseTermMonths(leaseStart: string, leaseEnd: string): Array<{year: number; month: number}> {
  const start = new Date(leaseStart);
  const end = new Date(leaseEnd);

  const months: Array<{year: number; month: number}> = [];
  const current = new Date(start);

  while (current <= end) {
    months.push({
      year: current.getFullYear(),
      month: current.getMonth() + 1
    });
    current.setMonth(current.getMonth() + 1);
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
  currentYear
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
        label: `Year-to-Date ${currentYear}`
      };
    }

    if (periodType === "alltime") {
      // All Time: All months, no filtering
      const months = Array.from({ length: 12 }, (_, i) => i + 1);
      return {
        startMonth: 1,
        endMonth: 12,
        monthsInPeriod: months,
        label: `All Time`
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
        label: `Year-to-Date ${currentYear} (No lease dates)`
      };
    }

    const startDate = new Date(leaseStart);
    const endDate = new Date(leaseEnd);
    const leaseMonths = getLeaseTermMonths(leaseStart, leaseEnd);

    // Extract just the month numbers for the filter (will be used with year matching)
    const monthNumbers = Array.from(new Set(leaseMonths.map(m => m.month)));

    const formatDate = (date: Date) => date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

    return {
      startMonth: startDate.getMonth() + 1,
      endMonth: endDate.getMonth() + 1,
      monthsInPeriod: monthNumbers,
      label: `Lease Term (${formatDate(startDate)} - ${formatDate(endDate)}) • ${leaseMonths.length} months`
    };
  }, [periodType, leaseStart, leaseEnd, currentYear]);

  return {
    periodType,
    setPeriodType,
    startMonth,
    endMonth,
    monthsInPeriod,
    label
  };
}
