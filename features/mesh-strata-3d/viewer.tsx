"use client";

import { useEffect, useRef, useState, type ComponentRef, type Ref } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { canvasAspectValue, defaultStrataSettings, type StrataSettings } from "./defaults";
import { MeshStrataScene } from "./scene";
import { RendererDiagnostics } from "./renderer-diagnostics";

function Runtime({ settings, active }: { settings: StrataSettings; active: boolean }) {
  const get = useThree((state) => state.get);
  useEffect(() => {
    const { camera, gl } = get();
    if (camera instanceof THREE.PerspectiveCamera) {
      camera.fov = settings.isoView ? Math.min(settings.fov, 22) : settings.fov;
      camera.updateProjectionMatrix();
    }
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = 1.15;
  }, [get, settings.fov, settings.isoView]);
  useEffect(() => {
    const { clock, setFrameloop } = get();
    const elapsed = clock.elapsedTime;
    setFrameloop(active ? "always" : "never");
    // Fiber restarts the clock when changing modes. Keep animation continuous.
    clock.elapsedTime = elapsed;
  }, [get, active]);
  return null;
}

export type MeshStrataViewerProps = {
  settings?: StrataSettings;
  paused?: boolean;
  initialCamera?: { position: [number, number, number]; target: [number, number, number]; viewport?: { width: number; height: number } };
  /** Cap resolution for the host device. Editor uses 2; embeds default to 1.5. */
  maxDpr?: number;
  /** Only enable when a host needs synchronous canvas screenshots. */
  preserveDrawingBuffer?: boolean;
  /** Enable orbit gestures. Off by default so the embed does not capture page scrolling. */
  interactive?: boolean;
  controlsRef?: Ref<ComponentRef<typeof OrbitControls>>;
};

/** Renderer only: no editor, inspector, toolbar, preset IO, or Next.js imports. */
export default function MeshStrataViewer({ settings = defaultStrataSettings,
  initialCamera, paused = false, maxDpr = 1.5, preserveDrawingBuffer = false, interactive = false, controlsRef }: MeshStrataViewerProps) {
  const host = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(true);
  const [pageVisible, setPageVisible] = useState(true);
  useEffect(() => {
    const update = () => setPageVisible(!document.hidden);
    update();
    document.addEventListener("visibilitychange", update);
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting));
    if (host.current) observer.observe(host.current);
    return () => { observer.disconnect(); document.removeEventListener("visibilitychange", update); };
  }, []);
  const distance = 45;
  const aspect = canvasAspectValue(settings.canvasAspect, settings.canvasAspectWidth, settings.canvasAspectHeight);
  const position: [number, number, number] = initialCamera?.position ?? (settings.isoView
    ? [distance * 0.72, distance * 0.62, distance * 0.72]
    : [distance * 0.02, distance * 0.09, distance]);
  return <div ref={host} style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", containerType: "size", pointerEvents: interactive ? "auto" : "none" }}>
    <div style={{ width: aspect ? `min(100cqw, ${aspect * 100}cqh)` : "100%", height: aspect ? `min(100cqh, ${100 / aspect}cqw)` : "100%", overflow: "hidden", borderRadius: 8 }}>
    <Canvas dpr={[1, Math.max(1, maxDpr)]}
      gl={{ antialias: true, powerPreference: "high-performance",
        preserveDrawingBuffer, alpha: false, stencil: false }}
      camera={{ position, fov: settings.fov, near: 0.1, far: 200 }}>
      <color attach="background" args={[settings.backgroundColor]} />
      <Runtime settings={settings} active={inView && pageVisible && !paused} />
      {process.env.NODE_ENV === "development" && <RendererDiagnostics />}
      <OrbitControls ref={controlsRef} enableRotate={interactive} enableZoom={interactive} enablePan={interactive} enableDamping dampingFactor={0.08}
        minDistance={10} maxDistance={60} autoRotate={settings.autoRotate}
        autoRotateSpeed={settings.rotateSpeed / 20} makeDefault target={initialCamera?.target ?? [0, 0, 0]} />
      <MeshStrataScene settings={settings} labelReferenceHeight={initialCamera?.viewport?.height} />
    </Canvas>
    </div>
  </div>;
}
