"use client";
/* eslint-disable react-hooks/immutability -- WebGL diagnostic counters are mutable renderer state. */

import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";

/** Opt-in development diagnostics. Counts all passes, including bloom/refraction. */
export function RendererDiagnostics() {
  const gl = useThree((state) => state.gl);
  const enabled = useRef(false);
  const sample = useRef({ frames: 0, started: 0, calls: 0, triangles: 0 });
  useEffect(() => {
    enabled.current = process.env.NODE_ENV === "development" &&
      new URLSearchParams(window.location.search).has("strataStats");
    if (!enabled.current) return;
    const previous = gl.info.autoReset;
    gl.info.autoReset = false;
    return () => { gl.info.autoReset = previous; };
  }, [gl]);
  useFrame(() => {
    if (!enabled.current) return;
    const stats = sample.current;
    const now = performance.now();
    if (!stats.started) stats.started = now;
    stats.frames++;
    stats.calls += gl.info.render.calls;
    stats.triangles += gl.info.render.triangles;
    if (stats.frames >= 120) {
      console.info("[strata-performance]", JSON.stringify({
        fps: Math.round(stats.frames * 1000 / (now - stats.started)),
        calls: Math.round(stats.calls / stats.frames),
        triangles: Math.round(stats.triangles / stats.frames),
        geometries: gl.info.memory.geometries,
        textures: gl.info.memory.textures,
        dpr: gl.getPixelRatio(),
      }));
      stats.frames = stats.calls = stats.triangles = 0;
      stats.started = now;
    }
    gl.info.reset();
  }, -100);
  return null;
}
