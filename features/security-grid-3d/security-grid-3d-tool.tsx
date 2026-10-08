"use client";

import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls, OrthographicCamera, PerspectiveCamera } from "@react-three/drei";
import * as THREE from "three";
import {
  CanvasArea,
  ColorField,
  ControlsPanel,
  Section,
  SectionButton,
  SelectField,
  SliderField,
  TextField,
  ToggleField,
  ToolShell,
} from "@/components/tool-shell";
import { downloadPreset, pickPresetFile } from "@/features/preset-io";
import { tools } from "@/features/tool-registry";
import {
  defaultSecurityGridSettings,
  MAX_SLABS,
  type SecurityGridSettings,
} from "./defaults";
import { exportSecurityGridScene } from "./export-image";
import type { ExportCamera } from "./export-options";
import { SecurityGridScene } from "./scene";

const ExportDialog = lazy(() => import("./export-dialog"));

function CameraSync({ fov }: { fov: number }) {
  const get = useThree((s) => s.get);
  useEffect(() => {
    const cam = get().camera;
    if (cam instanceof THREE.PerspectiveCamera) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }
  }, [get, fov]);
  return null;
}

function IsoCamera({ zoom, distance }: { zoom: number; distance: number }) {
  // True-ish isometric: 45° yaw, ~35° pitch. Position on the (1,1,1)-ish axis.
  const d = distance;
  const pos: [number, number, number] = [d * 0.82, d * 0.82, d * 0.82];
  return (
    <OrthographicCamera
      makeDefault
      position={pos}
      zoom={zoom}
      near={0.1}
      far={200}
      up={[0, 1, 0]}
    />
  );
}

function PerspCamera({
  position,
  fov,
}: {
  position: [number, number, number];
  fov: number;
}) {
  return (
    <PerspectiveCamera
      makeDefault
      position={position}
      fov={fov}
      near={0.1}
      far={200}
    />
  );
}

function ExposureSync() {
  const get = useThree((s) => s.get);
  useEffect(() => {
    const g = get().gl;
    g.toneMapping = THREE.ACESFilmicToneMapping;
    g.toneMappingExposure = 1.05;
  }, [get]);
  return null;
}

function toRad(d: number) {
  return (d * Math.PI) / 180;
}

export function SecurityGrid3DTool() {
  const [settings, setSettings] = useState<SecurityGridSettings>(
    defaultSecurityGridSettings,
  );
  const canvasHostRef = useRef<HTMLDivElement>(null);
  const orbitRef = useRef<unknown>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportCamera, setExportCamera] = useState<ExportCamera>({
    position: [20, 10, 20],
    target: [0, 0, 0],
  });

  const update = useCallback(
    <K extends keyof SecurityGridSettings>(
      key: K,
      value: SecurityGridSettings[K],
    ) => {
      setSettings((current) => ({ ...current, [key]: value }));
    },
    [],
  );

  const onReset = useCallback(
    () => setSettings(defaultSecurityGridSettings),
    [],
  );

  const onPngExport = useCallback(() => {
    const host = canvasHostRef.current;
    if (!host) return;
    const gl = host.querySelector("canvas");
    if (gl instanceof HTMLCanvasElement) exportSecurityGridScene(gl);
  }, []);

  const onExport = useCallback(() => {
    // Snapshot the live orbit/camera state so the exporter renders the
    // same framing the user is looking at.
    const host = canvasHostRef.current;
    const rect = host?.querySelector("canvas")?.getBoundingClientRect();
    const controls = orbitRef.current as
      | {
          object: { position: THREE.Vector3; zoom: number };
          target: THREE.Vector3;
        }
      | null;
    if (controls) {
      setExportCamera({
        position: controls.object.position.toArray() as [
          number,
          number,
          number,
        ],
        target: controls.target.toArray() as [number, number, number],
        zoom: controls.object.zoom,
        viewport: rect ? { width: rect.width, height: rect.height } : undefined,
      });
    } else if (rect) {
      setExportCamera((cam) => ({ ...cam, viewport: { width: rect.width, height: rect.height } }));
    }
    setExportOpen(true);
  }, []);

  const onSavePreset = useCallback(() => {
    downloadPreset<SecurityGridSettings>("security-grid-3d", settings);
  }, [settings]);

  const onLoadPreset = useCallback(() => {
    pickPresetFile<SecurityGridSettings>(
      "security-grid-3d",
      (loaded) =>
        setSettings({ ...defaultSecurityGridSettings, ...loaded }),
      (msg) => {
        if (typeof window !== "undefined")
          window.alert(`Preset load failed: ${msg}`);
      },
    );
  }, []);

  const d = settings.cameraDistance;
  const pitchRad = toRad(settings.cameraPitch);
  const camPos: [number, number, number] = [
    0,
    d * Math.sin(pitchRad),
    d * Math.cos(pitchRad),
  ];

  return (
    <ToolShell
      toolLabel="Security Grid 3D"
      tools={tools}
      activeToolId="security-grid-3d"
      onExport={onExport}
    >
      <CanvasArea>
        <div
          ref={canvasHostRef}
          className="relative h-full w-full rounded-lg overflow-hidden"
          style={{
            background: settings.backgroundColor,
            boxShadow:
              "inset 0 0 0 1px rgba(255,255,255,0.05), 0 22px 60px -30px rgba(0,0,0,0.65)",
          }}
        >
          <Canvas
            dpr={[1, 2]}
            gl={{
              antialias: true,
              powerPreference: "high-performance",
              preserveDrawingBuffer: true,
              alpha: false,
              stencil: false,
            }}
          >
            <color attach="background" args={[settings.backgroundColor]} />
            <ExposureSync />
            {settings.cameraMode === "isometric" ? (
              <IsoCamera
                zoom={settings.isoZoom}
                distance={settings.cameraDistance}
              />
            ) : (
              <>
                <PerspCamera position={camPos} fov={settings.fov} />
                <CameraSync fov={settings.fov} />
              </>
            )}
            <OrbitControls
              ref={(c) => {
                orbitRef.current = c;
              }}
              enableDamping
              dampingFactor={0.08}
              minDistance={8}
              maxDistance={80}
              autoRotate={settings.autoRotate}
              autoRotateSpeed={settings.rotateSpeed / 20}
              makeDefault
              target={[
                settings.cameraTargetX * 0.01,
                settings.cameraTargetY * 0.01,
                settings.cameraTargetZ * 0.01,
              ]}
            />
            <SecurityGridScene settings={settings} />
          </Canvas>
        </div>
      </CanvasArea>

      <ControlsPanel title="SECURITY GRID" onReset={onReset}>
        <Section title="Preset">
          <SectionButton onClick={onSavePreset}>Save Preset…</SectionButton>
          <SectionButton onClick={onLoadPreset}>Load Preset…</SectionButton>
        </Section>

        <Section title="Camera">
          <SelectField
            label="Mode"
            value={settings.cameraMode}
            onChange={(v) =>
              update("cameraMode", v as "perspective" | "isometric")
            }
            options={[
              { value: "perspective", label: "Perspective" },
              { value: "isometric", label: "Isometric (Ortho)" },
            ]}
          />
          <SliderField
            label="Iso Zoom"
            value={settings.isoZoom}
            min={20}
            max={240}
            step={1}
            onChange={(v) => update("isoZoom", v)}
          />
          <SliderField
            label="Pitch (deg)"
            value={settings.cameraPitch}
            min={10}
            max={85}
            step={1}
            onChange={(v) => update("cameraPitch", v)}
          />
          <SliderField
            label="Distance"
            value={settings.cameraDistance}
            min={10}
            max={60}
            step={0.5}
            onChange={(v) => update("cameraDistance", v)}
          />
          <SliderField
            label="FOV"
            value={settings.fov}
            min={14}
            max={60}
            step={1}
            onChange={(v) => update("fov", v)}
          />
          <ToggleField
            size="compact"
            label="Auto Rotate"
            checked={settings.autoRotate}
            onCheckedChange={(v) => update("autoRotate", v)}
          />
          <SliderField
            label="Rotate Speed"
            value={settings.rotateSpeed}
            min={0}
            max={60}
            onChange={(v) => update("rotateSpeed", v)}
          />
          <SliderField
            label="Target X (←→)"
            value={settings.cameraTargetX}
            min={-500}
            max={500}
            onChange={(v) => update("cameraTargetX", v)}
          />
          <SliderField
            label="Target Y (↑↓)"
            value={settings.cameraTargetY}
            min={-500}
            max={500}
            onChange={(v) => update("cameraTargetY", v)}
          />
          <SliderField
            label="Target Z (depth)"
            value={settings.cameraTargetZ}
            min={-500}
            max={500}
            onChange={(v) => update("cameraTargetZ", v)}
          />
        </Section>

        <Section title="Base Plane">
          <SliderField
            label="Size"
            value={settings.floorSize}
            min={10}
            max={32}
            step={0.5}
            onChange={(v) => update("floorSize", v)}
          />
          <SliderField
            label="Cells"
            value={settings.floorCells}
            min={14}
            max={40}
            step={1}
            onChange={(v) => update("floorCells", v)}
          />
          <SliderField
            label="Edge Fade Radius"
            value={settings.floorEdgeFade}
            min={0}
            max={100}
            onChange={(v) => update("floorEdgeFade", v)}
          />
          <SliderField
            label="Edge Fade Intensity"
            value={settings.floorEdgeIntensity}
            min={0}
            max={300}
            onChange={(v) => update("floorEdgeIntensity", v)}
          />
          <ColorField
            label="Base Plane"
            color={settings.basePlaneColor}
            opacity={settings.basePlaneOpacity}
            onColorChange={(v) => update("basePlaneColor", v)}
            onOpacityChange={(v) => update("basePlaneOpacity", v)}
            showPipette={false}
          />
          <ColorField
            label="Grid"
            color={settings.gridColor}
            opacity={100}
            onColorChange={(v) => update("gridColor", v)}
            onOpacityChange={() => {}}
            showPipette={false}
          />
          <SliderField
            label="Opacity Near"
            value={settings.gridOpacityNear}
            min={0}
            max={100}
            onChange={(v) => update("gridOpacityNear", v)}
          />
          <SliderField
            label="Opacity Far"
            value={settings.gridOpacityFar}
            min={0}
            max={100}
            onChange={(v) => update("gridOpacityFar", v)}
          />
        </Section>

        <Section title="Zero Nodes">
          <ColorField
            label="Color"
            color={settings.zeroColor}
            opacity={settings.zeroOpacity}
            onColorChange={(v) => update("zeroColor", v)}
            onOpacityChange={(v) => update("zeroOpacity", v)}
            showPipette={false}
          />
          <SliderField
            label="Ring Size"
            value={settings.zeroRingSize}
            min={10}
            max={90}
            onChange={(v) => update("zeroRingSize", v)}
          />
          <SliderField
            label="Ring Thickness"
            value={settings.zeroRingThickness}
            min={5}
            max={60}
            onChange={(v) => update("zeroRingThickness", v)}
          />
        </Section>

        <Section title="Active Tiles">
          <SliderField
            label="Count"
            value={settings.activeCount}
            min={0}
            max={40}
            step={1}
            onChange={(v) => update("activeCount", v)}
          />
          <SliderField
            label="Radius"
            value={settings.activeRadius}
            min={5}
            max={100}
            onChange={(v) => update("activeRadius", v)}
          />
          <SliderField
            label="Center Bias"
            value={settings.activeCenterBias}
            min={0}
            max={100}
            onChange={(v) => update("activeCenterBias", v)}
          />
          <SliderField
            label="Seed"
            value={settings.activeSeed}
            min={1}
            max={999}
            step={1}
            onChange={(v) => update("activeSeed", v)}
          />
          <SliderField
            label="Tile Scale"
            value={settings.activeTileScale}
            min={40}
            max={100}
            onChange={(v) => update("activeTileScale", v)}
          />
          <ColorField
            label="Tile"
            color={settings.activeTileColor}
            opacity={100}
            onColorChange={(v) => update("activeTileColor", v)}
            onOpacityChange={() => {}}
            showPipette={false}
          />
          <SliderField
            label="Emission"
            value={settings.activeTileEmission}
            min={0}
            max={200}
            onChange={(v) => update("activeTileEmission", v)}
          />
          <ColorField
            label="Symbol"
            color={settings.activeSymbolColor}
            opacity={100}
            onColorChange={(v) => update("activeSymbolColor", v)}
            onOpacityChange={() => {}}
            showPipette={false}
          />
          <ToggleField
            size="compact"
            label="Animation"
            checked={settings.activeAnimEnabled}
            onCheckedChange={(v) => update("activeAnimEnabled", v)}
          />
          <SelectField
            label="Anim Mode"
            value={settings.activeAnimMode}
            onChange={(v) =>
              update(
                "activeAnimMode",
                v as "pulse" | "wave" | "flicker",
              )
            }
            options={[
              { value: "pulse", label: "Pulse (sine)" },
              { value: "wave", label: "Wave (ripple)" },
              { value: "flicker", label: "Flicker" },
            ]}
          />
          <SliderField
            label="Anim Speed"
            value={settings.activeAnimSpeed}
            min={0}
            max={200}
            onChange={(v) => update("activeAnimSpeed", v)}
          />
          <SliderField
            label="Anim Intensity"
            value={settings.activeAnimIntensity}
            min={0}
            max={200}
            onChange={(v) => update("activeAnimIntensity", v)}
          />
          <SliderField
            label="Anim Dynamic"
            value={settings.activeAnimDynamic}
            min={0}
            max={100}
            onChange={(v) => update("activeAnimDynamic", v)}
          />
        </Section>

        <Section title="Vertical Stems">
          <ToggleField
            size="compact"
            label="Enabled"
            checked={settings.stemsEnabled}
            onCheckedChange={(v) => update("stemsEnabled", v)}
          />
          <SliderField
            label="% of Actives"
            value={settings.stemPercentage}
            min={0}
            max={100}
            onChange={(v) => update("stemPercentage", v)}
          />
          <ColorField
            label="Color"
            color={settings.stemColor}
            opacity={settings.stemOpacity}
            onColorChange={(v) => update("stemColor", v)}
            onOpacityChange={(v) => update("stemOpacity", v)}
            showPipette={false}
          />
          <ToggleField
            size="compact"
            label="Link to Cube"
            checked={settings.stemLinkToCube}
            onCheckedChange={(v) => update("stemLinkToCube", v)}
          />
          <SliderField
            label="Link Jitter"
            value={settings.stemLinkJitter}
            min={0}
            max={100}
            onChange={(v) => update("stemLinkJitter", v)}
          />
          <SliderField
            label="Enter Cube"
            value={settings.stemEnterCube}
            min={0}
            max={100}
            onChange={(v) => update("stemEnterCube", v)}
          />
          <SliderField
            label="Height Min (free)"
            value={settings.stemHeightMin}
            min={0}
            max={200}
            onChange={(v) => update("stemHeightMin", v)}
          />
          <SliderField
            label="Height Max (free)"
            value={settings.stemHeightMax}
            min={0}
            max={200}
            onChange={(v) => update("stemHeightMax", v)}
          />
          <ToggleField
            size="compact"
            label="Sampling Nodes"
            checked={settings.stemNodesEnabled}
            onCheckedChange={(v) => update("stemNodesEnabled", v)}
          />
          <SliderField
            label="Max Nodes / Stem"
            value={settings.stemNodeMaxPerStem}
            min={0}
            max={6}
            step={1}
            onChange={(v) => update("stemNodeMaxPerStem", v)}
          />
          <ColorField
            label="Node Color"
            color={settings.stemNodeColor}
            opacity={100}
            onColorChange={(v) => update("stemNodeColor", v)}
            onOpacityChange={() => {}}
            showPipette={false}
          />
          <SliderField
            label="Node Size"
            value={settings.stemNodeSize}
            min={5}
            max={120}
            onChange={(v) => update("stemNodeSize", v)}
          />
        </Section>

        <Section title="Projection Rays">
          <ToggleField
            size="compact"
            label="Enabled"
            checked={settings.raysEnabled}
            onCheckedChange={(v) => update("raysEnabled", v)}
          />
          <SliderField
            label="Count"
            value={settings.rayCount}
            min={0}
            max={300}
            step={1}
            onChange={(v) => update("rayCount", v)}
          />
          <ColorField
            label="Color"
            color={settings.rayColor}
            opacity={100}
            onColorChange={(v) => update("rayColor", v)}
            onOpacityChange={() => {}}
            showPipette={false}
          />
          <ToggleField
            size="compact"
            label="Link to Cube"
            checked={settings.rayLinkToCube}
            onCheckedChange={(v) => update("rayLinkToCube", v)}
          />
          <SliderField
            label="Link Jitter"
            value={settings.rayLinkJitter}
            min={0}
            max={100}
            onChange={(v) => update("rayLinkJitter", v)}
          />
          <ToggleField
            size="compact"
            label="From Matrix Only"
            checked={settings.rayFromMatrixOnly}
            onCheckedChange={(v) => update("rayFromMatrixOnly", v)}
          />
          <SliderField
            label="Opacity Min"
            value={settings.rayOpacityMin}
            min={0}
            max={60}
            onChange={(v) => update("rayOpacityMin", v)}
          />
          <SliderField
            label="Opacity Max"
            value={settings.rayOpacityMax}
            min={0}
            max={100}
            onChange={(v) => update("rayOpacityMax", v)}
          />
          <SliderField
            label="Height Min (free)"
            value={settings.rayHeightMin}
            min={0}
            max={200}
            onChange={(v) => update("rayHeightMin", v)}
          />
          <SliderField
            label="Height Max (free)"
            value={settings.rayHeightMax}
            min={0}
            max={200}
            onChange={(v) => update("rayHeightMax", v)}
          />
          <SliderField
            label="Angle Jitter (free)"
            value={settings.rayAngleJitter}
            min={0}
            max={100}
            onChange={(v) => update("rayAngleJitter", v)}
          />
        </Section>

        <Section title="Cube (Top Layer)">
          <ToggleField
            size="compact"
            label="Enabled"
            checked={settings.cubeEnabled}
            onCheckedChange={(v) => update("cubeEnabled", v)}
          />
          <SliderField
            label="Size"
            value={settings.cubeSize}
            min={2}
            max={14}
            step={0.1}
            onChange={(v) => update("cubeSize", v)}
          />
          <SliderField
            label="Subdivisions"
            value={settings.cubeSubdivisions}
            min={1}
            max={8}
            step={1}
            onChange={(v) => update("cubeSubdivisions", v)}
          />
          <SliderField
            label="Height Above"
            value={settings.cubeHeightAbove}
            min={0}
            max={200}
            onChange={(v) => update("cubeHeightAbove", v)}
          />
          <SliderField
            label="Offset X"
            value={settings.cubeOffsetX}
            min={-200}
            max={200}
            onChange={(v) => update("cubeOffsetX", v)}
          />
          <SliderField
            label="Offset Z"
            value={settings.cubeOffsetZ}
            min={-200}
            max={200}
            onChange={(v) => update("cubeOffsetZ", v)}
          />
          <ColorField
            label="Outer"
            color={settings.cubeOuterColor}
            opacity={settings.cubeOuterOpacity}
            onColorChange={(v) => update("cubeOuterColor", v)}
            onOpacityChange={(v) => update("cubeOuterOpacity", v)}
            showPipette={false}
          />
          <ColorField
            label="Inner Grid"
            color={settings.cubeInnerColor}
            opacity={settings.cubeInnerOpacity}
            onColorChange={(v) => update("cubeInnerColor", v)}
            onOpacityChange={(v) => update("cubeInnerOpacity", v)}
            showPipette={false}
          />
          <ColorField
            label="Nodes"
            color={settings.cubeNodeColor}
            opacity={100}
            onColorChange={(v) => update("cubeNodeColor", v)}
            onOpacityChange={() => {}}
            showPipette={false}
          />
          <SliderField
            label="Node Size"
            value={settings.cubeNodeSize}
            min={10}
            max={200}
            onChange={(v) => update("cubeNodeSize", v)}
          />
          <SliderField
            label="Node Intensity"
            value={settings.cubeNodeIntensity}
            min={0}
            max={200}
            onChange={(v) => update("cubeNodeIntensity", v)}
          />
        </Section>

        <Section title="Slab Cube (Hyper-real)">
          <ToggleField
            size="compact"
            label="Enabled"
            checked={settings.cubeSlabsEnabled}
            onCheckedChange={(v) => update("cubeSlabsEnabled", v)}
          />
          <ToggleField
            size="compact"
            label="Hide Wireframe"
            checked={settings.cubeHideWireframeWhenSlabs}
            onCheckedChange={(v) =>
              update("cubeHideWireframeWhenSlabs", v)
            }
          />
          <SliderField
            label="Metalness"
            value={settings.cubeSlabMetalness}
            min={0}
            max={100}
            onChange={(v) => update("cubeSlabMetalness", v)}
          />
          <SliderField
            label="Roughness"
            value={settings.cubeSlabRoughness}
            min={0}
            max={100}
            onChange={(v) => update("cubeSlabRoughness", v)}
          />
          <SliderField
            label="Slab Height %"
            value={settings.cubeSlabHeightPct}
            min={10}
            max={100}
            onChange={(v) => update("cubeSlabHeightPct", v)}
          />
          <SliderField
            label="Slab Gap %"
            value={settings.cubeSlabGapPct}
            min={0}
            max={60}
            onChange={(v) => update("cubeSlabGapPct", v)}
          />
          <ColorField
            label="Base Color (fallback)"
            color={settings.cubeSlabColor}
            opacity={100}
            onColorChange={(v) => update("cubeSlabColor", v)}
            onOpacityChange={() => {}}
            showPipette={false}
          />
          <SliderField
            label="Texture Blend"
            value={settings.cubeSlabTextureBlend}
            min={0}
            max={100}
            onChange={(v) => update("cubeSlabTextureBlend", v)}
          />
          <ToggleField
            size="compact"
            label="Glass Mode"
            checked={settings.cubeSlabGlassEnabled}
            onCheckedChange={(v) => update("cubeSlabGlassEnabled", v)}
          />
          <SliderField
            label="Transmission"
            value={settings.cubeSlabTransmission}
            min={0}
            max={100}
            onChange={(v) => update("cubeSlabTransmission", v)}
          />
          <SliderField
            label="Thickness"
            value={settings.cubeSlabThickness}
            min={0}
            max={100}
            onChange={(v) => update("cubeSlabThickness", v)}
          />
          <SliderField
            label="Clearcoat (Gloss)"
            value={settings.cubeSlabClearcoat}
            min={0}
            max={100}
            onChange={(v) => update("cubeSlabClearcoat", v)}
          />
          <SliderField
            label="Clearcoat Polish"
            value={settings.cubeSlabClearcoatRough}
            min={0}
            max={100}
            onChange={(v) =>
              update("cubeSlabClearcoatRough", v)
            }
          />
          <SliderField
            label="IOR (×100)"
            value={settings.cubeSlabIOR}
            min={100}
            max={250}
            step={1}
            onChange={(v) => update("cubeSlabIOR", v)}
          />
          <SliderField
            label="Glass Tint"
            value={settings.cubeSlabGlassTint}
            min={0}
            max={100}
            onChange={(v) => update("cubeSlabGlassTint", v)}
          />
          {Array.from({
            length: Math.min(settings.cubeSubdivisions, MAX_SLABS),
          }).map((_, i) => (
            <div key={`slab-ctrl-${i}`}>
              <ColorField
                label={`Slab ${i + 1} Color`}
                color={settings.cubeSlabColors[i] ?? settings.cubeSlabColor}
                opacity={100}
                onColorChange={(v) => {
                  const next = settings.cubeSlabColors.slice();
                  next[i] = v;
                  update("cubeSlabColors", next);
                }}
                onOpacityChange={() => {}}
                showPipette={false}
              />
              <SliderField
                label={`Slab ${i + 1} Height`}
                value={settings.cubeSlabHeights[i] ?? 100}
                min={10}
                max={200}
                onChange={(v) => {
                  const next = settings.cubeSlabHeights.slice();
                  next[i] = v;
                  update("cubeSlabHeights", next);
                }}
              />
              <SectionButton
                onClick={() => {
                  const input = document.createElement("input");
                  input.type = "file";
                  input.accept = "image/*";
                  input.onchange = () => {
                    const file = input.files?.[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = () => {
                      const next = settings.cubeSlabTextures.slice();
                      next[i] = String(reader.result ?? "");
                      update("cubeSlabTextures", next);
                    };
                    reader.readAsDataURL(file);
                  };
                  input.click();
                }}
              >
                {settings.cubeSlabTextures[i]
                  ? `Slab ${i + 1} Image: loaded (replace…)`
                  : `Slab ${i + 1} Image: upload…`}
              </SectionButton>
              {settings.cubeSlabTextures[i] ? (
                <SectionButton
                  onClick={() => {
                    const next = settings.cubeSlabTextures.slice();
                    next[i] = "";
                    update("cubeSlabTextures", next);
                  }}
                >
                  Slab {i + 1} Image: clear
                </SectionButton>
              ) : null}
            </div>
          ))}
          <ToggleField
            size="compact"
            label="Core Enabled"
            checked={settings.cubeCoreEnabled}
            onCheckedChange={(v) => update("cubeCoreEnabled", v)}
          />
          <ColorField
            label="Core Color"
            color={settings.cubeCoreColor}
            opacity={100}
            onColorChange={(v) => update("cubeCoreColor", v)}
            onOpacityChange={() => {}}
            showPipette={false}
          />
          <SliderField
            label="Core Emission"
            value={settings.cubeCoreEmission}
            min={0}
            max={500}
            onChange={(v) => update("cubeCoreEmission", v)}
          />
          <SliderField
            label="Core Size %"
            value={settings.cubeCoreSizePct}
            min={10}
            max={100}
            onChange={(v) => update("cubeCoreSizePct", v)}
          />
        </Section>

        <Section title="Slab Labels">
          <ToggleField
            size="compact"
            label="Enabled"
            checked={settings.cubeSlabLabelsEnabled}
            onCheckedChange={(v) =>
              update("cubeSlabLabelsEnabled", v)
            }
          />
          <SelectField
            label="Side"
            value={settings.cubeSlabLabelSide}
            onChange={(v) =>
              update(
                "cubeSlabLabelSide",
                v as "right" | "left" | "front" | "back",
              )
            }
            options={[
              { value: "right", label: "Right" },
              { value: "left", label: "Left" },
              { value: "front", label: "Front" },
              { value: "back", label: "Back" },
            ]}
          />
          <SliderField
            label="Offset"
            value={settings.cubeSlabLabelOffset}
            min={0}
            max={300}
            onChange={(v) => update("cubeSlabLabelOffset", v)}
          />
          <SliderField
            label="Font Size"
            value={settings.cubeSlabLabelFontSize}
            min={4}
            max={40}
            step={1}
            onChange={(v) => update("cubeSlabLabelFontSize", v)}
          />
          <SliderField
            label="Tile Padding"
            value={settings.cubeSlabLabelPadding}
            min={0}
            max={100}
            onChange={(v) => update("cubeSlabLabelPadding", v)}
          />
          <SliderField
            label="Group Offset X (←→)"
            value={settings.cubeSlabLabelOffsetX}
            min={-500}
            max={500}
            onChange={(v) => update("cubeSlabLabelOffsetX", v)}
          />
          <SliderField
            label="Group Offset Y (↑↓)"
            value={settings.cubeSlabLabelOffsetY}
            min={-500}
            max={500}
            onChange={(v) => update("cubeSlabLabelOffsetY", v)}
          />
          <SliderField
            label="Group Offset Z (depth)"
            value={settings.cubeSlabLabelOffsetZ}
            min={-500}
            max={500}
            onChange={(v) => update("cubeSlabLabelOffsetZ", v)}
          />
          <SliderField
            label="Group Scale"
            value={settings.cubeSlabLabelScale}
            min={10}
            max={300}
            onChange={(v) => update("cubeSlabLabelScale", v)}
          />
          <ColorField
            label="Text"
            color={settings.cubeSlabLabelTextColor}
            opacity={100}
            onColorChange={(v) =>
              update("cubeSlabLabelTextColor", v)
            }
            onOpacityChange={() => {}}
            showPipette={false}
          />
          <ColorField
            label="Tile Bg"
            color={settings.cubeSlabLabelBgColor}
            opacity={100}
            onColorChange={(v) => update("cubeSlabLabelBgColor", v)}
            onOpacityChange={() => {}}
            showPipette={false}
          />
          {Array.from({
            length: Math.min(settings.cubeSubdivisions, MAX_SLABS),
          }).map((_, i) => (
            <TextField
              key={`slab-label-${i}`}
              label={`Slab ${i + 1} Label`}
              value={settings.cubeSlabLabels[i] ?? ""}
              onChange={(v) => {
                const next = settings.cubeSlabLabels.slice();
                next[i] = v;
                update("cubeSlabLabels", next);
              }}
            />
          ))}
        </Section>

        <Section title="Lighting Rig">
          <SliderField
            label="Key Light"
            value={settings.lightKeyIntensity}
            min={0}
            max={400}
            onChange={(v) => update("lightKeyIntensity", v)}
          />
          <SliderField
            label="Fill Light"
            value={settings.lightFillIntensity}
            min={0}
            max={200}
            onChange={(v) => update("lightFillIntensity", v)}
          />
          <SliderField
            label="Hemisphere"
            value={settings.lightHemiIntensity}
            min={0}
            max={200}
            onChange={(v) => update("lightHemiIntensity", v)}
          />
        </Section>

        <Section title="Cube Motion">
          <ToggleField
            size="compact"
            label="Explode Enabled"
            checked={settings.cubeOpenEnabled}
            onCheckedChange={(v) => update("cubeOpenEnabled", v)}
          />
          <SliderField
            label="Open Amount"
            value={settings.cubeOpenAmount}
            min={0}
            max={300}
            onChange={(v) => update("cubeOpenAmount", v)}
          />
          <SliderField
            label="In-Between Spacing"
            value={settings.cubeInterSpacing}
            min={0}
            max={200}
            onChange={(v) => update("cubeInterSpacing", v)}
          />
          <SliderField
            label="Duration (s×10)"
            value={settings.cubeOpenDuration * 10}
            min={2}
            max={60}
            step={1}
            onChange={(v) => update("cubeOpenDuration", v / 10)}
          />
          <SliderField
            label="Stagger %"
            value={settings.cubeOpenStagger}
            min={0}
            max={100}
            onChange={(v) => update("cubeOpenStagger", v)}
          />
          <SelectField
            label="Easing"
            value={settings.cubeOpenEasing}
            onChange={(v) =>
              update(
                "cubeOpenEasing",
                v as
                  | "expoOut"
                  | "quartOut"
                  | "cubicOut"
                  | "sineOut"
                  | "springOut"
                  | "springBounce",
              )
            }
            options={[
              { value: "expoOut", label: "Expo Out (video match)" },
              { value: "quartOut", label: "Quart Out" },
              { value: "cubicOut", label: "Cubic Out" },
              { value: "sineOut", label: "Sine Out" },
              { value: "springOut", label: "Spring (subtle overshoot)" },
              { value: "springBounce", label: "Spring Bounce (elastic)" },
            ]}
          />
          <SelectField
            label="Mode"
            value={settings.cubeOpenMode}
            onChange={(v) =>
              update("cubeOpenMode", v as "once" | "loop")
            }
            options={[
              { value: "once", label: "Once (on load)" },
              { value: "loop", label: "Loop" },
            ]}
          />
          <SliderField
            label="Hold (s×10)"
            value={settings.cubeOpenHold * 10}
            min={0}
            max={100}
            step={1}
            onChange={(v) => update("cubeOpenHold", v / 10)}
          />
          <SectionButton
            onClick={() =>
              update("cubeOpenTrigger", settings.cubeOpenTrigger + 1)
            }
          >
            Replay
          </SectionButton>
          <ToggleField
            size="compact"
            label="Idle Float"
            checked={settings.cubeFloatEnabled}
            onCheckedChange={(v) => update("cubeFloatEnabled", v)}
          />
          <SliderField
            label="Float Amp"
            value={settings.cubeFloatAmp}
            min={0}
            max={40}
            onChange={(v) => update("cubeFloatAmp", v)}
          />
          <SliderField
            label="Float Period (s×10)"
            value={settings.cubeFloatPeriod * 10}
            min={5}
            max={100}
            step={1}
            onChange={(v) => update("cubeFloatPeriod", v / 10)}
          />
        </Section>

        <Section title="Wires (Cube → Floor)">
          <ToggleField
            size="compact"
            label="Enabled"
            checked={settings.wiresEnabled}
            onCheckedChange={(v) => update("wiresEnabled", v)}
          />
          <ColorField
            label="Color"
            color={settings.wireColor}
            opacity={settings.wireOpacity}
            onColorChange={(v) => update("wireColor", v)}
            onOpacityChange={(v) => update("wireOpacity", v)}
            showPipette={false}
          />
          <SliderField
            label="Count"
            value={settings.wireCount}
            min={10}
            max={600}
            step={1}
            onChange={(v) => update("wireCount", v)}
          />
          <SliderField
            label="Drift"
            value={settings.wireDrift}
            min={0}
            max={60}
            onChange={(v) => update("wireDrift", v)}
          />
          <SliderField
            label="Floor Spread Radius"
            value={settings.wireFloorRadius}
            min={0}
            max={200}
            onChange={(v) => update("wireFloorRadius", v)}
          />
          <SliderField
            label="Attach Spread Radius"
            value={settings.wireAttachRadius}
            min={0}
            max={200}
            onChange={(v) => update("wireAttachRadius", v)}
          />
          <SliderField
            label="Top Opacity Fade"
            value={settings.wireTopFade}
            min={0}
            max={60}
            onChange={(v) => update("wireTopFade", v)}
          />
          <SliderField
            label="Bottom Opacity Fade"
            value={settings.wireBottomFade}
            min={0}
            max={60}
            onChange={(v) => update("wireBottomFade", v)}
          />
          <SliderField
            label="Flow Speed"
            value={settings.wireFlowSpeed}
            min={0}
            max={200}
            onChange={(v) => update("wireFlowSpeed", v)}
          />
          <SliderField
            label="Flow Density"
            value={settings.wireFlowDensity}
            min={0}
            max={30}
            step={1}
            onChange={(v) => update("wireFlowDensity", v)}
          />
          <SliderField
            label="Flow Duty"
            value={settings.wireFlowDuty}
            min={0}
            max={100}
            onChange={(v) => update("wireFlowDuty", v)}
          />
          <SliderField
            label="Flow Randomness"
            value={settings.wireFlowRandomness}
            min={0}
            max={100}
            onChange={(v) => update("wireFlowRandomness", v)}
          />
          <SliderField
            label="Bend (Sag/Arch)"
            value={settings.wireBend}
            min={-100}
            max={100}
            onChange={(v) => update("wireBend", v)}
          />
          <SliderField
            label="Bend Radial (Bow Out/In)"
            value={settings.wireBendRadial}
            min={-100}
            max={100}
            onChange={(v) => update("wireBendRadial", v)}
          />
          <SliderField
            label="Bend Segments"
            value={settings.wireBendSegments}
            min={1}
            max={48}
            step={1}
            onChange={(v) => update("wireBendSegments", v)}
          />
          <SliderField
            label="Thickness"
            value={settings.wireThickness}
            min={0}
            max={100}
            onChange={(v) => update("wireThickness", v)}
          />
        </Section>

        <Section title="Top Wires (Cube → Up)">
          <ToggleField
            size="compact"
            label="Enabled"
            checked={settings.topWiresEnabled}
            onCheckedChange={(v) => update("topWiresEnabled", v)}
          />
          <ColorField
            label="Color"
            color={settings.topWireColor}
            opacity={settings.topWireOpacity}
            onColorChange={(v) => update("topWireColor", v)}
            onOpacityChange={(v) => update("topWireOpacity", v)}
            showPipette={false}
          />
          <SliderField
            label="Count"
            value={settings.topWireCount}
            min={10}
            max={600}
            step={1}
            onChange={(v) => update("topWireCount", v)}
          />
          <SliderField
            label="Height"
            value={settings.topWireHeight}
            min={0}
            max={300}
            onChange={(v) => update("topWireHeight", v)}
          />
          <SliderField
            label="Radius Expand (Drift)"
            value={settings.topWireDrift}
            min={0}
            max={200}
            onChange={(v) => update("topWireDrift", v)}
          />
          <SliderField
            label="Thickness"
            value={settings.topWireThickness}
            min={0}
            max={100}
            onChange={(v) => update("topWireThickness", v)}
          />
          <SliderField
            label="Attach Spread Radius"
            value={settings.topWireAttachRadius}
            min={0}
            max={200}
            onChange={(v) => update("topWireAttachRadius", v)}
          />
          <SliderField
            label="Base Opacity Fade"
            value={settings.topWireBottomFade}
            min={0}
            max={60}
            onChange={(v) => update("topWireBottomFade", v)}
          />
          <SliderField
            label="Tip Opacity Fade"
            value={settings.topWireTopFade}
            min={0}
            max={60}
            onChange={(v) => update("topWireTopFade", v)}
          />
          <SliderField
            label="Flow Speed"
            value={settings.topWireFlowSpeed}
            min={0}
            max={200}
            onChange={(v) => update("topWireFlowSpeed", v)}
          />
          <SliderField
            label="Flow Density"
            value={settings.topWireFlowDensity}
            min={0}
            max={30}
            step={1}
            onChange={(v) => update("topWireFlowDensity", v)}
          />
          <SliderField
            label="Flow Duty"
            value={settings.topWireFlowDuty}
            min={0}
            max={100}
            onChange={(v) => update("topWireFlowDuty", v)}
          />
          <SliderField
            label="Flow Randomness"
            value={settings.topWireFlowRandomness}
            min={0}
            max={100}
            onChange={(v) => update("topWireFlowRandomness", v)}
          />
          <SliderField
            label="Bend (Sag/Arch)"
            value={settings.topWireBend}
            min={-100}
            max={100}
            onChange={(v) => update("topWireBend", v)}
          />
          <SliderField
            label="Bend Radial (Bow Out/In)"
            value={settings.topWireBendRadial}
            min={-100}
            max={100}
            onChange={(v) => update("topWireBendRadial", v)}
          />
          <SliderField
            label="Bend Segments"
            value={settings.topWireBendSegments}
            min={1}
            max={48}
            step={1}
            onChange={(v) => update("topWireBendSegments", v)}
          />
        </Section>

        <Section title="Post">
          <SliderField
            label="Bloom Intensity"
            value={settings.bloomIntensity * 10}
            min={0}
            max={60}
            onChange={(v) => update("bloomIntensity", v / 10)}
          />
          <SliderField
            label="Bloom Threshold"
            value={settings.bloomThreshold}
            min={0}
            max={100}
            onChange={(v) => update("bloomThreshold", v)}
          />
          <SliderField
            label="Bloom Smoothing"
            value={settings.bloomSmoothing}
            min={0}
            max={100}
            onChange={(v) => update("bloomSmoothing", v)}
          />
          <SliderField
            label="Vignette"
            value={settings.vignette}
            min={0}
            max={100}
            onChange={(v) => update("vignette", v)}
          />
          <ColorField
            label="Background"
            color={settings.backgroundColor}
            opacity={100}
            onColorChange={(v) => update("backgroundColor", v)}
            onOpacityChange={() => {}}
            showPipette={false}
          />
        </Section>
      </ControlsPanel>

      {exportOpen && (
        <Suspense fallback={null}>
          <ExportDialog
            settings={settings}
            camera={exportCamera}
            onPng={onPngExport}
            onClose={() => setExportOpen(false)}
          />
        </Suspense>
      )}
    </ToolShell>
  );
}
