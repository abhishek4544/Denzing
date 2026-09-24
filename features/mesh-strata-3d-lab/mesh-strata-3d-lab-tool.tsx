"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { GripVertical } from "lucide-react";
import * as THREE from "three";
import {
  CanvasArea,
  ColorField,
  ControlsPanel,
  LayersPanel,
  Section,
  SectionButton,
  SelectField,
  SliderField,
  ToggleField,
  ToolShell,
} from "@/components/tool-shell";
import { downloadPreset, pickPresetFile } from "@/features/preset-io";
import { tools } from "@/features/tool-registry";
import {
  contentTypeOptions,
  defaultStrataSettings,
  frameColorPresets,
  frameShapeOptions,
  MAX_LAYERS,
  type ContentType,
  type FrameColorPreset,
  type FrameShape,
  type StrataSettings,
} from "./defaults";
import { MeshStrataScene } from "./scene";
import { exportStrataScene } from "./export-image";

function CameraSync({ fov, iso }: { fov: number; iso: boolean }) {
  const get = useThree((s) => s.get);
  useEffect(() => {
    const cam = get().camera;
    if (cam instanceof THREE.PerspectiveCamera) {
      cam.fov = iso ? Math.min(fov, 22) : fov;
      cam.updateProjectionMatrix();
    }
  }, [get, fov, iso]);
  return null;
}

function ExposureSync() {
  const get = useThree((s) => s.get);
  useEffect(() => {
    const g = get().gl;
    g.toneMapping = THREE.ACESFilmicToneMapping;
    g.toneMappingExposure = 1.15;
  }, [get]);
  return null;
}

export function MeshStrata3DLabTool() {
  const [settings, setSettings] = useState<StrataSettings>(defaultStrataSettings);
  const canvasHostRef = useRef<HTMLDivElement>(null);

  const update = useCallback(
    <K extends keyof StrataSettings>(key: K, value: StrataSettings[K]) => {
      setSettings((current) => ({ ...current, [key]: value }));
    },
    [],
  );

  const onReset = useCallback(() => setSettings(defaultStrataSettings), []);

  const onSavePreset = useCallback(() => {
    downloadPreset<StrataSettings>("mesh-strata-3d-lab", settings);
  }, [settings]);

  const onLoadPreset = useCallback(() => {
    pickPresetFile<StrataSettings>(
      "mesh-strata-3d-lab",
      (loaded) => setSettings({ ...defaultStrataSettings, ...loaded }),
      (msg) => {
        if (typeof window !== "undefined") window.alert(`Preset load failed: ${msg}`);
      },
    );
  }, []);

  const setLayerColor = useCallback((index: number, color: string) => {
    setSettings((current) => {
      const next = current.layerColors.slice();
      next[index] = color;
      return { ...current, layerColors: next };
    });
  }, []);

  const setLayerContentType = useCallback(
    (index: number, type: ContentType) => {
      setSettings((current) => {
        const next = current.layerContent.slice();
        next[index] = type;
        return { ...current, layerContent: next };
      });
    },
    [],
  );

  const setLayerName = useCallback((index: number, name: string) => {
    setSettings((current) => {
      const next = current.layerNames.slice();
      next[index] = name;
      return { ...current, layerNames: next };
    });
  }, []);

  const moveLayer = useCallback((from: number, to: number) => {
    if (from === to) return;
    setSettings((current) => {
      const move = <T,>(arr: T[]): T[] => {
        const next = arr.slice();
        const [item] = next.splice(from, 1);
        next.splice(to, 0, item);
        return next;
      };
      return {
        ...current,
        layerColors: move(current.layerColors),
        layerContent: move(current.layerContent),
        layerAmplitudes: move(current.layerAmplitudes),
        layerWaveScales: move(current.layerWaveScales),
        layerNames: move(current.layerNames),
      };
    });
  }, []);

  const addLayer = useCallback(() => {
    setSettings((current) => {
      if (current.layerCount >= MAX_LAYERS) return current;
      return { ...current, layerCount: current.layerCount + 1 };
    });
  }, []);



  const setLayerGap = useCallback((index: number, gap: number) => {
    setSettings((current) => {
      const next = current.layerGaps.slice();
      next[index] = gap;
      return { ...current, layerGaps: next };
    });
  }, []);

  const setAllLayerColors = useCallback((color: string) => {
    setSettings((current) => ({
      ...current,
      meshColor: color,
      layerColors: current.layerColors.map(() => color),
    }));
  }, []);

  const setAllLayerGaps = useCallback((gap: number) => {
    setSettings((current) => ({
      ...current,
      layerGaps: current.layerGaps.map(() => gap),
    }));
  }, []);

  const applyFramePreset = useCallback((preset: FrameColorPreset) => {
    const entry = frameColorPresets.find((p) => p.value === preset);
    setSettings((current) => ({
      ...current,
      frameColorPreset: preset,
      frameColor: entry && entry.color ? entry.color : current.frameColor,
    }));
  }, []);

  const onExport = useCallback(() => {
    const host = canvasHostRef.current;
    if (!host) return;
    const gl = host.querySelector("canvas");
    if (gl instanceof HTMLCanvasElement) exportStrataScene(gl);
  }, []);

  // Isometric-ish camera framing OR frontal near-horizontal view.
  const camDistance = 22;
  const camPos: [number, number, number] = settings.isoView
    ? [camDistance * 0.72, camDistance * 0.62, camDistance * 0.72]
    : [camDistance * 0.02, camDistance * 0.09, camDistance * 1.0];

  return (
    <ToolShell
      toolLabel="Mesh Strata Lab"
      tools={tools}
      activeToolId="mesh-strata-3d-lab"
      onExport={onExport}
    >
      <CanvasArea hasLeftPanel>
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
            camera={{
              position: camPos,
              fov: settings.fov,
              near: 0.1,
              far: 200,
            }}
          >
            <color attach="background" args={[settings.backgroundColor]} />
            <ExposureSync />
            <CameraSync fov={settings.fov} iso={settings.isoView} />
            <OrbitControls
              enableDamping
              dampingFactor={0.08}
              minDistance={10}
              maxDistance={60}
              autoRotate={settings.autoRotate}
              autoRotateSpeed={settings.rotateSpeed / 20}
              makeDefault
              target={[0, 0, 0]}
            />
            <MeshStrataScene settings={settings} />
          </Canvas>
        </div>
      </CanvasArea>

      <LayersPanel
        onAdd={addLayer}
        canAdd={settings.layerCount < MAX_LAYERS}
      >
        {Array.from({ length: settings.layerCount }).map((_, i) => {
          const isLast = i === settings.layerCount - 1;
          const currentColor = settings.layerColors[i] ?? settings.meshColor;
          const currentName = settings.layerNames[i] ?? "";
          return (
            <div key={`layer-${i}`}>
              <div
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData("text/layer-index", String(i));
                  e.dataTransfer.effectAllowed = "move";
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  const from = Number(
                    e.dataTransfer.getData("text/layer-index"),
                  );
                  if (!Number.isNaN(from)) moveLayer(from, i);
                }}
                className="group flex items-center gap-1.5 px-2 py-1 hover:bg-accent/40 transition-colors"
              >
                <span
                  className="w-4 flex items-center justify-center text-muted-foreground group-hover:text-foreground cursor-grab active:cursor-grabbing shrink-0"
                  title="Drag to reorder"
                >
                  <GripVertical className="w-3 h-3" strokeWidth={1.75} />
                </span>
                <label
                  className="relative w-4 h-4 rounded-[4px] border border-[#f2f2f3] shrink-0 cursor-pointer overflow-hidden"
                  aria-label={`Layer ${i + 1} color`}
                >
                  <span
                    className="absolute inset-0"
                    style={{ backgroundColor: currentColor }}
                  />
                  <input
                    type="color"
                    value={currentColor}
                    onChange={(e) => setLayerColor(i, e.target.value)}
                    className="absolute inset-0 opacity-0 cursor-pointer"
                  />
                </label>
                <input
                  type="text"
                  value={currentName}
                  onChange={(e) => setLayerName(i, e.target.value)}
                  placeholder={`Layer ${i + 1}`}
                  className="flex-1 min-w-0 h-[21px] px-1 bg-transparent text-[10px] font-medium text-foreground leading-[1.1] outline-none focus:bg-muted rounded-[4px]"
                  aria-label={`Layer ${i + 1} name`}
                />
                <select
                  value={settings.layerContent[i] ?? "none"}
                  onChange={(e) =>
                    setLayerContentType(i, e.target.value as ContentType)
                  }
                  className="h-[21px] rounded-[5px] bg-muted border-none text-[10px] font-medium text-foreground px-1 outline-none shrink-0 max-w-[86px]"
                  aria-label={`Layer ${i + 1} content type`}
                >
                  {contentTypeOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              {!isLast && (
                <div className="px-2 pb-1">
                  <SliderField
                    label={`Gap`}
                    value={settings.layerGaps[i] ?? 0}
                    min={5}
                    max={140}
                    onChange={(v) => setLayerGap(i, v)}
                  />
                </div>
              )}
            </div>
          );
        })}
      </LayersPanel>

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
            <SectionButton
              onClick={onSavePreset}
              className="flex-1 w-auto px-2"
            >
              Download
            </SectionButton>
            <SectionButton
              onClick={onLoadPreset}
              className="flex-1 w-auto px-2"
            >
              Upload
            </SectionButton>
          </div>
        </Section>

        <Section title="Stack">
          <SliderField
            label="Layer Count"
            value={settings.layerCount}
            min={2}
            max={MAX_LAYERS}
            step={1}
            onChange={(v) => update("layerCount", v)}
          />
          <SliderField
            label="All Gaps"
            value={settings.layerGaps[0] ?? 0}
            min={10}
            max={100}
            onChange={setAllLayerGaps}
          />
          <SliderField
            label="Plane Size"
            value={settings.planeSize}
            min={4}
            max={16}
            step={0.1}
            onChange={(v) => update("planeSize", v)}
          />
          <SliderField
            label="Grid Resolution"
            value={settings.segments}
            min={12}
            max={80}
            step={1}
            onChange={(v) => update("segments", v)}
          />
        </Section>

        <Section title="Deformation">
          <SliderField
            label="Amplitude"
            value={settings.amplitude}
            min={0}
            max={100}
            onChange={(v) => update("amplitude", v)}
          />
          <ToggleField
            label="Random Amplitude"
            checked={settings.randomAmplitude}
            onCheckedChange={(v) => update("randomAmplitude", v)}
          />
          <SliderField
            label="Wave Scale"
            value={settings.waveScale}
            min={0}
            max={100}
            onChange={(v) => update("waveScale", v)}
          />
          <SliderField
            label="Content Density"
            value={settings.contentDensity}
            min={0}
            max={120}
            step={1}
            onChange={(v) => update("contentDensity", v)}
          />
          <SliderField
            label="Content Size"
            value={settings.contentSize}
            min={5}
            max={100}
            onChange={(v) => update("contentSize", v)}
          />
          <SliderField
            label="Content Opacity"
            value={settings.contentOpacity}
            min={0}
            max={100}
            onChange={(v) => update("contentOpacity", v)}
          />
          <ToggleField
            label="Connecting Lines"
            checked={settings.contentConnect}
            onCheckedChange={(v) => update("contentConnect", v)}
          />
          <SliderField
            label="Flow Speed"
            value={settings.contentFlowSpeed}
            min={0}
            max={100}
            onChange={(v) => update("contentFlowSpeed", v)}
          />
          <SliderField
            label="Content Bob"
            value={settings.contentBob}
            min={0}
            max={100}
            onChange={(v) => update("contentBob", v)}
          />
          <SliderField
            label="Bottom Bias"
            value={settings.bottomBias}
            min={0}
            max={100}
            onChange={(v) => update("bottomBias", v)}
          />
          <SliderField
            label="Seed"
            value={settings.seed}
            min={0}
            max={100}
            step={1}
            onChange={(v) => update("seed", v)}
          />
        </Section>

        <Section title="Colors">
          <ColorField
            label="Mesh (all)"
            color={settings.meshColor}
            opacity={100}
            onColorChange={setAllLayerColors}
            onOpacityChange={() => {}}
            showPipette={false}
          />
          <ColorField
            label="Core"
            color={settings.coreColor}
            opacity={100}
            onColorChange={(v) => update("coreColor", v)}
            onOpacityChange={() => {}}
            showPipette={false}
          />
          <ColorField
            label="Edge"
            color={settings.edgeColor}
            opacity={100}
            onColorChange={(v) => update("edgeColor", v)}
            onOpacityChange={() => {}}
            showPipette={false}
          />
          <ColorField
            label="Background"
            color={settings.backgroundColor}
            opacity={100}
            onColorChange={(v) => update("backgroundColor", v)}
            onOpacityChange={() => {}}
            showPipette={false}
          />
          <SliderField
            label="Line Opacity"
            value={settings.lineOpacity}
            min={10}
            max={100}
            onChange={(v) => update("lineOpacity", v)}
          />
        </Section>

        <Section title="Frame">
          <SelectField
            label="Shape"
            value={settings.frameShape}
            onChange={(v) => update("frameShape", v as FrameShape)}
            options={frameShapeOptions.map((o) => ({
              value: o.value,
              label: o.label,
            }))}
          />
          <SelectField
            label="Color Preset"
            value={settings.frameColorPreset}
            onChange={(v) => applyFramePreset(v as FrameColorPreset)}
            options={frameColorPresets.map((o) => ({
              value: o.value,
              label: o.label,
            }))}
          />
          <ColorField
            label="Color"
            color={settings.frameColor}
            opacity={100}
            onColorChange={(v) => {
              update("frameColor", v);
              update("frameColorPreset", "custom");
            }}
            onOpacityChange={() => {}}
            showPipette={false}
          />
          <SliderField
            label="Padding"
            value={settings.framePadding}
            min={0}
            max={40}
            onChange={(v) => update("framePadding", v)}
          />
          <SliderField
            label="Opacity"
            value={settings.frameOpacity}
            min={0}
            max={100}
            onChange={(v) => update("frameOpacity", v)}
          />
          <ToggleField
            label="Side Grid"
            checked={settings.frameGridEnabled}
            onCheckedChange={(v) => update("frameGridEnabled", v)}
          />
          <SliderField
            label="Grid Resolution"
            value={settings.frameGridResolution}
            min={2}
            max={30}
            step={1}
            onChange={(v) => update("frameGridResolution", v)}
          />
          <ColorField
            label="Grid Color"
            color={settings.frameGridColor}
            opacity={100}
            onColorChange={(v) => update("frameGridColor", v)}
            onOpacityChange={() => {}}
            showPipette={false}
          />
          <SliderField
            label="Grid Opacity"
            value={settings.frameGridOpacity}
            min={0}
            max={100}
            onChange={(v) => update("frameGridOpacity", v)}
          />
        </Section>

        <Section title="Blur">
          <SliderField
            label="Layer Blur"
            value={settings.layerBlur}
            min={0}
            max={100}
            onChange={(v) => update("layerBlur", v)}
          />
          <SliderField
            label="Focus"
            value={settings.blurFocus}
            min={0}
            max={100}
            onChange={(v) => update("blurFocus", v)}
          />
          <SliderField
            label="Range"
            value={settings.blurRange}
            min={0}
            max={100}
            onChange={(v) => update("blurRange", v)}
          />
        </Section>

        <Section title="Camera">
          <ToggleField
            label="Isometric"
            checked={settings.isoView}
            onCheckedChange={(v) => update("isoView", v)}
          />
          <ToggleField
            label="Auto Rotate"
            checked={settings.autoRotate}
            onCheckedChange={(v) => update("autoRotate", v)}
          />
          <SliderField
            label="Rotate Speed"
            value={settings.rotateSpeed}
            min={0}
            max={100}
            onChange={(v) => update("rotateSpeed", v)}
          />
          <SliderField
            label="Field of View"
            value={settings.fov}
            min={16}
            max={60}
            onChange={(v) => update("fov", v)}
          />
        </Section>

        <Section title="Platforms">
          <ColorField
            label="Color"
            color={settings.platformColor}
            opacity={100}
            onColorChange={(v) => update("platformColor", v)}
            onOpacityChange={() => {}}
            showPipette={false}
          />
          <SliderField
            label="Scale"
            value={settings.platformScale}
            min={30}
            max={250}
            onChange={(v) => update("platformScale", v)}
          />
          <SliderField
            label="Height"
            value={settings.platformHeight}
            min={0}
            max={200}
            onChange={(v) => update("platformHeight", v)}
          />
          <SliderField
            label="Node Size"
            value={settings.platformNodeSize}
            min={30}
            max={300}
            onChange={(v) => update("platformNodeSize", v)}
          />
        </Section>

        <Section title="Data Foundation">
          <ColorField
            label="Color"
            color={settings.foundationColor}
            opacity={100}
            onColorChange={(v) => update("foundationColor", v)}
            onOpacityChange={() => {}}
            showPipette={false}
          />
          <SliderField
            label="Density"
            value={settings.foundationDensity}
            min={2}
            max={12}
            step={1}
            onChange={(v) => update("foundationDensity", v)}
          />
          <SliderField
            label="Block Size"
            value={settings.foundationBlockSize}
            min={10}
            max={120}
            onChange={(v) => update("foundationBlockSize", v)}
          />
          <SliderField
            label="Max Height"
            value={settings.foundationMaxHeight}
            min={5}
            max={200}
            onChange={(v) => update("foundationMaxHeight", v)}
          />
          <SliderField
            label="Height Variance"
            value={settings.foundationVariance}
            min={0}
            max={100}
            onChange={(v) => update("foundationVariance", v)}
          />
        </Section>

        <Section title="Cursor">
          <SliderField
            label="Radius"
            value={settings.cursorRadius}
            min={0.5}
            max={10}
            step={0.05}
            onChange={(v) => update("cursorRadius", v)}
          />
          <SliderField
            label="Strength"
            value={settings.cursorStrength}
            min={0}
            max={4}
            step={0.05}
            onChange={(v) => update("cursorStrength", v)}
          />
          <SliderField
            label="Fluidity"
            value={settings.cursorFluidity}
            min={0}
            max={100}
            onChange={(v) => update("cursorFluidity", v)}
          />
          <SliderField
            label="Return Speed"
            value={settings.cursorReturnSpeed}
            min={0}
            max={100}
            onChange={(v) => update("cursorReturnSpeed", v)}
          />
          <SliderField
            label="Vertical Reach"
            value={settings.cursorVerticalReach}
            min={2}
            max={200}
            onChange={(v) => update("cursorVerticalReach", v)}
          />
        </Section>

        <Section title="Idle Motion">
          <SliderField
            label="Amplitude"
            value={settings.idleAmplitude}
            min={0}
            max={100}
            onChange={(v) => update("idleAmplitude", v)}
          />
          <SliderField
            label="Wave Scale"
            value={settings.idleScale}
            min={0}
            max={100}
            onChange={(v) => update("idleScale", v)}
          />
          <SliderField
            label="Flow Speed"
            value={settings.idleSpeed}
            min={0}
            max={100}
            onChange={(v) => update("idleSpeed", v)}
          />
        </Section>

        <Section title="Post FX">
          <SliderField
            label="Bloom Intensity"
            value={settings.bloomIntensity}
            min={0}
            max={200}
            onChange={(v) => update("bloomIntensity", v)}
          />
        </Section>
      </ControlsPanel>
    </ToolShell>
  );
}
