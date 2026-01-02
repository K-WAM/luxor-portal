"use client";

import React from "react";

export type PeriodType = "ytd" | "lease";

interface PeriodToggleProps {
  value: PeriodType;
  onChange: (value: PeriodType) => void;
  className?: string;
}

/**
 * Reusable toggle component for switching between YTD (Year-to-Date) and Lease Term views
 * Used across owner dashboard and admin portal financials
 */
export function PeriodToggle({ value, onChange, className = "" }: PeriodToggleProps) {
  return (
    <div className={`inline-flex items-center bg-gray-100 rounded-lg p-1 ${className}`}>
      <button
        onClick={() => onChange("ytd")}
        className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
          value === "ytd"
            ? "bg-white text-gray-900 shadow-sm"
            : "text-gray-600 hover:text-gray-900"
        }`}
      >
        YTD
      </button>
      <button
        onClick={() => onChange("lease")}
        className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
          value === "lease"
            ? "bg-white text-gray-900 shadow-sm"
            : "text-gray-600 hover:text-gray-900"
        }`}
      >
        Lease Term
      </button>
    </div>
  );
}
