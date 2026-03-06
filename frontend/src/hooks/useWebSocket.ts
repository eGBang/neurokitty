// ============================================================================
// NEUROKITTY - WebSocket Hook
// Connects to the backend, parses state updates, handles reconnection
// ============================================================================

"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  GameState,
  NeuralState,
  TileMap,
  ConnectionStatus,
  ServerMessage,
} from "@/lib/types";

interface UseWebSocketReturn {
  gameState: GameState | null;
  neuralState: NeuralState | null;
  tilemap: TileMap | null;
  connected: boolean;
  connectionStatus: ConnectionStatus;
  latency: number;
  reconnect: () => void;
}

const WS_URL = "ws://localhost:8000/ws";
const MAX_RECONNECT_DELAY = 30000;
const INITIAL_RECONNECT_DELAY = 1000;

export function useWebSocket(): UseWebSocketReturn {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [neuralState, setNeuralState] = useState<NeuralState | null>(null);
  const [tilemap, setTilemap] = useState<TileMap | null>(null);
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>("disconnected");
  const [latency, setLatency] = useState<number>(0);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectDelayRef = useRef<number>(INITIAL_RECONNECT_DELAY);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const lastMessageTimeRef = useRef<number>(0);

  const connect = useCallback(() => {
    // Clean up existing connection
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    setConnectionStatus("connecting");

    try {
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log("[NEUROKITTY] WebSocket connected");
        setConnectionStatus("connected");
        reconnectDelayRef.current = INITIAL_RECONNECT_DELAY;
      };

      ws.onmessage = (event: MessageEvent) => {
        const now = performance.now();
        try {
          const message: ServerMessage = JSON.parse(event.data);

          // Calculate latency
          if (message.timestamp) {
            setLatency(now - message.timestamp);
          }
          lastMessageTimeRef.current = now;

          switch (message.type) {
            case "init":
              if (message.tilemap) {
                setTilemap(message.tilemap);
              }
              if (message.game_state) {
                setGameState(message.game_state);
              }
              if (message.neural_state) {
                setNeuralState(message.neural_state);
              }
              break;

            case "state_update":
              if (message.game_state) {
                setGameState(message.game_state);
              }
              if (message.neural_state) {
                setNeuralState(message.neural_state);
              }
              break;

            case "error":
              console.error("[NEUROKITTY] Server error:", message);
              break;
          }
        } catch (err) {
          console.error("[NEUROKITTY] Failed to parse message:", err);
        }
      };

      ws.onclose = (event: CloseEvent) => {
        console.log(
          `[NEUROKITTY] WebSocket closed: code=${event.code} reason=${event.reason}`
        );
        setConnectionStatus("disconnected");
        wsRef.current = null;

        // Schedule reconnect with exponential backoff
        const delay = reconnectDelayRef.current;
        console.log(`[NEUROKITTY] Reconnecting in ${delay}ms...`);
        reconnectTimeoutRef.current = setTimeout(() => {
          reconnectDelayRef.current = Math.min(
            reconnectDelayRef.current * 2,
            MAX_RECONNECT_DELAY
          );
          connect();
        }, delay);
      };

      ws.onerror = (event: Event) => {
        console.error("[NEUROKITTY] WebSocket error:", event);
        setConnectionStatus("error");
      };
    } catch (err) {
      console.error("[NEUROKITTY] Failed to create WebSocket:", err);
      setConnectionStatus("error");

      // Schedule reconnect
      reconnectTimeoutRef.current = setTimeout(() => {
        reconnectDelayRef.current = Math.min(
          reconnectDelayRef.current * 2,
          MAX_RECONNECT_DELAY
        );
        connect();
      }, reconnectDelayRef.current);
    }
  }, []);

  const reconnect = useCallback(() => {
    reconnectDelayRef.current = INITIAL_RECONNECT_DELAY;
    connect();
  }, [connect]);

  useEffect(() => {
    connect();

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [connect]);

  return {
    gameState,
    neuralState,
    tilemap,
    connected: connectionStatus === "connected",
    connectionStatus,
    latency,
    reconnect,
  };
}
