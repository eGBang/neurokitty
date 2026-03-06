// ============================================================================
// NEUROKITTY - Dashboard Container
// Neural monitoring panels grid layout
// ============================================================================

"use client";

import React from "react";
import { NeuralState, GameState } from "@/lib/types";
import { HealthHistoryEntry } from "@/lib/types";
import SpikeRaster from "./SpikeRaster";
import FiringRateChart from "./FiringRateChart";
import CultureHealth from "./CultureHealth";
import NeuralActivity from "./NeuralActivity";

interface DashboardProps {
  neuralState: NeuralState | null;
  gameState: GameState | null;
  healthHistory: HealthHistoryEntry[];
}

export default function Dashboard({
  neuralState,
  gameState,
  healthHistory,
}: DashboardProps) {
  return (
    <div className="flex flex-col gap-2 h-full p-2 overflow-y-auto">
      {/* Header */}
      <div className="flex items-center gap-2 px-2 py-1">
        <div className="w-2 h-2 rounded-full bg-neural-green status-pulse" />
        <span className="text-[10px] uppercase tracking-widest text-neural-green font-semibold">
          Neural Dashboard
        </span>
        <div className="flex-1 h-px bg-gradient-to-r from-neural-green/20 to-transparent" />
      </div>

      {/* Firing Rate Heatmap */}
      <div className="neural-panel p-2">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[9px] uppercase tracking-wider text-neural-purple font-semibold">
            MEA Firing Rates
          </span>
          <div className="flex-1 h-px bg-neural-border" />
          <span className="text-[9px] text-neural-dim mono-number">
            {neuralState
              ? `${neuralState.culture_health.mean_firing_rate.toFixed(1)} Hz`
              : "-- Hz"}
          </span>
        </div>
        <FiringRateChart
          firingRates={neuralState?.firing_rates || null}
          activeChannels={neuralState?.active_channels || []}
        />
      </div>

      {/* Spike Raster */}
      <div className="neural-panel p-2">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[9px] uppercase tracking-wider text-neural-green font-semibold">
            Spike Raster
          </span>
          <div className="flex-1 h-px bg-neural-border" />
          <span className="text-[9px] text-neural-dim mono-number">
            64 CH
          </span>
        </div>
        <SpikeRaster
          spikeRaster={neuralState?.spike_raster || null}
          activeChannels={neuralState?.active_channels || []}
        />
      </div>

      {/* Decoded Neural Activity */}
      <div className="neural-panel p-2">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[9px] uppercase tracking-wider text-neural-pink font-semibold">
            Motor Decode
          </span>
          <div className="flex-1 h-px bg-neural-border" />
        </div>
        <NeuralActivity
          neuralState={neuralState}
          gameState={gameState}
        />
      </div>

      {/* Culture Health */}
      <div className="neural-panel p-2">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[9px] uppercase tracking-wider text-neural-green font-semibold">
            Culture Health
          </span>
          <div className="flex-1 h-px bg-neural-border" />
        </div>
        <CultureHealth
          health={neuralState?.culture_health || null}
          history={healthHistory}
        />
      </div>
    </div>
  );
}
