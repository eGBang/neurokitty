// ============================================================================
// NEUROKITTY - Main Page
// Layout: Status bar on top, game canvas (left), dashboard (right)
// ============================================================================

"use client";

import React, { useEffect } from "react";
import { useWebSocket } from "@/hooks/useWebSocket";
import { useGameState } from "@/hooks/useGameState";
import WorldCanvas from "@/components/WorldCanvas";
import Dashboard from "@/components/Dashboard";
import StatusBar from "@/components/StatusBar";

export default function HomePage() {
  const {
    gameState,
    neuralState,
    tilemap,
    connected,
    connectionStatus,
    latency,
  } = useWebSocket();

  const {
    interpolatedState,
    fps,
    scoreHistory,
    healthHistory,
    pushGameState,
    pushNeuralState,
  } = useGameState();

  // Push incoming states to the game state manager
  useEffect(() => {
    if (gameState) pushGameState(gameState);
  }, [gameState, pushGameState]);

  useEffect(() => {
    if (neuralState) pushNeuralState(neuralState);
  }, [neuralState, pushNeuralState]);

  // Use interpolated state for rendering, fall back to raw state
  const displayState = interpolatedState || gameState;

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-neural-dark">
      {/* Top Status Bar */}
      <StatusBar
        gameState={displayState}
        neuralState={neuralState}
        connectionStatus={connectionStatus}
        fps={fps}
        latency={latency}
      />

      {/* Main Content */}
      <div className="flex flex-1 min-h-0">
        {/* Game World Canvas - ~65% width */}
        <div className="flex-[65] min-w-0 relative">
          <WorldCanvas
            gameState={displayState}
            tilemap={tilemap}
          />

          {/* Connection overlay when disconnected */}
          {!connected && (
            <div className="absolute inset-0 flex items-center justify-center bg-neural-dark/80 z-20">
              <div className="neural-panel p-6 flex flex-col items-center gap-3">
                <div className="w-3 h-3 rounded-full bg-neural-pink status-pulse-red" />
                <span className="text-neural-pink text-sm font-semibold uppercase tracking-wider">
                  Waiting for Culture Connection
                </span>
                <span className="text-neural-dim text-xs">
                  Attempting to connect to ws://localhost:8000/ws
                </span>
                <div className="flex items-center gap-2 mt-2">
                  <div className="w-1 h-1 bg-neural-purple rounded-full animate-pulse" />
                  <div
                    className="w-1 h-1 bg-neural-purple rounded-full animate-pulse"
                    style={{ animationDelay: "0.3s" }}
                  />
                  <div
                    className="w-1 h-1 bg-neural-purple rounded-full animate-pulse"
                    style={{ animationDelay: "0.6s" }}
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Dashboard - ~35% width */}
        <div className="flex-[35] min-w-[280px] max-w-[400px] border-l border-neural-border bg-neural-panel overflow-hidden">
          <Dashboard
            neuralState={neuralState}
            gameState={displayState}
            healthHistory={healthHistory}
          />
        </div>
      </div>

      {/* Bottom bar */}
      <div className="flex items-center justify-between px-3 py-1 bg-neural-panel border-t border-neural-border text-[8px] text-neural-dim">
        <span>
          NEUROKITTY Biological Neural Culture Interface // Cortical Labs CL1
        </span>
        <span className="mono-number">
          {connected ? "STREAM ACTIVE" : "NO SIGNAL"} | {new Date().toLocaleTimeString()}
        </span>
      </div>
    </div>
  );
}
