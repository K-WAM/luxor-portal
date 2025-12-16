"use client";

import { useEffect, useRef } from "react";

type Zone = {
  min: number;
  max: number;
  color: string;
};

type ROISpeedometerProps = {
  value: number;
  max?: number;
  zones?: {
    red: Zone;
    yellow: Zone;
    green: Zone;
  };
  title?: string;
  size?: "small" | "medium" | "large";
};

export default function ROISpeedometer({
  value,
  max = 25,
  zones = {
    red: { min: 0, max: 3.9, color: "#ef4444" },
    yellow: { min: 4, max: 5.9, color: "#eab308" },
    green: { min: 6, max: 8, color: "#22c55e" },
  },
  title = "ROI",
  size = "medium",
}: ROISpeedometerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const isSmall = size === "small";
    const isMedium = size === "medium";
    const isLarge = size === "large";

    const centerX = canvas.width / 2;
    const centerY = isSmall ? canvas.height - 15 : isMedium ? canvas.height - 25 : canvas.height - 30;
    const radius = isSmall ? 70 : isMedium ? 100 : 120;
    const lineWidth = isSmall ? 18 : isMedium ? 25 : 30;
    const needleWidth = isSmall ? 1.5 : isMedium ? 2 : 2.5;
    const centerCircleRadius = isSmall ? 5 : isMedium ? 7 : 8;
    const labelOffset = isSmall ? 18 : isMedium ? 24 : 28;
    const fontSize = isSmall ? 8 : isMedium ? 10 : 11;
    const startAngle = Math.PI;

    let currentValue = 0;
    const targetValue = Math.min(value, max);
    const duration = 1500; // Animation duration in ms
    let startTime: number | null = null;

    function easeOutCubic(t: number): number {
      return 1 - Math.pow(1 - t, 3);
    }

    function drawGauge(animatedValue: number) {
      if (!ctx || !canvas) return;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const normalizedValue = (animatedValue / max) * 100;
      const segments: { start: number; end: number; color: string }[] = [];

      // Build segments from zones
      if (zones.red.min !== null && zones.red.max !== null) {
        segments.push({
          start: (zones.red.min / max) * 100,
          end: (zones.red.max / max) * 100,
          color: zones.red.color,
        });
      }

      if (zones.yellow.min !== null && zones.yellow.max !== null) {
        segments.push({
          start: (zones.yellow.min / max) * 100,
          end: (zones.yellow.max / max) * 100,
          color: zones.yellow.color,
        });
      }

      if (zones.green.min !== null && zones.green.max !== null) {
        segments.push({
          start: (zones.green.min / max) * 100,
          end: (zones.green.max / max) * 100,
          color: zones.green.color,
        });
      }

      segments.sort((a, b) => a.start - b.start);

      // Draw zone arcs
      segments.forEach((segment) => {
        const segmentStart = startAngle + (segment.start / 100) * Math.PI;
        const segmentEnd = startAngle + (segment.end / 100) * Math.PI;

        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, segmentStart, segmentEnd);
        ctx.lineWidth = lineWidth;
        ctx.strokeStyle = segment.color;
        ctx.stroke();
      });

      // Draw labels (only for medium and large sizes)
      if (!isSmall) {
        const labelPoints: number[] = [];
        segments.forEach((seg) => {
          labelPoints.push(seg.start);
          labelPoints.push(seg.end);
        });

        const uniqueLabels = [...new Set(labelPoints)].sort((a, b) => a - b);
        const filteredLabels: number[] = [];
        for (let i = 0; i < uniqueLabels.length; i++) {
          if (i === 0 || i === uniqueLabels.length - 1) {
            filteredLabels.push(uniqueLabels[i]);
          } else if (uniqueLabels[i] - filteredLabels[filteredLabels.length - 1] > 12) {
            filteredLabels.push(uniqueLabels[i]);
          }
        }

        ctx.fillStyle = "#c9a961";
        ctx.font = `${fontSize}px Arial`;
        ctx.textAlign = "center";

        filteredLabels.forEach((label) => {
          const angle = startAngle + (label / 100) * Math.PI;
          const labelRadius = radius + labelOffset;
          const x = centerX + Math.cos(angle) * labelRadius;
          const y = centerY + Math.sin(angle) * labelRadius;
          const actualValue = (label / 100) * max;

          const labelText = actualValue.toFixed(1);
          ctx.fillText(labelText, x, y);
        });
      }

      // Draw needle
      const needleAngle = startAngle + (normalizedValue / 100) * Math.PI;
      const needleLength = radius - (isSmall ? 12 : isMedium ? 16 : 20);

      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.lineTo(
        centerX + Math.cos(needleAngle) * needleLength,
        centerY + Math.sin(needleAngle) * needleLength
      );
      ctx.lineWidth = needleWidth;
      ctx.strokeStyle = "#c9a961";
      ctx.stroke();

      // Draw center circle
      ctx.beginPath();
      ctx.arc(centerX, centerY, centerCircleRadius, 0, 2 * Math.PI);
      ctx.fillStyle = "#c9a961";
      ctx.fill();
    }

    function animate(timestamp: number) {
      if (!startTime) startTime = timestamp;
      const elapsed = timestamp - startTime;
      const progress = Math.min(elapsed / duration, 1);

      currentValue = easeOutCubic(progress) * targetValue;
      drawGauge(currentValue);

      if (progress < 1) {
        animationRef.current = requestAnimationFrame(animate);
      }
    }

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [value, max, zones, size]);

  const getCanvasSize = () => {
    switch (size) {
      case "small":
        return { width: 180, height: 120 };
      case "medium":
        return { width: 280, height: 190 };
      case "large":
        return { width: 320, height: 220 };
      default:
        return { width: 280, height: 190 };
    }
  };

  const canvasSize = getCanvasSize();

  return (
    <div className="flex flex-col items-center gap-4">
      {title && (
        <div className="text-center text-[11px] text-[#c9a961] uppercase tracking-[3px] font-semibold">
          {title}
        </div>
      )}
      <div className="relative flex items-center justify-center">
        <canvas
          ref={canvasRef}
          width={canvasSize.width}
          height={canvasSize.height}
          className="block"
        />
      </div>
      <div className="text-center">
        <div className="text-[36px] font-light text-[#c9a961] font-serif tracking-wide">
          {value.toFixed(2)}%
        </div>
      </div>
    </div>
  );
}
