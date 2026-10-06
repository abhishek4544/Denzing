"use client";

import { Suspense, useEffect, useMemo } from "react";
import { createRoot } from "react-dom/client";
import { Canvas, useFrame, useThree, type RootState } from "@react-three/fiber";
import * as THREE from "three";
import {
  BufferTarget,
  CanvasSource,
  getFirstEncodableVideoCodec,
  Mp4OutputFormat,
  Output,
  Quality,
  WebMOutputFormat,
} from "mediabunny";
import { BigDataBurstScene } from "./burst-scene";
import { OntologyScene } from "./scene";
import type { ExplorerSettings } from "./defaults";
import type { ModelEdge, ModelNode } from "./model";
import {
  videoDimensions,
  videoResolutions,
  type ExportCamera,
  type VideoExportOptions,
} from "./export-options";

function Ready({ onReady }: { onReady: (state: RootState) => void }) {
  const get = useThree((state) => state.get);
  useEffect(() => {
    onReady(get());
  }, [get, onReady]);
  return null;
}

/** Deterministic camera orbit tied to state.clock.elapsedTime so the exported
 *  video reproduces the same rotation the user sees in the live editor,
 *  independent of encoding speed. */
function DeterministicCameraOrbit({
  position,
  target,
  rotateSpeed,
  enabled,
}: {
  position: [number, number, number];
  target: [number, number, number];
  rotateSpeed: number;
  enabled: boolean;
}) {
  const camera = useThree((state) => state.camera);
  const initial = useMemo(() => {
    const dx = position[0] - target[0];
    const dz = position[2] - target[2];
    return {
      radius: Math.hypot(dx, dz),
      startAngle: Math.atan2(dz, dx),
      y: position[1],
    };
  }, [position, target]);
  useFrame((state) => {
    if (enabled) {
      // Match three.js OrbitControls autoRotate: counter-clockwise around +Y
      // (rotateLeft decreases spherical θ). Live rate: 2π*autoRotateSpeed/60
      // rad/s at 60fps, where autoRotateSpeed = rotateSpeed/25.
      const angularSpeed = (rotateSpeed / 25) * ((Math.PI * 2) / 60);
      // Subtract to reverse direction (our x=R·cos, z=R·sin parametrization
      // is clockwise top-down; subtracting angular time gives CCW).
      const angle = initial.startAngle - state.clock.elapsedTime * angularSpeed;
      camera.position.set(
        target[0] + Math.cos(angle) * initial.radius,
        initial.y,
        target[2] + Math.sin(angle) * initial.radius,
      );
    }
    // Always look at target — otherwise the camera keeps its default -Z gaze.
    camera.lookAt(target[0], target[1], target[2]);
  });
  return null;
}

function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
    promise.then(
      (value) => {
        signal.removeEventListener("abort", abort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", abort);
        reject(error);
      },
    );
  });
}

export async function exportOntologyVideo(
  settings: ExplorerSettings,
  nodes: ModelNode[],
  edges: ModelEdge[],
  camera: ExportCamera,
  options: VideoExportOptions,
  format: "webm" | "mp4",
  signal: AbortSignal,
  onProgress: (progress: number) => void,
) {
  const resolution = videoResolutions.find((item) => item.value === options.resolution);
  if (
    !resolution ||
    ![24, 30, 60].includes(options.fps) ||
    !Number.isFinite(options.duration) ||
    options.duration < 1 ||
    options.duration > 30
  ) {
    throw new Error(
      "Choose a supported resolution, FPS, and duration between 1 and 30 seconds.",
    );
  }
  if (typeof VideoEncoder === "undefined")
    throw new Error(
      "Video export needs a browser with WebCodecs video encoding. Try the latest Chrome or Edge.",
    );
  const { width, height } = videoDimensions(
    resolution,
    settings.canvasAspect,
    settings.canvasAspectWidth,
    settings.canvasAspectHeight,
    camera.viewport,
  );
  const quality = new Quality({
    bitrate: Math.round(
      width *
        height *
        options.fps *
        ({ standard: 0.08, high: 0.14, maximum: 0.22 }[options.quality]),
    ),
  });
  const codec = await getFirstEncodableVideoCodec(
    format === "mp4" ? ["avc"] : ["vp9", "vp8"],
    { width, height, frameRate: options.fps, quality },
  );
  if (!codec)
    throw new Error(
      `This browser cannot encode ${width} × ${height} ${format.toUpperCase()} at ${options.fps} FPS. Try a lower resolution or another browser.`,
    );
  signal.throwIfAborted();
  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  Object.assign(host.style, {
    position: "fixed",
    left: "-20000px",
    top: "0",
    width: `${width}px`,
    height: `${height}px`,
    pointerEvents: "none",
  });
  document.body.appendChild(host);
  const root = createRoot(host);
  const output = new Output({
    format:
      format === "mp4"
        ? new Mp4OutputFormat({ fastStart: "in-memory" })
        : new WebMOutputFormat(),
    target: new BufferTarget(),
  });
  let source: CanvasSource | undefined;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const cancel = () => {
    void output.cancel().catch(() => undefined);
  };
  signal.addEventListener("abort", cancel, { once: true });
  try {
    const state = await abortable(
      new Promise<RootState>((resolve, reject) => {
        timeout = setTimeout(
          () =>
            reject(
              new Error("The export scene could not finish loading. Please try again."),
            ),
          30000,
        );
        root.render(
          <Canvas
            frameloop="never"
            dpr={1}
            gl={{
              antialias: true,
              alpha: false,
              preserveDrawingBuffer: true,
              powerPreference: "high-performance",
            }}
            camera={{
              position: camera.position,
              fov: settings.fov,
              near: 0.1,
              far: 200,
            }}
            onCreated={({ gl }) => {
              gl.toneMapping = THREE.ACESFilmicToneMapping;
              gl.toneMappingExposure = 1.2;
            }}
          >
            <Suspense fallback={null}>
              <color attach="background" args={[settings.backgroundColor]} />
              <DeterministicCameraOrbit
                position={camera.position}
                target={camera.target}
                rotateSpeed={settings.rotateSpeed}
                enabled={settings.autoRotate}
              />
              {settings.viewMode === "burst-3d" ? (
                <BigDataBurstScene nodes={nodes} edges={edges} settings={settings} />
              ) : (
                <OntologyScene nodes={nodes} edges={edges} settings={settings} />
              )}
              <Ready onReady={resolve} />
            </Suspense>
          </Canvas>,
        );
      }),
      signal,
    );
    clearTimeout(timeout);
    await abortable(
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
      signal,
    );
    signal.throwIfAborted();
    state.setSize(width, height);
    state.setDpr(1);
    state.gl.setSize(width, height, false);
    await abortable(
      new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
      signal,
    );
    signal.throwIfAborted();
    const canvas = state.gl.domElement;
    if (canvas.width !== width || canvas.height !== height)
      throw new Error(
        `The device created ${canvas.width} × ${canvas.height} instead of ${width} × ${height}. Please try again.`,
      );
    state.advance(0);
    state.advance(0);
    await abortable(state.gl.compileAsync(state.scene, state.camera), signal);
    source = new CanvasSource(canvas, { codec, quality });
    output.addVideoTrack(source, { frameRate: options.fps });
    await output.start();
    const frames = Math.round(options.duration * options.fps);
    for (let frame = 0; frame < frames; frame++) {
      signal.throwIfAborted();
      state.advance(frame / options.fps);
      await source.add(frame / options.fps, 1 / options.fps);
      onProgress(((frame + 1) / frames) * 0.95);
      if (frame % 4 === 0) await new Promise((resolve) => setTimeout(resolve, 0));
    }
    source.close();
    await output.finalize();
    signal.throwIfAborted();
    if (!output.target.buffer) throw new Error("The video encoder returned an empty file.");
    onProgress(1);
    return new Blob([output.target.buffer], {
      type: format === "mp4" ? "video/mp4" : "video/webm",
    });
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
