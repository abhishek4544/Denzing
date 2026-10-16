"use client";

import Image from "next/image";
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
import { MAX_SLABS } from "../security-grid-3d/defaults";
import { defaultLabSettings, type AutonomousAgentsLabSettings } from "./defaults";
import { AutonomousAgentsLabScene } from "./scene";
import { exportLabScene } from "./export-image";
import type { ExportCamera } from "./export-options";

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

export function AutonomousAgents3DLabTool() {
  const [settings, setSettings] = useState<AutonomousAgentsLabSettings>(defaultLabSettings);
  const canvasHostRef = useRef<HTMLDivElement>(null);
  const orbitRef = useRef<unknown>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportCamera, setExportCamera] = useState<ExportCamera>({
    position: [0, 10, 20],
    target: [0, 0, 0],
  });

  const update = useCallback(
    <K extends keyof AutonomousAgentsLabSettings>(
      key: K,
      value: AutonomousAgentsLabSettings[K],
    ) => {
      setSettings((current) => ({ ...current, [key]: value }));
    },
    [],
  );

  const onReset = useCallback(() => setSettings(defaultLabSettings), []);

  const onSavePreset = useCallback(() => {
    downloadPreset<AutonomousAgentsLabSettings>("autonomous-agents-3d-lab", settings);
  }, [settings]);

  const onLoadPreset = useCallback(() => {
    pickPresetFile<AutonomousAgentsLabSettings>(
      "autonomous-agents-3d-lab",
      (loaded) => setSettings({ ...defaultLabSettings, ...loaded }),
      (msg) => {
        if (typeof window !== "undefined") window.alert(`Preset load failed: ${msg}`);
      },
    );
  }, []);

  const onPngExport = useCallback(() => {
    const host = canvasHostRef.current;
    if (!host) return;
    const gl = host.querySelector("canvas");
    if (gl instanceof HTMLCanvasElement) exportLabScene(gl);
  }, []);

  const onExport = useCallback(() => {
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
        position: controls.object.position.toArray() as [number, number, number],
        target: controls.target.toArray() as [number, number, number],
        zoom: controls.object.zoom,
        viewport: rect ? { width: rect.width, height: rect.height } : undefined,
      });
    } else if (rect) {
      setExportCamera((cam) => ({
        ...cam,
        viewport: { width: rect.width, height: rect.height },
      }));
    }
    setExportOpen(true);
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
      toolLabel="Autonomous Agents Lab"
      tools={tools}
      activeToolId="autonomous-agents-3d-lab"
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
            <AutonomousAgentsLabScene settings={settings} />
          </Canvas>
        </div>
      </CanvasArea>

      <ControlsPanel
        title="POTATOO"
        icon={
          <Image
            src="/figma/potatoo-logo.svg"
            alt="POTATOO"
            width={42}
            height={24}
            className="block"
          />
        }
        onReset={onReset}
      >
        <Section title="Preset">
          <div className="flex gap-1.5">
            <SectionButton onClick={onSavePreset} className="flex-1 w-auto px-2">
              Download
            </SectionButton>
            <SectionButton onClick={onLoadPreset} className="flex-1 w-auto px-2">
              Upload
            </SectionButton>
          </div>
        </Section>

        <Section title="Scene">
          <SliderField
            label="Rotation (°)"
            value={settings.sceneRotationDegrees}
            min={0}
            max={360}
            step={1}
            onChange={(v) => update("sceneRotationDegrees", v)}
          />
          <SliderField
            label="Left Offset"
            value={settings.leftOffset}
            min={0}
            max={400}
            step={1}
            onChange={(v) => update("leftOffset", v)}
          />
          <SliderField
            label="Right Offset"
            value={settings.rightOffset}
            min={0}
            max={800}
            step={1}
            onChange={(v) => update("rightOffset", v)}
          />
          <SliderField
            label="Top Offset"
            value={settings.topOffset}
            min={0}
            max={400}
            step={1}
            onChange={(v) => update("topOffset", v)}
          />
          <SliderField
            label="Bottom Offset"
            value={settings.bottomOffset}
            min={0}
            max={400}
            step={1}
            onChange={(v) => update("bottomOffset", v)}
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

        <Section title="Labels">
          <ToggleField
            size="compact"
            label="Right Labels"
            checked={settings.rightLabelsEnabled}
            onCheckedChange={(v) => update("rightLabelsEnabled", v)}
          />
          {settings.rightLabels.map((text, i) => (
            <TextField
              key={`right-label-${i}`}
              label={`Right ${i + 1}`}
              value={text}
              onChange={(v) => {
                const next = settings.rightLabels.slice();
                next[i] = v;
                update("rightLabels", next);
              }}
            />
          ))}
          <SliderField
            label="Right Offset X"
            value={settings.rightLabelsOffsetX}
            min={-2400}
            max={2400}
            step={1}
            onChange={(v) => update("rightLabelsOffsetX", v)}
          />
          <SliderField
            label="Right Spacing Y"
            value={settings.rightLabelsSpacingY}
            min={10}
            max={400}
            step={1}
            onChange={(v) => update("rightLabelsSpacingY", v)}
          />
          <SliderField
            label="Right Font Size"
            value={settings.rightLabelsFontSize}
            min={6}
            max={120}
            step={1}
            onChange={(v) => update("rightLabelsFontSize", v)}
          />
          <ColorField
            label="Right Color"
            color={settings.rightLabelsColor}
            opacity={100}
            onColorChange={(v) => update("rightLabelsColor", v)}
            onOpacityChange={() => {}}
            showPipette={false}
          />
          <ToggleField
            size="compact"
            label="Center Label"
            checked={settings.centerLabelEnabled}
            onCheckedChange={(v) => update("centerLabelEnabled", v)}
          />
          <TextField
            label="Center Text"
            value={settings.centerLabelText}
            onChange={(v) => update("centerLabelText", v)}
          />
          <SliderField
            label="Center Offset Y"
            value={settings.centerLabelOffsetY}
            min={-1200}
            max={1200}
            step={1}
            onChange={(v) => update("centerLabelOffsetY", v)}
          />
          <SliderField
            label="Center Font Size"
            value={settings.centerLabelFontSize}
            min={6}
            max={200}
            step={1}
            onChange={(v) => update("centerLabelFontSize", v)}
          />
          <ColorField
            label="Center Color"
            color={settings.centerLabelColor}
            opacity={100}
            onColorChange={(v) => update("centerLabelColor", v)}
            onOpacityChange={() => {}}
            showPipette={false}
          />
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

        <Section title="Slabs">
          <ToggleField
            size="compact"
            label="Wireframe Cube"
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
          <ToggleField
            size="compact"
            label="Solid Slabs"
            checked={settings.cubeSlabsEnabled}
            onCheckedChange={(v) => update("cubeSlabsEnabled", v)}
          />
          <ToggleField
            size="compact"
            label="Hide Wireframe"
            checked={settings.cubeHideWireframeWhenSlabs}
            onCheckedChange={(v) => update("cubeHideWireframeWhenSlabs", v)}
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
            onChange={(v) => update("cubeSlabClearcoatRough", v)}
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
            label="Slab Labels"
            checked={settings.cubeSlabLabelsEnabled}
            onCheckedChange={(v) => update("cubeSlabLabelsEnabled", v)}
          />
          <SelectField
            label="Label Side"
            value={settings.cubeSlabLabelSide}
            onChange={(v) =>
              update("cubeSlabLabelSide", v as "right" | "left" | "front" | "back")
            }
            options={[
              { value: "right", label: "Right" },
              { value: "left", label: "Left" },
              { value: "front", label: "Front" },
              { value: "back", label: "Back" },
            ]}
          />
          <SliderField
            label="Label Offset"
            value={settings.cubeSlabLabelOffset}
            min={0}
            max={300}
            onChange={(v) => update("cubeSlabLabelOffset", v)}
          />
          <SliderField
            label="Label Font Size"
            value={settings.cubeSlabLabelFontSize}
            min={4}
            max={40}
            step={1}
            onChange={(v) => update("cubeSlabLabelFontSize", v)}
          />
          <ColorField
            label="Label Text"
            color={settings.cubeSlabLabelTextColor}
            opacity={100}
            onColorChange={(v) => update("cubeSlabLabelTextColor", v)}
            onOpacityChange={() => {}}
            showPipette={false}
          />
          <ColorField
            label="Label Bg"
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

        <Section title="Core">
          <ToggleField
            size="compact"
            label="Enabled"
            checked={settings.cubeCoreEnabled}
            onCheckedChange={(v) => update("cubeCoreEnabled", v)}
          />
          <ColorField
            label="Color"
            color={settings.cubeCoreColor}
            opacity={100}
            onColorChange={(v) => update("cubeCoreColor", v)}
            onOpacityChange={() => {}}
            showPipette={false}
          />
          <SliderField
            label="Emission"
            value={settings.cubeCoreEmission}
            min={0}
            max={500}
            onChange={(v) => update("cubeCoreEmission", v)}
          />
          <SliderField
            label="Size %"
            value={settings.cubeCoreSizePct}
            min={10}
            max={100}
            onChange={(v) => update("cubeCoreSizePct", v)}
          />
        </Section>

        <Section title="Wires">
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
            label="Bend Radial (Bow)"
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

        <Section title="Floor">
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
            label="Grid Opacity Near"
            value={settings.gridOpacityNear}
            min={0}
            max={100}
            onChange={(v) => update("gridOpacityNear", v)}
          />
          <SliderField
            label="Grid Opacity Far"
            value={settings.gridOpacityFar}
            min={0}
            max={100}
            onChange={(v) => update("gridOpacityFar", v)}
          />
          <ColorField
            label="Zero Nodes"
            color={settings.zeroColor}
            opacity={settings.zeroOpacity}
            onColorChange={(v) => update("zeroColor", v)}
            onOpacityChange={(v) => update("zeroOpacity", v)}
            showPipette={false}
          />
          <SliderField
            label="Zero Ring Size"
            value={settings.zeroRingSize}
            min={10}
            max={90}
            onChange={(v) => update("zeroRingSize", v)}
          />
          <SliderField
            label="Zero Ring Thickness"
            value={settings.zeroRingThickness}
            min={5}
            max={60}
            onChange={(v) => update("zeroRingThickness", v)}
          />
          <SliderField
            label="Active Tile Count"
            value={settings.activeCount}
            min={0}
            max={40}
            step={1}
            onChange={(v) => update("activeCount", v)}
          />
          <SliderField
            label="Active Radius"
            value={settings.activeRadius}
            min={5}
            max={100}
            onChange={(v) => update("activeRadius", v)}
          />
          <SliderField
            label="Active Center Bias"
            value={settings.activeCenterBias}
            min={0}
            max={100}
            onChange={(v) => update("activeCenterBias", v)}
          />
          <SliderField
            label="Active Seed"
            value={settings.activeSeed}
            min={1}
            max={999}
            step={1}
            onChange={(v) => update("activeSeed", v)}
          />
          <SliderField
            label="Active Tile Scale"
            value={settings.activeTileScale}
            min={1}
            max={100}
            onChange={(v) => update("activeTileScale", v)}
          />
          <ColorField
            label="Active Tile"
            color={settings.activeTileColor}
            opacity={100}
            onColorChange={(v) => update("activeTileColor", v)}
            onOpacityChange={() => {}}
            showPipette={false}
          />
          <SliderField
            label="Active Emission"
            value={settings.activeTileEmission}
            min={0}
            max={200}
            onChange={(v) => update("activeTileEmission", v)}
          />
          <ColorField
            label="Active Symbol"
            color={settings.activeSymbolColor}
            opacity={100}
            onColorChange={(v) => update("activeSymbolColor", v)}
            onOpacityChange={() => {}}
            showPipette={false}
          />
          <ToggleField
            size="compact"
            label="Tile Animation"
            checked={settings.activeAnimEnabled}
            onCheckedChange={(v) => update("activeAnimEnabled", v)}
          />
          <SelectField
            label="Anim Mode"
            value={settings.activeAnimMode}
            onChange={(v) =>
              update("activeAnimMode", v as "pulse" | "wave" | "flicker")
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
