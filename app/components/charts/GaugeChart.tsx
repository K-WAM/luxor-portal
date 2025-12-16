"use client";

import React, { useEffect, useState } from 'react';

type GaugeChartProps = {
  value: number;
  target: number;
  label: string;
  unit?: string;
  maxValue?: number;
  colorThresholds?: {
    green: number;
    yellow: number;
  };
  showTarget?: boolean;
  animate?: boolean;
};

export default function GaugeChart({
  value,
  target,
  label,
  unit = '%',
  maxValue,
  colorThresholds = { green: 100, yellow: 90 },
  showTarget = true,
  animate = true,
}: GaugeChartProps) {
  const [displayValue, setDisplayValue] = useState(animate ? 0 : value);

  useEffect(() => {
    if (!animate) {
      setDisplayValue(value);
      return;
    }
    const timeout = setTimeout(() => setDisplayValue(value), 50);
    return () => clearTimeout(timeout);
  }, [value, animate]);

  // Determine max value for gauge
  const max = maxValue || Math.max(value, target) * 1.5;

  // Calculate percentages for display
  const valuePercentage = Math.min((displayValue / max) * 100, 100);
  const targetPercentage = Math.min((target / max) * 100, 100);

  // Determine color based on performance
  const getColor = () => {
    if (!showTarget || target <= 0) return '#2563eb'; // default blue
    const performanceRatio = target > 0 ? (displayValue / target) * 100 : 100;
    if (performanceRatio >= colorThresholds.green) return '#10b981'; // green-500
    if (performanceRatio >= colorThresholds.yellow) return '#f59e0b'; // amber-500
    return '#ef4444'; // red-500
  };

  const color = getColor();

  // SVG parameters for semi-circle gauge
  const size = 200;
  const strokeWidth = 20;
  const radius = (size - strokeWidth) / 2;
  const circumference = Math.PI * radius;

  // Calculate stroke dash offset for the value arc
  const offset = circumference - (valuePercentage / 100) * circumference;

  return (
    <div className="flex flex-col items-center">
      <svg width={size} height={size / 2 + 40} className="overflow-visible">
        {/* Background arc */}
        <path
          d={`M ${strokeWidth / 2} ${size / 2} A ${radius} ${radius} 0 0 1 ${size - strokeWidth / 2} ${size / 2}`}
          fill="none"
          stroke="#e5e7eb"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />

        {/* Value arc */}
        <path
          d={`M ${strokeWidth / 2} ${size / 2} A ${radius} ${radius} 0 0 1 ${size - strokeWidth / 2} ${size / 2}`}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 0.5s ease' }}
        />

        {/* Target marker */}
        {showTarget && target > 0 && (
          <g>
            <line
              x1={size / 2 + radius * Math.cos(Math.PI - (targetPercentage / 100) * Math.PI)}
              y1={size / 2 - radius * Math.sin(Math.PI - (targetPercentage / 100) * Math.PI)}
              x2={size / 2 + (radius + 15) * Math.cos(Math.PI - (targetPercentage / 100) * Math.PI)}
              y2={size / 2 - (radius + 15) * Math.sin(Math.PI - (targetPercentage / 100) * Math.PI)}
              stroke="#6b7280"
              strokeWidth="2"
            />
          </g>
        )}

        {/* Center value text */}
        <text
          x={size / 2}
          y={size / 2 + 10}
          textAnchor="middle"
          className="text-3xl font-bold"
          fill="#1f2937"
        >
          {displayValue.toFixed(2)}{unit}
        </text>

        {/* Target text */}
        {showTarget && target > 0 && (
          <text
            x={size / 2}
            y={size / 2 + 35}
            textAnchor="middle"
            className="text-sm"
            fill="#6b7280"
          >
            Target: {target.toFixed(2)}{unit}
          </text>
        )}
      </svg>

      {/* Label */}
      <div className="text-sm font-medium text-slate-700 mt-2 text-center">
        {label}
      </div>
    </div>
  );
}
