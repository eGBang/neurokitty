// ============================================================================
// NEUROKITTY - Decoded Neural Activity
// Motor vector compass, direction bars, movement trail, reward indicators
// ============================================================================

"use client";

import React, { useRef, useEffect, useCallback } from "react";
import { NeuralState, GameState, Vec2 } from "@/lib/types";

interface NeuralActivityProps {
  neuralState: NeuralState | null;
  gameState: GameState | null;
}

const DIRECTION_LABELS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
const TRAIL_LENGTH = 50;

export default function NeuralActivity({
  neuralState,
  gameState,
}: NeuralActivityProps) {
  const compassCanvasRef = useRef<HTMLCanvasElement>(null);
  const trailRef = useRef<Vec2[]>([]);
  const rewardFlashRef = useRef<{ type: "reward" | "punishment"; time: number } | null>(null);

  // Track movement trail
  useEffect(() => {
    if (!gameState) return;
    const trail = trailRef.current;
    trail.push({ x: gameState.cat.x, y: gameState.cat.y });
    if (trail.length > TRAIL_LENGTH) trail.shift();
  }, [gameState?.tick]);

  // Track reward events
  useEffect(() => {
    if (gameState?.reward_event) {
      rewardFlashRef.current = {
        type: gameState.reward_event,
        time: performance.now(),
      };
    }
  }, [gameState?.reward_event]);

  // Draw compass and direction bars
  const drawCompass = useCallback(() => {
    const canvas = compassCanvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const size = canvas.width;
    const cx = size / 2;
    const cy = size / 2;
    const radius = size / 2 - 20;

    ctx.clearRect(0, 0, size, size);

    // Background circle
    ctx.fillStyle = "#08080c";
    ctx.beginPath();
    ctx.arc(cx, cy, radius + 5, 0, Math.PI * 2);
    ctx.fill();

    // Outer ring
    ctx.strokeStyle = "#1a1a2e";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.stroke();

    // Direction tick marks and labels
    for (let i = 0; i < 8; i++) {
      const angle = (i * Math.PI) / 4 - Math.PI / 2; // Start from N
      const innerR = radius - 8;
      const outerR = radius;

      ctx.strokeStyle = "#2a2a4e";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(angle) * innerR, cy + Math.sin(angle) * innerR);
      ctx.lineTo(cx + Math.cos(angle) * outerR, cy + Math.sin(angle) * outerR);
      ctx.stroke();

      // Label
      ctx.fillStyle = "#555570";
      ctx.font = "bold 8px monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const labelR = radius + 12;
      ctx.fillText(
        DIRECTION_LABELS[i],
        cx + Math.cos(angle) * labelR,
        cy + Math.sin(angle) * labelR
      );
    }

    // Population activity bars (8 directions)
    if (neuralState?.population_activity) {
      for (let i = 0; i < 8; i++) {
        const angle = (i * Math.PI) / 4 - Math.PI / 2;
        const activity = neuralState.population_activity[i] || 0;
        const barLength = activity * (radius - 15);

        if (barLength > 1) {
          const gradient = ctx.createLinearGradient(
            cx,
            cy,
            cx + Math.cos(angle) * barLength,
            cy + Math.sin(angle) * barLength
          );
          gradient.addColorStop(0, "rgba(168, 85, 247, 0.1)");
          gradient.addColorStop(1, "rgba(168, 85, 247, 0.6)");

          ctx.strokeStyle = gradient;
          ctx.lineWidth = 6;
          ctx.lineCap = "round";
          ctx.beginPath();
          ctx.moveTo(cx + Math.cos(angle) * 8, cy + Math.sin(angle) * 8);
          ctx.lineTo(
            cx + Math.cos(angle) * barLength,
            cy + Math.sin(angle) * barLength
          );
          ctx.stroke();
        }
      }
    }

    // Motor vector arrow
    if (neuralState?.motor_vector) {
      const mv = neuralState.motor_vector;
      if (mv.magnitude > 0.01) {
        const arrowLen = mv.magnitude * (radius - 10);
        const arrowAngle = Math.atan2(mv.dy, mv.dx);
        const endX = cx + Math.cos(arrowAngle) * arrowLen;
        const endY = cy + Math.sin(arrowAngle) * arrowLen;

        // Arrow shaft
        ctx.strokeStyle = "#00ff88";
        ctx.lineWidth = 3;
        ctx.lineCap = "round";
        ctx.shadowColor = "#00ff88";
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(endX, endY);
        ctx.stroke();

        // Arrowhead
        const headLen = 8;
        const headAngle = 0.4;
        ctx.beginPath();
        ctx.moveTo(endX, endY);
        ctx.lineTo(
          endX - Math.cos(arrowAngle - headAngle) * headLen,
          endY - Math.sin(arrowAngle - headAngle) * headLen
        );
        ctx.moveTo(endX, endY);
        ctx.lineTo(
          endX - Math.cos(arrowAngle + headAngle) * headLen,
          endY - Math.sin(arrowAngle + headAngle) * headLen
        );
        ctx.stroke();

        ctx.shadowBlur = 0;
      }
    }

    // Center dot
    ctx.fillStyle = "#00ff88";
    ctx.beginPath();
    ctx.arc(cx, cy, 3, 0, Math.PI * 2);
    ctx.fill();

    // Movement trail (small inset)
    const trail = trailRef.current;
    if (trail.length > 1) {
      const trailSize = 30;
      const trailX = size - trailSize - 5;
      const trailY = size - trailSize - 5;

      // Background
      ctx.fillStyle = "rgba(10, 10, 15, 0.8)";
      ctx.fillRect(trailX, trailY, trailSize, trailSize);
      ctx.strokeStyle = "#1a1a2e";
      ctx.lineWidth = 0.5;
      ctx.strokeRect(trailX, trailY, trailSize, trailSize);

      // Normalize trail to fit
      const minX = Math.min(...trail.map((p) => p.x));
      const maxX = Math.max(...trail.map((p) => p.x));
      const minY = Math.min(...trail.map((p) => p.y));
      const maxY = Math.max(...trail.map((p) => p.y));
      const rangeX = maxX - minX || 1;
      const rangeY = maxY - minY || 1;

      ctx.strokeStyle = "rgba(0, 255, 136, 0.5)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i < trail.length; i++) {
        const px = trailX + 2 + ((trail[i].x - minX) / rangeX) * (trailSize - 4);
        const py = trailY + 2 + ((trail[i].y - minY) / rangeY) * (trailSize - 4);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();

      // Current position dot
      const lastP = trail[trail.length - 1];
      const lpx = trailX + 2 + ((lastP.x - minX) / rangeX) * (trailSize - 4);
      const lpy = trailY + 2 + ((lastP.y - minY) / rangeY) * (trailSize - 4);
      ctx.fillStyle = "#00ff88";
      ctx.fillRect(lpx - 1, lpy - 1, 3, 3);
    }
  }, [neuralState, gameState?.tick]);

  useEffect(() => {
    drawCompass();
  }, [drawCompass]);

  // Reward flash state
  const rewardFlash = rewardFlashRef.current;
  const flashActive =
    rewardFlash && performance.now() - rewardFlash.time < 500;
  const flashClass = flashActive
    ? rewardFlash?.type === "reward"
      ? "reward-flash"
      : "punish-flash"
    : "";

  return (
    <div className={`flex flex-col items-center gap-2 ${flashClass}`}>
      {/* Compass */}
      <canvas
        ref={compassCanvasRef}
        width={180}
        height={180}
        className="rounded"
      />

      {/* Velocity info */}
      <div className="flex gap-4 text-[9px]">
        <div className="flex flex-col items-center">
          <span className="text-neural-dim uppercase tracking-wider">
            Velocity
          </span>
          <span className="text-neural-green mono-number text-sm">
            {neuralState?.motor_vector
              ? neuralState.motor_vector.magnitude.toFixed(2)
              : "0.00"}
          </span>
        </div>
        <div className="flex flex-col items-center">
          <span className="text-neural-dim uppercase tracking-wider">
            Direction
          </span>
          <span className="text-neural-purple mono-number text-sm">
            {neuralState?.motor_vector
              ? `${neuralState.motor_vector.direction_degrees.toFixed(0)}\u00B0`
              : "--\u00B0"}
          </span>
        </div>
        <div className="flex flex-col items-center">
          <span className="text-neural-dim uppercase tracking-wider">
            Reward
          </span>
          <span
            className="mono-number text-sm"
            style={{
              color: neuralState
                ? neuralState.reward_signal > 0
                  ? "#00ff88"
                  : neuralState.reward_signal < 0
                  ? "#ff006e"
                  : "#555570"
                : "#555570",
            }}
          >
            {neuralState ? neuralState.reward_signal.toFixed(2) : "0.00"}
          </span>
        </div>
      </div>

      {/* Direction bars */}
      <div className="w-full grid grid-cols-8 gap-0.5">
        {DIRECTION_LABELS.map((dir, i) => {
          const activity =
            neuralState?.population_activity?.[i] ?? 0;
          return (
            <div key={dir} className="flex flex-col items-center gap-0.5">
              <div className="w-full h-8 bg-neural-dark rounded-sm relative overflow-hidden">
                <div
                  className="absolute bottom-0 left-0 right-0 rounded-sm transition-all duration-150"
                  style={{
                    height: `${activity * 100}%`,
                    backgroundColor:
                      activity > 0.6
                        ? "#00ff88"
                        : activity > 0.3
                        ? "#a855f7"
                        : "#1a1a2e",
                    boxShadow:
                      activity > 0.5
                        ? `0 0 4px ${
                            activity > 0.6 ? "#00ff8840" : "#a855f740"
                          }`
                        : "none",
                  }}
                />
              </div>
              <span className="text-[7px] text-neural-dim">{dir}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
