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
    const startYear = startDate.getFullYear();
    const endYear = endDate.getFullYear();

    // Calculate months for the current year within the lease period
    let start = 1;
    let end = 12;

    if (currentYear === startYear && currentYear === endYear) {
      // Lease starts and ends in the same year
      start = startDate.getMonth() + 1;
      end = endDate.getMonth() + 1;
    } else if (currentYear === startYear) {
      // First year of multi-year lease
      start = startDate.getMonth() + 1;
      end = 12;
    } else if (currentYear === endYear) {
      // Last year of multi-year lease
      start = 1;
      end = endDate.getMonth() + 1;
    } else if (currentYear > startYear && currentYear < endYear) {
      // Middle year of multi-year lease
      start = 1;
      end = 12;
    } else {
      // Current year is outside lease period - show empty
      start = 1;
      end = 0;
    }

    const months = start <= end
      ? Array.from({ length: end - start + 1 }, (_, i) => start + i)
      : [];

    const formatDate = (date: Date) => date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

    return {
      startMonth: start,
      endMonth: end,
      monthsInPeriod: months,
      label: `Lease Term (${formatDate(startDate)} - ${formatDate(endDate)})`
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
