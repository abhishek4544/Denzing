"use client";

import { Suspense, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { Canvas, useFrame, useThree, type RootState } from "@react-three/fiber";
import { OrbitControls, OrthographicCamera, PerspectiveCamera } from "@react-three/drei";
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
import { SecurityGridScene } from "./scene";
import type { SecurityGridSettings } from "./defaults";
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

/** Restore the captured camera pose whenever a loop render returns to time 0.
 * OrbitControls advances once per rendered frame, so resetting the renderer
 * clock alone would otherwise leave the final auto-rotated camera offset. */
function LoopCameraReset({
  enabled,
  position,
  target,
}: {
  enabled: boolean;
  position: [number, number, number];
  target: [number, number, number];
}) {
  const camera = useThree((state) => state.camera);
  const get = useThree((state) => state.get);

  useFrame(({ clock }) => {
    if (!enabled || clock.elapsedTime !== 0) return;
    camera.position.set(...position);
    camera.lookAt(...target);
    const controls = get().controls as
      | { target?: THREE.Vector3 }
      | undefined;
    controls?.target?.set(...target);
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

export async function exportSecurityGridVideo(
  settings: SecurityGridSettings,
  camera: ExportCamera,
  options: VideoExportOptions,
  format: "webm" | "mp4",
  signal: AbortSignal,
  onProgress: (progress: number) => void,
) {
  const resolution = videoResolutions.find(
    (item) => item.value === options.resolution,
  );
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
  if (typeof VideoEncoder === "undefined") {
    throw new Error(
      "Video export needs a browser with WebCodecs video encoding. Try the latest Chrome or Edge.",
    );
  }
  const { width, height } = videoDimensions(resolution, camera.viewport);
  const viewportScale = camera.viewport && camera.viewport.height > 0
    ? height / camera.viewport.height
    : 1;
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
  if (!codec) {
    throw new Error(
      `This browser cannot encode ${width} × ${height} ${format.toUpperCase()} at ${options.fps} FPS. Try a lower resolution or another browser.`,
    );
  }
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
              new Error(
                "The export scene could not finish loading. Please try again.",
              ),
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
            onCreated={({ gl }) => {
              gl.toneMapping = THREE.ACESFilmicToneMapping;
              gl.toneMappingExposure = 1.05;
            }}
          >
            <Suspense fallback={null}>
              <color attach="background" args={[settings.backgroundColor]} />
              {settings.cameraMode === "isometric" ? (
                <OrthographicCamera
                  makeDefault
                  position={camera.position}
                  // Orthographic frustums use output pixels, so zoom must
                  // grow with resolution to retain the live scene framing.
                  zoom={(camera.zoom ?? settings.isoZoom) * viewportScale}
                  near={0.1}
                  far={200}
                  up={[0, 1, 0]}
                />
              ) : (
                <PerspectiveCamera
                  makeDefault
                  position={camera.position}
                  fov={settings.fov}
                  zoom={camera.zoom ?? 1}
                  near={0.1}
                  far={200}
                />
              )}
              <OrbitControls
                target={camera.target}
                enableDamping={false}
                enableRotate={false}
                enablePan={false}
                enableZoom={false}
                autoRotate={settings.autoRotate}
                autoRotateSpeed={(settings.rotateSpeed / 20) * 60 / options.fps}
              />
              <LoopCameraReset
                enabled={options.loop}
                position={camera.position}
                target={camera.target}
              />
              <SecurityGridScene
                settings={settings}
                labelReferenceHeight={camera.viewport?.height}
              />
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
    if (canvas.width !== width || canvas.height !== height) {
      throw new Error(
        `The device created ${canvas.width} × ${canvas.height} instead of ${width} × ${height}. Please try again.`,
      );
    }
    state.advance(0);
    state.advance(0);
    await abortable(state.gl.compileAsync(state.scene, state.camera), signal);
    source = new CanvasSource(canvas, { codec, quality });
    output.addVideoTrack(source, { frameRate: options.fps });
    await output.start();
    const frames = Math.round(options.duration * options.fps);
    for (let frame = 0; frame < frames; frame += 1) {
      signal.throwIfAborted();
      const timestamp = frame / options.fps;
      // Keep the clip duration unchanged while making its last rendered
      // image identical to the first one for a seamless repeat.
      state.advance(options.loop && frame === frames - 1 ? 0 : timestamp);
      await source.add(timestamp, 1 / options.fps);
      onProgress(((frame + 1) / frames) * 0.95);
      if (frame % 4 === 0)
        await new Promise((resolve) => setTimeout(resolve, 0));
    }
    source.close();
    await output.finalize();
    signal.throwIfAborted();
    if (!output.target.buffer)
      throw new Error("The video encoder returned an empty file.");
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
