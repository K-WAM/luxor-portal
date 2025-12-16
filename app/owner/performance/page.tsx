"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/app/context/AuthContext";
import { calculateOwnerMetrics, generateAssetPerformanceNarrative } from "@/lib/calculations/owner-metrics";
import type {
  PropertyFinancials,
  MonthlyPerformance,
  AnnualTarget,
  AssetPerformanceNarrative,
} from "@/lib/types/financial-metrics";

type Property = {
  id: string;
  address: string;
};

export default function AssetPerformance() {
  const { user } = useAuth();
  const [properties, setProperties] = useState<Property[]>([]);
  const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(null);
  const [narrative, setNarrative] = useState<AssetPerformanceNarrative | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedYear] = useState(new Date().getFullYear());

  // Load user's properties
  useEffect(() => {
    async function loadProperties() {
      if (!user) return;

      try {
        const res = await fetch(`/api/properties`, { cache: "no-store" });
        const data = await res.json();

        if (!res.ok) throw new Error("Failed to load properties");

        setProperties(data);

        // Auto-select first property
        if (data.length > 0 && !selectedPropertyId) {
          setSelectedPropertyId(data[0].id);
        }
      } catch (err: any) {
        console.error(err);
        setError(err.message || "Failed to load properties");
      } finally {
        setLoading(false);
      }
    }

    loadProperties();
  }, [user]);

  // Load financial metrics and generate narrative
  useEffect(() => {
    async function loadNarrative() {
      if (!selectedPropertyId) {
        setNarrative(null);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        const res = await fetch(
          `/api/owner/financial-metrics?propertyId=${selectedPropertyId}&year=${selectedYear}`
        );
        const data = await res.json();

        if (!res.ok) throw new Error(data.error || "Failed to load metrics");

        // Calculate metrics using canonical YTD totals from server
        const metrics = calculateOwnerMetrics(
          data.property as PropertyFinancials,
          data.monthly as MonthlyPerformance[],
          data.metrics.ytd, // Use canonical YTD totals from server
          data.planTarget as AnnualTarget | null,
          data.yeTarget as AnnualTarget | null
        );

        // Generate narrative
        const narrativeData = generateAssetPerformanceNarrative(
          metrics,
          data.planTarget as AnnualTarget | null,
          data.yeTarget as AnnualTarget | null
        );

        setNarrative(narrativeData);
      } catch (err: any) {
        console.error(err);
        setError(err.message || "Failed to load performance data");
      } finally {
        setLoading(false);
      }
    }

    loadNarrative();
  }, [selectedPropertyId, selectedYear]);

  if (loading && properties.length === 0) {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-4">Asset Performance</h1>
        <p className="text-gray-600">Loading your properties...</p>
      </div>
    );
  }

  if (properties.length === 0) {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-4">Asset Performance</h1>
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
          <p className="text-yellow-800">
            You don't have any owner properties associated with your account yet.
            Please contact your property manager for access.
          </p>
        </div>
      </div>
    );
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'green':
        return 'bg-green-100 text-green-800 border-green-300';
      case 'yellow':
        return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      case 'red':
        return 'bg-red-100 text-red-800 border-red-300';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'green':
        return 'Good';
      case 'yellow':
        return 'Fair';
      case 'red':
        return 'Needs Attention';
      default:
        return 'Unknown';
    }
  };

  return (
    <div className="max-w-4xl">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Asset Performance</h1>

        {/* Property Selector */}
        {properties.length > 1 && (
          <select
            value={selectedPropertyId || ''}
            onChange={(e) => setSelectedPropertyId(e.target.value)}
            className="border border-slate-300 rounded-md px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {properties.map((prop) => (
              <option key={prop.id} value={prop.id}>
                {prop.address}
              </option>
            ))}
          </select>
        )}
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          {error}
        </div>
      )}

      {loading && selectedPropertyId && (
        <p className="text-gray-600 mb-6">Loading performance data...</p>
      )}

      {!loading && narrative && (
        <div className="bg-white rounded-lg border border-slate-200 p-8">
          {/* Status Badge */}
          <div className="flex items-center gap-3 mb-6">
            <h2 className="text-xl font-semibold">Investment Performance</h2>
            <span
              className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium border ${getStatusColor(
                narrative.status
              )}`}
            >
              {getStatusLabel(narrative.status)}
            </span>
          </div>

          {/* Narrative Sections */}
          <div className="space-y-6">
            {/* Investment Performance Summary */}
            <div>
              <p className="text-slate-700 leading-relaxed">
                {narrative.investmentPerformanceText}
              </p>
            </div>

            {/* Operating Income and Expenses */}
            <div>
              <h3 className="text-lg font-semibold text-slate-900 mb-2">
                Operating Income and Expenses
              </h3>
              <p className="text-slate-700 leading-relaxed">
                {narrative.operatingIncomeText}
              </p>
            </div>

            {/* Property Taxes */}
            <div>
              <h3 className="text-lg font-semibold text-slate-900 mb-2">
                Property Taxes
              </h3>
              <p className="text-slate-700 leading-relaxed">
                {narrative.propertyTaxesText}
              </p>
            </div>

            {/* Home Value */}
            <div>
              <h3 className="text-lg font-semibold text-slate-900 mb-2">
                Home Value
              </h3>
              <p className="text-slate-700 leading-relaxed">
                {narrative.homeValueText}
              </p>
            </div>
          </div>

          {/* Footer note */}
          <div className="mt-8 pt-6 border-t border-slate-200">
            <p className="text-xs text-slate-500">
              This performance report is based on data for the year {selectedYear}.
              All calculations are derived from actual monthly performance data and
              property financial information on file.
            </p>
          </div>
        </div>
      )}

      {!loading && !narrative && selectedPropertyId && (
        <div className="bg-white rounded-lg border border-slate-200 p-6">
          <p className="text-gray-500">
            No performance data available for this property yet. Please ensure
            financial data has been entered for this year.
          </p>
        </div>
      )}
    </div>
  );
}
