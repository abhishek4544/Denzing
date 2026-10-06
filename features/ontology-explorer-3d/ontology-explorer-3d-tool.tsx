"use client";

import Image from "next/image";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ComponentRef,
} from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import {
  CanvasArea,
  ColorField,
  ControlsPanel,
  Section,
  SelectField,
  SliderField,
  ToggleField,
  ToolShell,
} from "@/components/tool-shell";
import { tools } from "@/features/tool-registry";
import { ConstellationCanvas } from "./constellation-canvas";
import {
  backgroundOptions,
  canvasAspectOptions,
  canvasAspectValue,
  defaultExplorerSettings,
  focusOptions,
  layerOptions,
  layoutOptions,
  viewModeOptions,
  type CanvasAspect,
  type ExplorerSettings,
  type LayerId,
  type ViewMode,
} from "./defaults";
import { BigDataBurstScene } from "./burst-scene";
import { BurstHud } from "./burst-hud";
import { CosmosHud } from "./cosmos-hud";
import { CustomAspectDialog } from "./custom-aspect-dialog";
import { exportOntologyScene } from "./export-image";
import type { ExportCamera } from "./export-options";
import { OntologyScene } from "./scene";
import {
  initialModelState,
  modelReducer,
  type ModelEdge,
  type ModelNode,
} from "./model";

const ExportDialog = lazy(() => import("./export-dialog"));

function CameraFov({ fov }: { fov: number }) {
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

function ExposureSync() {
  const get = useThree((s) => s.get);
  useEffect(() => {
    const g = get().gl;
    g.toneMapping = THREE.ACESFilmicToneMapping;
    g.toneMappingExposure = 1.2;
  }, [get]);
  return null;
}

export function OntologyExplorer3DTool() {
  const [settings, setSettings] = useState<ExplorerSettings>(defaultExplorerSettings);
  const [model, dispatch] = useReducer(modelReducer, undefined, initialModelState);
  const canvasHostRef = useRef<HTMLDivElement>(null);
  const orbitControlsRef = useRef<ComponentRef<typeof OrbitControls>>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [customAspectOpen, setCustomAspectOpen] = useState(false);
  const [exportCamera, setExportCamera] = useState<ExportCamera>({
    position: [10, 6, 12],
    target: [0, 0, 0],
  });
  // Preview override: while the user's pointer sits on a Focus Kind option,
  // the scene reads THIS value instead of the persisted focusKind.
  const [hoverFocusKind, setHoverFocusKind] = useState<
    ExplorerSettings["focusKind"] | null
  >(null);

  const update = useCallback(
    <K extends keyof ExplorerSettings>(key: K, value: ExplorerSettings[K]) => {
      setSettings((current) => ({ ...current, [key]: value }));
    },
    [],
  );

  const selectAspect = useCallback(
    (value: CanvasAspect) => {
      if (value === "custom") setCustomAspectOpen(true);
      else update("canvasAspect", value);
    },
    [update],
  );

  const toggleLayer = useCallback((layer: LayerId, value: boolean) => {
    setSettings((current) => ({
      ...current,
      layers: { ...current.layers, [layer]: value },
    }));
  }, []);

  const onPngExport = useCallback(() => {
    const host = canvasHostRef.current;
    if (!host) return;
    // Prefer the 3D WebGL canvas if it's mounted; otherwise capture the SVG.
    const gl = host.querySelector("canvas");
    if (gl instanceof HTMLCanvasElement) {
      exportOntologyScene(gl);
      return;
    }
    const svg = host.querySelector("svg");
    if (svg instanceof SVGSVGElement) {
      const serialized = new XMLSerializer().serializeToString(svg);
      const blob = new Blob([serialized], { type: "image/svg+xml" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "constellation.svg";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }
  }, []);

  const onExport = useCallback(() => {
    const controls = orbitControlsRef.current;
    const rect = canvasHostRef.current
      ?.querySelector("canvas")
      ?.getBoundingClientRect();
    if (controls) {
      setExportCamera({
        position: controls.object.position.toArray() as [number, number, number],
        target: controls.target.toArray() as [number, number, number],
        viewport: rect ? { width: rect.width, height: rect.height } : undefined,
      });
    }
    setExportOpen(true);
  }, []);

  const onReset = useCallback(() => {
    setSettings(defaultExplorerSettings);
    dispatch({ type: "reset" });
  }, []);

  // Memoized arrays passed to the 3D scene — stable per model reference.
  const modelNodes = useMemo<ModelNode[]>(
    () => model.nodeOrder.map((id) => model.nodes[id]),
    [model.nodes, model.nodeOrder],
  );
  const modelEdges = useMemo<ModelEdge[]>(
    () => model.edgeOrder.map((id) => model.edges[id]),
    [model.edges, model.edgeOrder],
  );

  // Effective settings the scenes actually see — hover override wins.
  const effectiveSettings = useMemo<ExplorerSettings>(
    () => ({
      ...settings,
      focusKind: hoverFocusKind ?? settings.focusKind,
    }),
    [settings, hoverFocusKind],
  );

  const aspect = canvasAspectValue(
    settings.canvasAspect,
    settings.canvasAspectWidth,
    settings.canvasAspectHeight,
  );

  return (
    <ToolShell
      toolLabel="Ontology Explorer"
      tools={tools}
      activeToolId="ontology-explorer-3d"
      topbarActions={
        <Select
          value={settings.canvasAspect ?? "auto"}
          onValueChange={(value) => {
            if (value !== null) selectAspect(value as CanvasAspect);
          }}
        >
          <SelectTrigger
            aria-label="Canvas aspect ratio"
            className="!h-[40px] !w-auto min-w-[138px] !rounded-[8px] !border-border !bg-card !px-3 !text-[14px] !font-medium shadow-none"
          >
            <span>
              Ratio ·{" "}
              {settings.canvasAspect && settings.canvasAspect !== "auto"
                ? settings.canvasAspect === "custom"
                  ? `${settings.canvasAspectWidth ?? 16}:${settings.canvasAspectHeight ?? 9}`
                  : settings.canvasAspect
                : "Auto"}
            </span>
          </SelectTrigger>
          <SelectContent>
            {canvasAspectOptions.map((option) => (
              <SelectItem
                key={option.value}
                value={option.value}
                onClick={() => {
                  if (option.value === "custom") setCustomAspectOpen(true);
                }}
              >
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      }
      onExport={onExport}
    >
      {customAspectOpen && (
        <CustomAspectDialog
          width={settings.canvasAspectWidth ?? 16}
          height={settings.canvasAspectHeight ?? 9}
          onClose={() => setCustomAspectOpen(false)}
          onApply={(width, height) => {
            setSettings((current) => ({
              ...current,
              canvasAspect: "custom",
              canvasAspectWidth: width,
              canvasAspectHeight: height,
            }));
            setCustomAspectOpen(false);
          }}
        />
      )}
      {exportOpen && (
        <Suspense fallback={null}>
          <ExportDialog
            settings={settings}
            model={model}
            camera={exportCamera}
            onPng={onPngExport}
            onClose={() => setExportOpen(false)}
          />
        </Suspense>
      )}
      <CanvasArea>
        <div
          ref={canvasHostRef}
          className="relative h-full w-full rounded-lg overflow-hidden bg-[#04040c]"
          style={{
            boxShadow:
              "inset 0 0 0 1px rgba(255,255,255,0.05), 0 22px 60px -30px rgba(0,0,0,0.65)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            containerType: "size",
          }}
        >
          <div
            className="relative overflow-hidden"
            style={{
              width: aspect ? `min(100cqw, ${aspect * 100}cqh)` : "100%",
              height: aspect ? `min(100cqh, ${100 / aspect}cqw)` : "100%",
            }}
          >
          {settings.viewMode === "constellation-2d" ? (
            <ConstellationCanvas
              model={model}
              dispatch={dispatch}
              settings={effectiveSettings}
            />
          ) : (
            <>
              <Canvas
                shadows
                dpr={[1.5, 3]}
                gl={{
                  antialias: true,
                  powerPreference: "high-performance",
                  preserveDrawingBuffer: true,
                  alpha: false,
                  stencil: false,
                }}
                camera={{ position: [10, 6, 12], fov: settings.fov, near: 0.1, far: 200 }}
              >
                <ExposureSync />
                <CameraFov fov={settings.fov} />
                <OrbitControls
                  ref={orbitControlsRef}
                  enableDamping
                  dampingFactor={0.08}
                  minDistance={6}
                  maxDistance={38}
                  autoRotate={settings.autoRotate}
                  autoRotateSpeed={settings.rotateSpeed / 25}
                  makeDefault
                />
                {settings.viewMode === "burst-3d" ? (
                  <BigDataBurstScene
                    nodes={modelNodes}
                    edges={modelEdges}
                    settings={effectiveSettings}
                  />
                ) : (
                  <OntologyScene
                    nodes={modelNodes}
                    edges={modelEdges}
                    settings={effectiveSettings}
                  />
                )}
              </Canvas>
              {settings.viewMode === "burst-3d" ? (
                <BurstHud />
              ) : (
                <CosmosHud
                  nodeCount={model.nodeOrder.length}
                  edgeCount={model.edgeOrder.length}
                  viewMode="COSMOS"
                />
              )}
            </>
          )}
          </div>
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
        <Section title="View">
          <SelectField
            label="Mode"
            value={settings.viewMode}
            onChange={(value) => update("viewMode", value as ViewMode)}
            options={viewModeOptions.map((o) => ({ value: o.value, label: o.label }))}
          />
        </Section>

        <Section title="Layers">
          {layerOptions.map((option) => (
            <ToggleField
              key={option.value}
              label={option.label}
              checked={settings.layers[option.value]}
              onCheckedChange={(value) => toggleLayer(option.value, value)}
            />
          ))}
          <SliderField
            label="Label Font Size"
            value={settings.layerLabelFontSize}
            min={7}
            max={32}
            step={1}
            onChange={(value) => update("layerLabelFontSize", value)}
          />
          <SliderField
            label="Label Scale"
            value={settings.layerLabelScale}
            min={50}
            max={300}
            step={1}
            onChange={(value) => update("layerLabelScale", value)}
          />
          <SelectField
            label="Focus kind"
            value={settings.focusKind}
            onChange={(value) => update("focusKind", value as ExplorerSettings["focusKind"])}
            onOptionHover={(v) =>
              setHoverFocusKind(v as ExplorerSettings["focusKind"] | null)
            }
            options={focusOptions.map((o) => ({ value: o.value, label: o.label }))}
          />
        </Section>

        <Section title="Nodes">
          <ToggleField
            label="Show Box"
            checked={settings.boxVisible}
            onCheckedChange={(value) => update("boxVisible", value)}
          />
          <ToggleField
            label="Box Solid"
            checked={settings.boxSolid}
            onCheckedChange={(value) => update("boxSolid", value)}
          />
          <ToggleField
            label="Box Stroke"
            checked={settings.boxStroke}
            onCheckedChange={(value) => update("boxStroke", value)}
          />
          <SliderField
            label="Node Size"
            value={settings.nodeSize}
            min={0.2}
            max={1.6}
            step={0.01}
            onChange={(value) => update("nodeSize", value)}
          />
          <SliderField
            label="Metalness"
            value={settings.nodeMetalness}
            min={0}
            max={1}
            step={0.01}
            onChange={(value) => update("nodeMetalness", value)}
          />
          <SliderField
            label="Roughness"
            value={settings.nodeRoughness}
            min={0}
            max={1}
            step={0.01}
            onChange={(value) => update("nodeRoughness", value)}
          />
          <SliderField
            label="Emissive Glow"
            value={settings.nodeEmissive}
            min={0}
            max={2}
            step={0.01}
            onChange={(value) => update("nodeEmissive", value)}
          />
          <SliderField
            label="Iridescence"
            value={settings.nodeIridescence}
            min={0}
            max={1}
            step={0.01}
            onChange={(value) => update("nodeIridescence", value)}
          />
          <SliderField
            label="Label Density"
            value={settings.labelDensity}
            min={0}
            max={100}
            onChange={(value) => update("labelDensity", value)}
          />
          <SliderField
            label="Label Size"
            value={settings.labelSize}
            min={20}
            max={80}
            onChange={(value) => update("labelSize", value)}
          />
        </Section>

        <Section title="Edges">
          <SliderField
            label="Thickness"
            value={settings.edgeThickness}
            min={1}
            max={20}
            onChange={(value) => update("edgeThickness", value)}
          />
          <SliderField
            label="Opacity"
            value={settings.edgeOpacity}
            min={0}
            max={100}
            onChange={(value) => update("edgeOpacity", value)}
          />
          <SliderField
            label="Curvature"
            value={settings.edgeCurvature}
            min={0}
            max={100}
            onChange={(value) => update("edgeCurvature", value)}
          />
          <SliderField
            label="Glow"
            value={settings.edgeGlow}
            min={0}
            max={100}
            onChange={(value) => update("edgeGlow", value)}
          />
          <ToggleField
            label="Flow Pulses"
            checked={settings.edgeFlow}
            onCheckedChange={(value) => update("edgeFlow", value)}
          />
          <SliderField
            label="Flow Speed"
            value={settings.flowSpeed}
            min={0}
            max={100}
            onChange={(value) => update("flowSpeed", value)}
          />
        </Section>

        <Section title="Rings">
          <SliderField
            label="Stroke"
            value={settings.ringThickness}
            min={0}
            max={20}
            onChange={(value) => update("ringThickness", value)}
          />
          <SliderField
            label="Opacity"
            value={settings.ringOpacity}
            min={0}
            max={100}
            onChange={(value) => update("ringOpacity", value)}
          />
        </Section>

        <Section title="Camera & Layout">
          <SelectField
            label="Layout"
            value={settings.layout}
            onChange={(value) => update("layout", value as ExplorerSettings["layout"])}
            options={layoutOptions.map((o) => ({ value: o.value, label: o.label }))}
          />
          <ToggleField
            label="Auto Rotate"
            checked={settings.autoRotate}
            onCheckedChange={(value) => update("autoRotate", value)}
          />
          <SliderField
            label="Rotate Speed"
            value={settings.rotateSpeed}
            min={0}
            max={100}
            onChange={(value) => update("rotateSpeed", value)}
          />
          <SliderField
            label="Field of View"
            value={settings.fov}
            min={20}
            max={80}
            onChange={(value) => update("fov", value)}
          />
        </Section>

        <Section title="Appearance">
          <ColorField
            label="Background"
            color={settings.backgroundColor}
            opacity={100}
            onColorChange={(value) => update("backgroundColor", value)}
            onOpacityChange={() => {}}
            showPipette={false}
          />
          <SelectField
            label="Environment"
            value={settings.background}
            onChange={(value) => update("background", value as ExplorerSettings["background"])}
            options={backgroundOptions.map((o) => ({ value: o.value, label: o.label }))}
          />
          <SliderField
            label="Ambient"
            value={settings.ambientStrength}
            min={0}
            max={100}
            onChange={(value) => update("ambientStrength", value)}
          />
          <SliderField
            label="Key Light"
            value={settings.keyLight}
            min={0}
            max={200}
            onChange={(value) => update("keyLight", value)}
          />
          <SliderField
            label="Rim Light"
            value={settings.rimLight}
            min={0}
            max={200}
            onChange={(value) => update("rimLight", value)}
          />
          <SliderField
            label="Fill Light"
            value={settings.fillLight}
            min={0}
            max={200}
            onChange={(value) => update("fillLight", value)}
          />
          <SliderField
            label="Fog Density"
            value={settings.fogDensity}
            min={0}
            max={100}
            onChange={(value) => update("fogDensity", value)}
          />
          <SliderField
            label="Aurora Intensity"
            value={settings.auroraIntensity}
            min={0}
            max={100}
            onChange={(value) => update("auroraIntensity", value)}
          />
        </Section>

        <Section title="Post FX">
          <SliderField
            label="Bloom Intensity"
            value={settings.bloomIntensity}
            min={0}
            max={200}
            onChange={(value) => update("bloomIntensity", value)}
          />
          <SliderField
            label="Bloom Threshold"
            value={settings.bloomThreshold}
            min={0}
            max={100}
            onChange={(value) => update("bloomThreshold", value)}
          />
          <SliderField
            label="Bloom Smoothing"
            value={settings.bloomSmoothing}
            min={0}
            max={100}
            onChange={(value) => update("bloomSmoothing", value)}
          />
          <SliderField
            label="DOF Focus"
            value={settings.dofFocus}
            min={0}
            max={100}
            onChange={(value) => update("dofFocus", value)}
          />
          <SliderField
            label="DOF Aperture"
            value={settings.dofAperture}
            min={0}
            max={100}
            onChange={(value) => update("dofAperture", value)}
          />
          <SliderField
            label="DOF Focal Length"
            value={settings.dofFocalLength}
            min={0}
            max={100}
            onChange={(value) => update("dofFocalLength", value)}
          />
          <SliderField
            label="Vignette"
            value={settings.vignette}
            min={0}
            max={100}
            onChange={(value) => update("vignette", value)}
          />
          <SliderField
            label="Chromatic Aberration"
            value={settings.chromaticAberration}
            min={0}
            max={100}
            onChange={(value) => update("chromaticAberration", value)}
          />
        </Section>
      </ControlsPanel>
    </ToolShell>
  );
}
