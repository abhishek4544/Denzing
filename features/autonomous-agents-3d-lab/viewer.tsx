"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls, OrthographicCamera, PerspectiveCamera } from "@react-three/drei";
import * as THREE from "three";
import { defaultLabSettings, type AutonomousAgentsLabSettings } from "./defaults";
import { AutonomousAgentsLabScene } from "./scene";

function Runtime({ settings, active }: { settings: AutonomousAgentsLabSettings; active: boolean }) {
  const get = useThree((state) => state.get);
  useEffect(() => {
    const { camera, gl } = get();
    if (camera instanceof THREE.PerspectiveCamera) {
      camera.fov = settings.fov;
      camera.updateProjectionMatrix();
    }
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = 1.05;
  }, [get, settings.fov]);
  useEffect(() => {
    const { clock, setFrameloop } = get();
    const elapsed = clock.elapsedTime;
    setFrameloop(active ? "always" : "never");
    clock.elapsedTime = elapsed;
  }, [get, active]);
  return null;
}

export type AutonomousAgentsLabViewerProps = {
  settings?: AutonomousAgentsLabSettings;
  paused?: boolean;
  initialCamera?: {
    position: [number, number, number];
    target: [number, number, number];
    zoom?: number;
    viewport?: { width: number; height: number };
  };
  /** Cap resolution for the host device. Defaults to 1.5. */
  maxDpr?: number;
  /** Only enable when a host needs synchronous canvas screenshots. */
  preserveDrawingBuffer?: boolean;
  /** Enable orbit gestures. Off by default so the embed does not capture page scrolling. */
  interactive?: boolean;
};

/** Renderer only: no editor, inspector, toolbar, preset IO, or Next.js imports. */
export default function AutonomousAgentsLabViewer({
  settings = defaultLabSettings,
  initialCamera,
  paused = false,
  maxDpr = 1.5,
  preserveDrawingBuffer = false,
  interactive = false,
}: AutonomousAgentsLabViewerProps) {
  const host = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(true);
  const [pageVisible, setPageVisible] = useState(true);
  useEffect(() => {
    const update = () => setPageVisible(!document.hidden);
    update();
    document.addEventListener("visibilitychange", update);
    const observer = new IntersectionObserver(
      ([entry]) => setInView(entry.isIntersecting),
      { rootMargin: "200px 0px" },
    );
    if (host.current) observer.observe(host.current);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", update);
    };
  }, []);

  const position = useMemo<[number, number, number]>(() => {
    if (initialCamera?.position) return initialCamera.position;
    const d = settings.cameraDistance;
    if (settings.cameraMode === "isometric") return [d * 0.82, d * 0.82, d * 0.82];
    const pitchRad = (settings.cameraPitch * Math.PI) / 180;
    return [0, d * Math.sin(pitchRad), d * Math.cos(pitchRad)];
  }, [initialCamera?.position, settings.cameraMode, settings.cameraDistance, settings.cameraPitch]);
  const target = useMemo<[number, number, number]>(
    () =>
      initialCamera?.target ?? [
        settings.cameraTargetX * 0.01,
        settings.cameraTargetY * 0.01,
        settings.cameraTargetZ * 0.01,
      ],
    [initialCamera?.target, settings.cameraTargetX, settings.cameraTargetY, settings.cameraTargetZ],
  );

  return (
    <div
      ref={host}
      style={{
        width: "100%",
        height: "100%",
        pointerEvents: interactive ? "auto" : "none",
      }}
    >
      <Canvas
        dpr={[1, Math.max(1, maxDpr)]}
        gl={{
          antialias: true,
          powerPreference: "high-performance",
          preserveDrawingBuffer,
          alpha: false,
          stencil: false,
        }}
      >
        <color attach="background" args={[settings.backgroundColor]} />
        {settings.cameraMode === "isometric" ? (
          <OrthographicCamera
            makeDefault
            position={position}
            zoom={initialCamera?.zoom ?? settings.isoZoom}
            near={0.1}
            far={200}
            up={[0, 1, 0]}
          />
        ) : (
          <PerspectiveCamera
            makeDefault
            position={position}
            fov={settings.fov}
            near={0.1}
            far={200}
          />
        )}
        <Runtime settings={settings} active={inView && pageVisible && !paused} />
        <OrbitControls
          enableRotate={interactive}
          enableZoom={interactive}
          enablePan={interactive}
          enableDamping
          dampingFactor={0.08}
          minDistance={8}
          maxDistance={80}
          autoRotate={settings.autoRotate}
          autoRotateSpeed={settings.rotateSpeed / 20}
          makeDefault
          target={target}
        />
        <AutonomousAgentsLabScene settings={settings} />
      </Canvas>
    </div>
  );
}
