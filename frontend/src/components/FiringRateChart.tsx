// ============================================================================
// NEUROKITTY - Firing Rate Heatmap
// 8x8 MEA grid with color-coded firing rates
// ============================================================================

"use client";

import React, { useRef, useEffect, useCallback } from "react";

interface FiringRateChartProps {
  firingRates: number[] | null; // 64 floats
  activeChannels: number[];
}

const GRID_SIZE = 8;
const CELL_SIZE = 28;
const GAP = 2;
const CANVAS_SIZE = GRID_SIZE * (CELL_SIZE + GAP) + GAP;

/** Map a firing rate (Hz) to an RGB color.
 *  0 Hz = dark/black, low = green, medium = yellow, high = red */
function rateToColor(rate: number): string {
  const maxRate = 40; // Hz ceiling for color scale
  const normalized = Math.min(rate / maxRate, 1);

  if (normalized < 0.25) {
    // Black to dark green
    const t = normalized / 0.25;
    const g = Math.floor(60 + t * 140);
    return `rgb(0, ${g}, ${Math.floor(t * 40)})`;
  } else if (normalized < 0.5) {
    // Green to yellow
    const t = (normalized - 0.25) / 0.25;
    const r = Math.floor(t * 255);
    const g = Math.floor(200 + t * 55);
    return `rgb(${r}, ${g}, 0)`;
  } else if (normalized < 0.75) {
    // Yellow to orange
    const t = (normalized - 0.5) / 0.25;
    const g = Math.floor(255 - t * 120);
    return `rgb(255, ${g}, 0)`;
  } else {
    // Orange to red
    const t = (normalized - 0.75) / 0.25;
    const g = Math.floor(135 - t * 135);
    return `rgb(255, ${g}, ${Math.floor(t * 30)})`;
  }
}

export default function FiringRateChart({
  firingRates,
  activeChannels,
}: FiringRateChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const activeSet = new Set(activeChannels);

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Clear
    ctx.fillStyle = "#08080c";
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    for (let row = 0; row < GRID_SIZE; row++) {
      for (let col = 0; col < GRID_SIZE; col++) {
        const idx = row * GRID_SIZE + col;
        const rate = firingRates ? firingRates[idx] || 0 : 0;

        const x = GAP + col * (CELL_SIZE + GAP);
        const y = GAP + row * (CELL_SIZE + GAP);

        // Cell background color based on firing rate
        ctx.fillStyle = rateToColor(rate);
        ctx.fillRect(x, y, CELL_SIZE, CELL_SIZE);

        // Active channel highlight border
        if (activeSet.has(idx)) {
          ctx.strokeStyle = "#00ff88";
          ctx.lineWidth = 1.5;
          ctx.strokeRect(x + 0.5, y + 0.5, CELL_SIZE - 1, CELL_SIZE - 1);
        }

        // Channel number
        ctx.fillStyle = rate > 15 ? "rgba(0,0,0,0.6)" : "rgba(255,255,255,0.3)";
        ctx.font = "bold 7px monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillText(String(idx), x + CELL_SIZE / 2, y + 2);

        // Rate value
        ctx.fillStyle = rate > 15 ? "rgba(0,0,0,0.7)" : "rgba(255,255,255,0.5)";
        ctx.font = "8px monospace";
        ctx.textBaseline = "bottom";
        ctx.fillText(
          rate > 0 ? rate.toFixed(0) : "",
          x + CELL_SIZE / 2,
          y + CELL_SIZE - 2
        );
      }
    }
  }, [firingRates, activeChannels]);

  useEffect(() => {
    render();
  }, [render]);

  return (
    <div className="flex flex-col items-center gap-1">
      <canvas
        ref={canvasRef}
        width={CANVAS_SIZE}
        height={CANVAS_SIZE}
        className="rounded-sm"
        style={{
          width: `${CANVAS_SIZE}px`,
          height: `${CANVAS_SIZE}px`,
          imageRendering: "pixelated",
        }}
      />
      {/* Color scale legend */}
      <div className="flex items-center gap-1 w-full px-1">
        <span className="text-[7px] text-neural-dim">0 Hz</span>
        <div
          className="flex-1 h-2 rounded-sm"
          style={{
            background:
              "linear-gradient(90deg, #003020, #00c830, #cccc00, #ff8800, #ff2020)",
          }}
        />
        <span className="text-[7px] text-neural-dim">40+ Hz</span>
      </div>
    </div>
  );
}
