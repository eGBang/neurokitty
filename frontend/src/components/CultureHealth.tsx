// ============================================================================
// NEUROKITTY - Culture Health Panel
// Viability gauge, metric bars, and sparkline histories
// ============================================================================

"use client";

import React, { useRef, useEffect, useCallback } from "react";
import { CultureHealth as CultureHealthType, HealthHistoryEntry } from "@/lib/types";

interface CultureHealthProps {
  health: CultureHealthType | null;
  history: HealthHistoryEntry[];
}

/** Get color for a 0-1 metric value: green -> yellow -> red */
function metricColor(value: number, invert: boolean = false): string {
  const v = invert ? 1 - value : value;
  if (v > 0.7) return "#00ff88";
  if (v > 0.4) return "#ffcc00";
  return "#ff006e";
}

/** Tiny sparkline renderer */
function drawSparkline(
  ctx: CanvasRenderingContext2D,
  data: number[],
  x: number,
  y: number,
  width: number,
  height: number,
  color: string,
  maxVal: number = 1
): void {
  if (data.length < 2) return;

  const step = width / (data.length - 1);

  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.globalAlpha = 0.7;
  ctx.beginPath();

  for (let i = 0; i < data.length; i++) {
    const px = x + i * step;
    const py = y + height - (data[i] / maxVal) * height;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }

  ctx.stroke();

  // Fill under the line
  ctx.globalAlpha = 0.1;
  ctx.lineTo(x + (data.length - 1) * step, y + height);
  ctx.lineTo(x, y + height);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();

  ctx.globalAlpha = 1;
}

export default function CultureHealth({
  health,
  history,
}: CultureHealthProps) {
  const gaugeCanvasRef = useRef<HTMLCanvasElement>(null);
  const sparkCanvasRef = useRef<HTMLCanvasElement>(null);

  const viability = health?.viability ?? 0;
  const meanFiringRate = health?.mean_firing_rate ?? 0;
  const burstIndex = health?.burst_index ?? 0;
  const adaptationLevel = health?.adaptation_level ?? 0;

  // Draw circular viability gauge
  const drawGauge = useCallback(() => {
    const canvas = gaugeCanvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const size = canvas.width;
    const cx = size / 2;
    const cy = size / 2;
    const radius = size / 2 - 8;

    ctx.clearRect(0, 0, size, size);

    // Background arc
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0.75 * Math.PI, 0.25 * Math.PI);
    ctx.strokeStyle = "#1a1a2e";
    ctx.lineWidth = 6;
    ctx.lineCap = "round";
    ctx.stroke();

    // Value arc
    const totalAngle = 1.5 * Math.PI; // from 0.75PI to 0.25PI (going clockwise)
    const valueAngle = 0.75 * Math.PI + totalAngle * viability;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0.75 * Math.PI, valueAngle);
    ctx.strokeStyle = metricColor(viability);
    ctx.lineWidth = 6;
    ctx.lineCap = "round";
    ctx.stroke();

    // Glow effect
    ctx.shadowColor = metricColor(viability);
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, valueAngle - 0.05, valueAngle);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Center text
    ctx.fillStyle = metricColor(viability);
    ctx.font = "bold 16px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(`${Math.round(viability * 100)}%`, cx, cy - 2);

    ctx.fillStyle = "#555570";
    ctx.font = "7px monospace";
    ctx.fillText("VIABILITY", cx, cy + 12);
  }, [viability]);

  // Draw sparklines for history
  const drawSparklines = useCallback(() => {
    const canvas = sparkCanvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;

    ctx.clearRect(0, 0, w, h);

    const recentHistory = history.slice(-100);
    if (recentHistory.length < 2) return;

    const sparkH = h / 4 - 2;

    // Viability sparkline
    drawSparkline(
      ctx,
      recentHistory.map((e) => e.viability),
      0, 0, w, sparkH,
      metricColor(viability),
      1
    );

    // Mean firing rate sparkline
    drawSparkline(
      ctx,
      recentHistory.map((e) => e.mean_firing_rate),
      0, sparkH + 2, w, sparkH,
      "#a855f7",
      50
    );

    // Burst index sparkline
    drawSparkline(
      ctx,
      recentHistory.map((e) => e.burst_index),
      0, (sparkH + 2) * 2, w, sparkH,
      "#ff006e",
      1
    );

    // Adaptation sparkline
    drawSparkline(
      ctx,
      recentHistory.map((e) => e.adaptation_level),
      0, (sparkH + 2) * 3, w, sparkH,
      "#ffcc00",
      1
    );
  }, [history, viability]);

  useEffect(() => {
    drawGauge();
    drawSparklines();
  }, [drawGauge, drawSparklines]);

  return (
    <div className="flex gap-3">
      {/* Circular gauge */}
      <div className="flex-shrink-0">
        <canvas
          ref={gaugeCanvasRef}
          width={80}
          height={80}
          className="rounded"
        />
      </div>

      {/* Metrics and sparklines */}
      <div className="flex-1 flex flex-col gap-1.5 min-w-0">
        {/* Metric bars */}
        <MetricBar
          label="Firing Rate"
          value={meanFiringRate}
          max={50}
          unit="Hz"
          color="#a855f7"
        />
        <MetricBar
          label="Burst Index"
          value={burstIndex}
          max={1}
          unit=""
          color="#ff006e"
          format={(v) => v.toFixed(2)}
        />
        <MetricBar
          label="Adaptation"
          value={adaptationLevel}
          max={1}
          unit=""
          color="#ffcc00"
          format={(v) => v.toFixed(2)}
        />

        {/* Sparkline canvas */}
        <canvas
          ref={sparkCanvasRef}
          width={200}
          height={60}
          className="w-full rounded-sm mt-1"
          style={{ height: "40px" }}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// MetricBar sub-component
// ---------------------------------------------------------------------------

interface MetricBarProps {
  label: string;
  value: number;
  max: number;
  unit: string;
  color: string;
  format?: (v: number) => string;
}

function MetricBar({
  label,
  value,
  max,
  unit,
  color,
  format,
}: MetricBarProps) {
  const pct = Math.min((value / max) * 100, 100);
  const displayValue = format ? format(value) : value.toFixed(1);

  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex justify-between items-center">
        <span className="text-[8px] uppercase tracking-wider text-neural-dim">
          {label}
        </span>
        <span className="text-[9px] mono-number" style={{ color }}>
          {displayValue}
          {unit && <span className="text-neural-dim ml-0.5">{unit}</span>}
        </span>
      </div>
      <div className="h-1.5 bg-neural-dark rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{
            width: `${pct}%`,
            backgroundColor: color,
            boxShadow: `0 0 6px ${color}40`,
          }}
        />
      </div>
    </div>
  );
}
