// ============================================================================
// NEUROKITTY - World Canvas
// Main game rendering canvas with camera tracking and requestAnimationFrame
// ============================================================================

"use client";

import React, { useRef, useEffect, useCallback } from "react";
import { Camera } from "@/lib/camera";
import { CanvasRenderer } from "@/lib/renderer";
import { GameState, TileMap } from "@/lib/types";

interface WorldCanvasProps {
  gameState: GameState | null;
  tilemap: TileMap | null;
  className?: string;
}

export default function WorldCanvas({
  gameState,
  tilemap,
  className = "",
}: WorldCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const cameraRef = useRef<Camera | null>(null);
  const rendererRef = useRef<CanvasRenderer | null>(null);
  const gameStateRef = useRef<GameState | null>(null);
  const lastTimeRef = useRef<number>(0);
  const animFrameRef = useRef<number>(0);

  // Keep game state ref up to date
  gameStateRef.current = gameState;

  // Initialize renderer when tilemap changes
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;

    const worldW = tilemap ? tilemap.width * tilemap.tile_size : 2800;
    const worldH = tilemap ? tilemap.height * tilemap.tile_size : 1500;

    rendererRef.current = new CanvasRenderer(ctx, tilemap || undefined);
    cameraRef.current = new Camera(
      canvas.width,
      canvas.height,
      worldW,
      worldH
    );

    // Snap camera to center initially
    cameraRef.current.snapTo(worldW / 2, worldH / 2);
  }, [tilemap]);

  // Handle resize
  const handleResize = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const rect = container.getBoundingClientRect();
    const dpr = 1; // Use 1 for pixel-art crispness
    canvas.width = Math.floor(rect.width * dpr);
    canvas.height = Math.floor(rect.height * dpr);
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;

    if (cameraRef.current) {
      cameraRef.current.resize(canvas.width, canvas.height);
    }
  }, []);

  useEffect(() => {
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [handleResize]);

  // Render loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const renderFrame = (timestamp: number) => {
      const deltaTime =
        lastTimeRef.current === 0
          ? 1 / 60
          : (timestamp - lastTimeRef.current) / 1000;
      lastTimeRef.current = timestamp;

      const camera = cameraRef.current;
      const renderer = rendererRef.current;
      const state = gameStateRef.current;

      if (camera && renderer) {
        // Update camera target to follow cat
        if (state) {
          camera.setTarget(state.cat.x, state.cat.y);

          // Trigger shake on damage
          if (state.cat.is_damaged) {
            camera.shake(4, 0.2);
          }
        }

        camera.update(deltaTime);
        renderer.render(camera, state, deltaTime);
      }

      animFrameRef.current = requestAnimationFrame(renderFrame);
    };

    animFrameRef.current = requestAnimationFrame(renderFrame);

    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-full overflow-hidden bg-neural-dark ${className}`}
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        style={{ imageRendering: "pixelated" }}
      />
      {/* Vignette overlay */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse at center, transparent 50%, rgba(10,10,15,0.4) 100%)",
        }}
      />
      {/* Scan line overlay */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.03]"
        style={{
          background:
            "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.5) 2px, rgba(0,0,0,0.5) 4px)",
        }}
      />
    </div>
  );
}
