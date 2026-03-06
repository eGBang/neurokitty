// ============================================================================
// NEUROKITTY - Game State Management Hook
// Interpolation, history tracking, and derived state computation
// ============================================================================

"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  GameState,
  NeuralState,
  CatState,
  ScoreEntry,
  HealthHistoryEntry,
} from "@/lib/types";

interface UseGameStateReturn {
  /** Interpolated game state for smooth rendering */
  interpolatedState: GameState | null;
  /** Whether the cat is alive */
  isAlive: boolean;
  /** Current biome the cat is in */
  currentBiome: string;
  /** Distance to nearest enemy */
  nearestEnemyDistance: number;
  /** Score history for charting */
  scoreHistory: ScoreEntry[];
  /** Culture health history for sparklines */
  healthHistory: HealthHistoryEntry[];
  /** Frames per second */
  fps: number;
  /** Update with new server state */
  pushGameState: (state: GameState) => void;
  pushNeuralState: (state: NeuralState) => void;
}

const MAX_HISTORY = 300;
const INTERPOLATION_FACTOR = 0.15;

export function useGameState(): UseGameStateReturn {
  const [fps, setFps] = useState(0);

  const prevStateRef = useRef<GameState | null>(null);
  const currentStateRef = useRef<GameState | null>(null);
  const interpolatedRef = useRef<GameState | null>(null);
  const scoreHistoryRef = useRef<ScoreEntry[]>([]);
  const healthHistoryRef = useRef<HealthHistoryEntry[]>([]);

  // FPS tracking
  const frameCountRef = useRef(0);
  const fpsTimerRef = useRef(performance.now());

  // Force re-render periodically for derived values
  const [, forceUpdate] = useState(0);

  const pushGameState = useCallback((state: GameState) => {
    prevStateRef.current = currentStateRef.current;
    currentStateRef.current = state;

    // Update score history
    const sh = scoreHistoryRef.current;
    sh.push({ tick: state.tick, score: state.score });
    if (sh.length > MAX_HISTORY) sh.shift();
  }, []);

  const pushNeuralState = useCallback((state: NeuralState) => {
    const hh = healthHistoryRef.current;
    hh.push({
      tick: state.tick,
      viability: state.culture_health.viability,
      mean_firing_rate: state.culture_health.mean_firing_rate,
      burst_index: state.culture_health.burst_index,
      adaptation_level: state.culture_health.adaptation_level,
    });
    if (hh.length > MAX_HISTORY) hh.shift();
  }, []);

  // Interpolation loop
  useEffect(() => {
    let animFrame: number;

    const tick = () => {
      const prev = prevStateRef.current;
      const curr = currentStateRef.current;

      if (curr) {
        if (prev && interpolatedRef.current) {
          // Interpolate cat position
          const interp = { ...curr };
          const interpCat = { ...curr.cat };
          const prevInterp = interpolatedRef.current.cat;

          interpCat.x =
            prevInterp.x + (curr.cat.x - prevInterp.x) * INTERPOLATION_FACTOR;
          interpCat.y =
            prevInterp.y + (curr.cat.y - prevInterp.y) * INTERPOLATION_FACTOR;
          interpCat.animation_frame = curr.cat.animation_frame;

          // Interpolate enemies
          const interpEnemies = curr.enemies.map((enemy, i) => {
            const prevEnemy = interpolatedRef.current?.enemies[i];
            if (!prevEnemy) return enemy;
            return {
              ...enemy,
              x: prevEnemy.x + (enemy.x - prevEnemy.x) * INTERPOLATION_FACTOR,
              y: prevEnemy.y + (enemy.y - prevEnemy.y) * INTERPOLATION_FACTOR,
            };
          });

          interp.cat = interpCat;
          interp.enemies = interpEnemies;
          interpolatedRef.current = interp;
        } else {
          interpolatedRef.current = { ...curr };
        }
      }

      // FPS counting
      frameCountRef.current++;
      const now = performance.now();
      if (now - fpsTimerRef.current >= 1000) {
        setFps(frameCountRef.current);
        frameCountRef.current = 0;
        fpsTimerRef.current = now;
        forceUpdate((v) => v + 1);
      }

      animFrame = requestAnimationFrame(tick);
    };

    animFrame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animFrame);
  }, []);

  // Derived values
  const isAlive = useMemo(() => {
    const state = currentStateRef.current;
    return state ? state.cat.health > 0 : true;
  }, [currentStateRef.current?.cat.health]);

  const currentBiome = useMemo(() => {
    const state = currentStateRef.current;
    if (!state) return "unknown";
    // Simplified biome detection based on position
    const x = state.cat.x;
    const y = state.cat.y;
    if (x < 400 && y < 400) return "forest";
    if (x > 2000) return "plains";
    if (y > 1000) return "wetlands";
    return "grasslands";
  }, [currentStateRef.current?.cat.x, currentStateRef.current?.cat.y]);

  const nearestEnemyDistance = useMemo(() => {
    const state = currentStateRef.current;
    if (!state || state.enemies.length === 0) return Infinity;

    let minDist = Infinity;
    for (const enemy of state.enemies) {
      const dx = enemy.x - state.cat.x;
      const dy = enemy.y - state.cat.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < minDist) minDist = dist;
    }
    return minDist;
  }, [currentStateRef.current?.tick]);

  return {
    interpolatedState: interpolatedRef.current,
    isAlive,
    currentBiome,
    nearestEnemyDistance,
    scoreHistory: scoreHistoryRef.current,
    healthHistory: healthHistoryRef.current,
    fps,
    pushGameState,
    pushNeuralState,
  };
}
