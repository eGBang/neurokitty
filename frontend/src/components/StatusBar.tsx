// ============================================================================
// NEUROKITTY - Status Bar
// Top bar: title, culture status, tick counter, energy bar, score
// ============================================================================

"use client";

import React from "react";
import { GameState, NeuralState, ConnectionStatus } from "@/lib/types";

interface StatusBarProps {
  gameState: GameState | null;
  neuralState: NeuralState | null;
  connectionStatus: ConnectionStatus;
  fps: number;
  latency: number;
}

export default function StatusBar({
  gameState,
  neuralState,
  connectionStatus,
  fps,
  latency,
}: StatusBarProps) {
  const connected = connectionStatus === "connected";
  const energy = gameState?.cat.energy ?? 100;
  const maxEnergy = 100;
  const energyPct = Math.min((energy / maxEnergy) * 100, 100);
  const score = gameState?.score ?? 0;
  const berriesCollected = gameState?.berries_collected ?? 0;
  const tick = gameState?.tick ?? 0;

  // Energy color: green at high, yellow mid, red low
  const energyColor =
    energyPct > 60 ? "#00ff88" : energyPct > 30 ? "#ffcc00" : "#ff006e";

  return (
    <div className="flex items-center gap-3 px-3 py-1.5 bg-neural-panel border-b border-neural-border min-h-[36px]">
      {/* Logo / Title */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <span className="text-sm font-bold tracking-wider text-neural-green glow-text-green">
          NEUROKITTY
        </span>
        <span className="text-[8px] text-neural-dim">v0.1</span>
      </div>

      {/* Separator */}
      <div className="w-px h-5 bg-neural-border" />

      {/* Culture Status */}
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <div
          className={`w-2 h-2 rounded-full ${
            connected
              ? "bg-neural-green status-pulse"
              : "bg-neural-pink status-pulse-red"
          }`}
        />
        <span
          className={`text-[9px] uppercase tracking-wider font-semibold ${
            connected ? "text-neural-green" : "text-neural-pink"
          }`}
        >
          {connected ? "CULTURE ONLINE" : "CULTURE OFFLINE"}
        </span>
      </div>

      {/* Separator */}
      <div className="w-px h-5 bg-neural-border" />

      {/* Tick Counter */}
      <div className="flex items-center gap-1 flex-shrink-0">
        <span className="text-[8px] text-neural-dim uppercase">Tick</span>
        <span className="text-[10px] text-neural-purple mono-number font-semibold">
          {tick.toLocaleString()}
        </span>
      </div>

      {/* Separator */}
      <div className="w-px h-5 bg-neural-border" />

      {/* Energy Bar */}
      <div className="flex items-center gap-1.5 min-w-[120px]">
        <span className="text-[8px] text-neural-dim uppercase">Energy</span>
        <div className="flex-1 h-2.5 bg-neural-dark rounded-full overflow-hidden border border-neural-border">
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{
              width: `${energyPct}%`,
              backgroundColor: energyColor,
              boxShadow: `0 0 6px ${energyColor}40`,
            }}
          />
        </div>
        <span
          className="text-[9px] mono-number font-semibold min-w-[28px] text-right"
          style={{ color: energyColor }}
        >
          {Math.round(energy)}
        </span>
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Score */}
      <div className="flex items-center gap-1 flex-shrink-0">
        <span className="text-[8px] text-neural-dim uppercase">Score</span>
        <span className="text-sm text-neural-green mono-number font-bold glow-text-green">
          {score.toLocaleString()}
        </span>
      </div>

      {/* Separator */}
      <div className="w-px h-5 bg-neural-border" />

      {/* Berries */}
      <div className="flex items-center gap-1 flex-shrink-0">
        <span className="text-[10px]" role="img" aria-label="berry">
          {/* Berry icon as colored dot */}
        </span>
        <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
        <span className="text-[10px] text-neural-text mono-number">
          {berriesCollected}
        </span>
      </div>

      {/* Separator */}
      <div className="w-px h-5 bg-neural-border" />

      {/* FPS & Connection */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <span className="text-[8px] text-neural-dim mono-number">
          {fps} FPS
        </span>
        <span className="text-[8px] text-neural-dim mono-number">
          {latency > 0 ? `${Math.round(latency)}ms` : "--ms"}
        </span>
        <div
          className={`w-1.5 h-1.5 rounded-full ${
            connected ? "bg-neural-green" : "bg-neural-pink"
          }`}
        />
      </div>
    </div>
  );
}
