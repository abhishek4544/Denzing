"use client";

import { Suspense, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { Canvas, useThree, type RootState } from "@react-three/fiber";
import * as THREE from "three";
import { BufferTarget, CanvasSource, getFirstEncodableVideoCodec, Output, Quality, Mp4OutputFormat, WebMOutputFormat } from "mediabunny";
import { AutonomousAgentsSceneFromSettings } from "./generative-scene";
import { loadVioletFont } from "./layer-name-label";
import type { StrataSettings } from "./defaults";
import { videoDimensions, videoResolutions, type ExportCamera, type VideoExportOptions } from "./export-options";
import { getVideoTiming } from "./export-timing";

function Ready({ onReady }: { onReady: (state: RootState) => void }) {
  const get = useThree((state) => state.get);
  useEffect(() => { onReady(get()); }, [get, onReady]);
  return null;
}

function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
    promise.then((value) => { signal.removeEventListener("abort", abort); resolve(value); },
      (error) => { signal.removeEventListener("abort", abort); reject(error); });
  });
}

/** Render each timestamp explicitly, so encoding speed never drops animation frames. */
export async function exportStrataVideo(settings: StrataSettings, camera: ExportCamera,
  options: VideoExportOptions, format: "webm" | "mp4", signal: AbortSignal, onProgress: (progress: number) => void) {
  const resolution = videoResolutions.find((item) => item.value === options.resolution);
  const timing = getVideoTiming(settings, options);
  if (!resolution || ![24, 30, 60].includes(options.fps) || !Number.isSafeInteger(timing.frames) || timing.frames < 1 ||
    (!timing.automatic && (!Number.isFinite(options.duration) || options.duration < 1 || options.duration > 30))) {
    throw new Error("Choose a supported resolution, FPS, and duration between 1 and 30 seconds.");
  }
  if (typeof VideoEncoder === "undefined") throw new Error("Video export needs a browser with WebCodecs video encoding. Try the latest Chrome or Edge.");
  const { width, height } = videoDimensions(resolution, settings.canvasAspect, settings.canvasAspectWidth, settings.canvasAspectHeight, camera.viewport);
  const quality = new Quality({ bitrate: Math.round(width * height * options.fps *
    ({ standard: 0.08, high: 0.14, maximum: 0.22 }[options.quality])) });
  const codec = await getFirstEncodableVideoCodec(format === "mp4" ? ["avc"] : ["vp9", "vp8"], { width, height, frameRate: options.fps, quality });
  if (!codec) throw new Error(`This browser cannot encode ${width} × ${height} ${format.toUpperCase()} at ${options.fps} FPS. Try a lower resolution or another browser.`);
  signal.throwIfAborted();
  await abortable(loadVioletFont(), signal);
  signal.throwIfAborted();
  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  Object.assign(host.style, { position: "fixed", left: "-20000px", top: "0", width: `${width}px`, height: `${height}px`, pointerEvents: "none" });
  document.body.appendChild(host);
  const root = createRoot(host);
  const output = new Output({ format: format === "mp4" ? new Mp4OutputFormat({ fastStart: "in-memory" }) : new WebMOutputFormat(), target: new BufferTarget() });
  let source: CanvasSource | undefined;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const cancel = () => { void output.cancel().catch(() => undefined); };
  signal.addEventListener("abort", cancel, { once: true });
  try {
    const state = await abortable(new Promise<RootState>((resolve, reject) => {
      timeout = setTimeout(() => reject(new Error("The export scene could not finish loading. Please try again.")), 30000);
      root.render(<Canvas frameloop="never" dpr={1}
        gl={{ antialias: true, alpha: false, preserveDrawingBuffer: true, powerPreference: "high-performance" }}
        camera={{ position: camera.position, fov: settings.isoView ? Math.min(settings.fov, 22) : settings.fov, near: 0.1, far: 200 }}
        onCreated={({ gl }) => { gl.toneMapping = THREE.ACESFilmicToneMapping; gl.toneMappingExposure = 1.15; gl.localClippingEnabled = true; }}>
        <Suspense fallback={null}>
          <color attach="background" args={[settings.backgroundColor]} />
          <AutonomousAgentsSceneFromSettings settings={settings} />
          <Ready onReady={resolve} />
        </Suspense>
      </Canvas>);
    }), signal);
    clearTimeout(timeout);
    // Let effects (including label textures and postprocessing) finish mounting.
    await abortable(new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))), signal);
    signal.throwIfAborted();
    // ResizeObserver delivery can lag a newly mounted offscreen Canvas.
    // Establish the export size explicitly before allocating postprocessing targets.
    state.setSize(width, height);
    state.setDpr(1);
    state.gl.setSize(width, height, false);
    await abortable(new Promise<void>((resolve) => requestAnimationFrame(() => resolve())), signal);
    signal.throwIfAborted();
    const canvas = state.gl.domElement;
    if (canvas.width !== width || canvas.height !== height) throw new Error(`The device created ${canvas.width} × ${canvas.height} instead of ${width} × ${height}. Please try again.`);
    const target = new THREE.Vector3(...camera.target);
    const initialOffset = new THREE.Vector3(...camera.position).sub(target);
    const up = state.camera.up.clone().normalize();
    const setCameraFrame = (frame: number) => {
      state.camera.position.copy(initialOffset).applyAxisAngle(up, timing.rotationPerFrame * frame).add(target);
      state.camera.lookAt(target);
      state.camera.updateMatrixWorld();
    };
    // Derive the camera from the frame number: renderer warmup cannot advance it.
    setCameraFrame(0);
    state.advance(0);
    state.advance(0);
    await abortable(state.gl.compileAsync(state.scene, state.camera), signal);
    // Compositing canvas: receives the WebGL frame plus the HTML callout
    // overlay drawn each frame so exports include the badges and lines.
    const composite = document.createElement("canvas");
    composite.width = width;
    composite.height = height;
    const compositeCtx = composite.getContext("2d");
    if (!compositeCtx) throw new Error("This browser could not create a 2D canvas for the export compositor.");
    source = new CanvasSource(composite, { codec, quality });
    output.addVideoTrack(source, { frameRate: options.fps });
    await output.start();
    // Capture [0, N): the conceptual frame N matches frame 0. Keep all N frames
    // so the last-to-first step has the same angular distance as every other step.
    const frames = timing.frames;
    for (let frame = 0; frame < frames; frame++) {
      signal.throwIfAborted();
      setCameraFrame(frame);
      state.advance(frame / options.fps);
      compositeCtx.clearRect(0, 0, width, height);
      compositeCtx.drawImage(canvas, 0, 0, width, height);
      await source.add(frame / options.fps, 1 / options.fps);
      onProgress((frame + 1) / frames * 0.95);
      // Yield to Cancel/progress UI, even when the encoder has spare capacity.
      if (frame % 4 === 0) await new Promise((resolve) => setTimeout(resolve, 0));
    }
    source.close();
    await output.finalize();
    signal.throwIfAborted();
    if (!output.target.buffer) throw new Error("The video encoder returned an empty file.");
    onProgress(1);
    return new Blob([output.target.buffer], { type: format === "mp4" ? "video/mp4" : "video/webm" });
  } catch (error) {
    await output.cancel().catch(() => undefined);
    throw error;
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener("abort", cancel);
    source?.close();
    root.unmount();
    host.remove();
  }
}
