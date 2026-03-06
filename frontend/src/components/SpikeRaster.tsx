// ============================================================================
// NEUROKITTY - Spike Raster Display
// Canvas-based raster plot: 64 channels, scrolling time axis
// ============================================================================

"use client";

import React, { useRef, useEffect, useCallback } from "react";

interface SpikeRasterProps {
  spikeRaster: boolean[][] | null; // 64 channels x N time bins
  activeChannels: number[];
}

const CHANNEL_COUNT = 64;
const VISIBLE_TIME_BINS = 200;
const ROW_HEIGHT = 2;
const CANVAS_HEIGHT = CHANNEL_COUNT * ROW_HEIGHT;

// Color for active vs inactive channel spikes
const SPIKE_COLOR_ACTIVE = "#00ff88";
const SPIKE_COLOR_NORMAL = "#cccccc";
const SPIKE_COLOR_DIM = "#555555";
const BURST_BAND_COLOR = "rgba(168, 85, 247, 0.15)";

export default function SpikeRaster({
  spikeRaster,
  activeChannels,
}: SpikeRasterProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const historyRef = useRef<boolean[][]>(
    Array.from({ length: CHANNEL_COUNT }, () => [])
  );

  // Push new column of spikes into history
  useEffect(() => {
    if (!spikeRaster) return;

    const history = historyRef.current;
    for (let ch = 0; ch < CHANNEL_COUNT; ch++) {
      const row = spikeRaster[ch];
      if (row && row.length > 0) {
        // Push the latest spike value
        history[ch].push(row[row.length - 1]);
      } else {
        history[ch].push(false);
      }
      // Trim to visible window
      if (history[ch].length > VISIBLE_TIME_BINS) {
        history[ch] = history[ch].slice(-VISIBLE_TIME_BINS);
      }
    }
  }, [spikeRaster]);

  // Render
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    // Clear to black
    ctx.fillStyle = "#08080c";
    ctx.fillRect(0, 0, width, height);

    const history = historyRef.current;
    const activeSet = new Set(activeChannels);
    const binWidth = Math.max(1, Math.floor(width / VISIBLE_TIME_BINS));

    // Detect burst columns (>30% of channels firing)
    for (let t = 0; t < VISIBLE_TIME_BINS; t++) {
      let firingCount = 0;
      for (let ch = 0; ch < CHANNEL_COUNT; ch++) {
        if (history[ch]?.[t]) firingCount++;
      }
      if (firingCount > CHANNEL_COUNT * 0.3) {
        ctx.fillStyle = BURST_BAND_COLOR;
        ctx.fillRect(t * binWidth, 0, binWidth, height);
      }
    }

    // Draw spikes
    for (let ch = 0; ch < CHANNEL_COUNT; ch++) {
      const row = history[ch];
      if (!row) continue;

      const yPos = ch * ROW_HEIGHT;
      const isActive = activeSet.has(ch);

      for (let t = 0; t < row.length; t++) {
        if (row[t]) {
          ctx.fillStyle = isActive
            ? SPIKE_COLOR_ACTIVE
            : SPIKE_COLOR_NORMAL;
          ctx.fillRect(t * binWidth, yPos, binWidth, ROW_HEIGHT);
        }
      }
    }

    // Channel separators (every 8 channels)
    ctx.strokeStyle = "rgba(255,255,255,0.05)";
    ctx.lineWidth = 1;
    for (let i = 8; i < CHANNEL_COUNT; i += 8) {
      ctx.beginPath();
      ctx.moveTo(0, i * ROW_HEIGHT);
      ctx.lineTo(width, i * ROW_HEIGHT);
      ctx.stroke();
    }

    // Active channel markers on left edge
    for (const ch of activeChannels) {
      if (ch >= 0 && ch < CHANNEL_COUNT) {
        ctx.fillStyle = SPIKE_COLOR_ACTIVE;
        ctx.fillRect(0, ch * ROW_HEIGHT, 2, ROW_HEIGHT);
      }
    }

    // Time axis marker (current time indicator)
    const currentX = Math.min(
      (history[0]?.length || 0) * binWidth,
      width
    );
    ctx.strokeStyle = "rgba(0, 255, 136, 0.3)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(currentX, 0);
    ctx.lineTo(currentX, height);
    ctx.stroke();
  }, [activeChannels]);

  // Animation frame for smooth rendering
  useEffect(() => {
    let animFrame: number;
    const loop = () => {
      render();
      animFrame = requestAnimationFrame(loop);
    };
    animFrame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animFrame);
  }, [render]);

  return (
    <div className="relative">
      <canvas
        ref={canvasRef}
        width={400}
        height={CANVAS_HEIGHT}
        className="w-full rounded-sm"
        style={{
          height: `${CANVAS_HEIGHT}px`,
          imageRendering: "pixelated",
        }}
      />
      {/* Channel labels */}
      <div className="absolute left-1 top-0 flex flex-col justify-between pointer-events-none"
           style={{ height: `${CANVAS_HEIGHT}px` }}>
        {[0, 16, 32, 48, 63].map((ch) => (
          <span key={ch} className="text-[7px] text-neural-dim leading-none">
            {ch}
          </span>
        ))}
      </div>
    </div>
  );
}
