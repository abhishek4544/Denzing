"use client";

import Image from "next/image";
import { lazy, Suspense, useCallback, useRef, useState, type ComponentRef } from "react";
import type { OrbitControls } from "@react-three/drei";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
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
  defaultStrataSettings,
  canvasAspectOptions,
  glassEnvOptions,
  type StrataSettings,
  type CanvasAspect,
  type GlassEnv,
} from "./defaults";
import { AutonomousAgentsGenerativeScene, realismFromSettings } from "./generative-scene";
import { OutcomesOverlay } from "./outcomes-overlay";
import { validateStrataPreset } from "./validate-preset";
import { CustomAspectDialog } from "./custom-aspect-dialog";
import { exportStrataScene } from "./export-image";
import type { ExportCamera } from "./export-options";

const ExportDialog = lazy(() => import("./export-dialog"));

export function AutonomousAgents3DTool() {
  const [settings, setSettings] = useState<StrataSettings>(defaultStrataSettings);
  const [exportOpen, setExportOpen] = useState(false);
  const [customAspectOpen, setCustomAspectOpen] = useState(false);
  const selectAspect = (value: CanvasAspect) => {
    if (value === "custom") setCustomAspectOpen(true);
    else update("canvasAspect", value);
  };
  const [exportCamera, setExportCamera] = useState<ExportCamera>({ position: [0.9, 4.05, 45], target: [0, 0, 0] });
  const canvasHostRef = useRef<HTMLDivElement>(null);
  const orbitControlsRef = useRef<ComponentRef<typeof OrbitControls>>(null);

  const update = useCallback(
    <K extends keyof StrataSettings>(key: K, value: StrataSettings[K]) => {
      setSettings((current) => ({ ...current, [key]: value }));
    },
    [],
  );

  const onReset = useCallback(() => {
    setSettings(defaultStrataSettings);
    orbitControlsRef.current?.reset();
  }, []);

  const onSavePreset = useCallback(() => {
    downloadPreset<StrataSettings>("autonomous-agents-3d", settings);
  }, [settings]);

  const onLoadPreset = useCallback(() => {
    pickPresetFile<StrataSettings>(
      "autonomous-agents-3d",
      (loaded) => setSettings(validateStrataPreset(loaded)),
      (msg) => {
        if (typeof window !== "undefined") window.alert(`Preset load failed: ${msg}`);
      },
    );
  }, []);

  const onPngExport = useCallback(() => {
    const host = canvasHostRef.current;
    if (!host) return;
    const gl = host.querySelector("canvas");
    if (!(gl instanceof HTMLCanvasElement)) return;
    const camera = orbitControlsRef.current?.object;
    exportStrataScene(gl, settings, camera);
  }, [settings]);

  // Pulled-back framing leaves breathing room around the full stack.
  return (
    <ToolShell
      toolLabel="Autonomous Agents 3D"
      tools={tools}
      activeToolId="autonomous-agents-3d"
      topbarActions={
        <Select value={settings.canvasAspect ?? "auto"}
          onValueChange={(value) => { if (value !== null) selectAspect(value as CanvasAspect); }}>
          <SelectTrigger aria-label="Canvas aspect ratio"
            className="!h-[40px] !w-auto min-w-[138px] !rounded-[8px] !border-border !bg-card !px-3 !text-[14px] !font-medium shadow-none">
            <span>Ratio · {settings.canvasAspect && settings.canvasAspect !== "auto" ? settings.canvasAspect === "custom" ? `${settings.canvasAspectWidth ?? 16}:${settings.canvasAspectHeight ?? 9}` : settings.canvasAspect : "Auto"}</span>
          </SelectTrigger>
          <SelectContent>
            {canvasAspectOptions.map((option) => <SelectItem key={option.value} value={option.value} onClick={() => { if (option.value === "custom") setCustomAspectOpen(true); }}>{option.label}</SelectItem>)}
          </SelectContent>
        </Select>
      }
      onExport={() => {
        const controls = orbitControlsRef.current;
        const rect = canvasHostRef.current?.querySelector("canvas")?.getBoundingClientRect();
        if (controls) setExportCamera({ position: controls.object.position.toArray() as [number, number, number], target: controls.target.toArray() as [number, number, number], viewport: rect ? { width: rect.width, height: rect.height } : undefined });
        setExportOpen(true);
      }}
    >
      {customAspectOpen && <CustomAspectDialog width={settings.canvasAspectWidth ?? 16} height={settings.canvasAspectHeight ?? 9}
        onClose={() => setCustomAspectOpen(false)} onApply={(width, height) => {
          setSettings((current) => ({ ...current, canvasAspect: "custom", canvasAspectWidth: width, canvasAspectHeight: height }));
          setCustomAspectOpen(false);
        }} />}
      {exportOpen && <Suspense fallback={null}>
        <ExportDialog settings={settings} camera={exportCamera} onPng={onPngExport} onClose={() => setExportOpen(false)} />
      </Suspense>}
      <CanvasArea>
        <div
          ref={canvasHostRef}
          className="relative h-full w-full rounded-lg overflow-hidden"
          style={{
            background: settings.canvasAspect && settings.canvasAspect !== "auto" ? "var(--background)" : settings.backgroundColor,
            boxShadow:
              "inset 0 0 0 1px rgba(255,255,255,0.05), 0 22px 60px -30px rgba(0,0,0,0.65)",
          }}
        >
          <AutonomousAgentsGenerativeScene
            background={settings.backgroundColor}
            autoRotate={settings.autoRotate}
            rotateSpeed={settings.rotateSpeed}
            fov={settings.fov}
            width={settings.enclosureWidth}
            height={settings.enclosureHeight}
            depth={settings.enclosureDepth}
            rings={settings.enclosureRings}
            cubeWidth={settings.coreCubeWidth}
            cubeHeight={settings.coreCubeHeight}
            cubeDepth={settings.coreCubeDepth}
            cubeFloorPadding={settings.coreCubeFloorPadding}
            lineCount={settings.lineCount}
            lineColor={settings.lineColor}
            lineAnimationSpeed={settings.lineAnimationSpeed}
            lineBottomDensity={settings.lineBottomDensity}
            lineBottomSpread={settings.lineBottomSpread}
            lineTopExitCount={settings.lineTopExitCount}
            lineTopExitColor={settings.lineTopExitColor}
            lineFlowDensity={settings.lineFlowDensity}
            lineFlowDuty={settings.lineFlowDuty}
            lineTopFade={settings.lineTopFade}
            lineBottomFade={settings.lineBottomFade}
            topPipeRadius={settings.topPipeRadius}
            topPipeOpacity={settings.topPipeOpacity}
            topBubbleCount={settings.topBubbleCount}
            topBubbleSize={settings.topBubbleSize}
            topInnerColor={settings.topInnerColor}
            topInnerOpacity={settings.topInnerOpacity}
            topInnerThickness={settings.topInnerThickness}
            topInnerFlowSpeed={settings.topInnerFlowSpeed}
            topInnerFlowDensity={settings.topInnerFlowDensity}
            gridResolution={settings.gridResolution}
            gridColor={settings.gridColor}
            gridOpacity={settings.gridOpacity * (settings.globalLineOpacity / 100)}
            gridPadding={settings.gridPadding}
            basePlaneColor={settings.basePlaneColor}
            basePlaneOpacity={settings.basePlaneOpacity}
            floorSize={settings.floorSize}
            floorCells={settings.floorCells}
            floorEdgeFade={settings.floorEdgeFade}
            floorEdgeIntensity={settings.floorEdgeIntensity}
            floorOpacityNear={settings.floorOpacityNear * (settings.globalLineOpacity / 100)}
            floorOpacityFar={settings.floorOpacityFar * (settings.globalLineOpacity / 100)}
            floorGridColor={settings.floorGridColor}
            zeroNodeCount={settings.zeroNodeCount}
            zeroNodeColor={settings.zeroNodeColor}
            zeroNodeSize={settings.zeroNodeSize}
            zeroNodeOpacity={settings.zeroNodeOpacity}
            zeroNodeRadius={settings.zeroNodeRadius}
            enclosureLineOpacity={settings.enclosureLineOpacity * (settings.globalLineOpacity / 100)}
            agentEnabled={settings.agentEnabled}
            agentLayerY={settings.agentLayerY}
            agentSize={settings.agentSize}
            agentLayerCount={settings.agentLayerCount}
            agentLayerSpacing={settings.agentLayerSpacing}
            agentLayerStagger={settings.agentLayerStagger}
            agentGridN={settings.agentGridN}
            agentNodeSize={settings.agentNodeSize}
            agentEdgeOpacity={settings.agentEdgeOpacity}
            agentSignalCount={settings.agentSignalCount}
            agentSignalSpeed={settings.agentSignalSpeed}
            agentSignalLength={settings.agentSignalLength}
            agentSignalThickness={settings.agentSignalThickness}
            agentSignalColor={settings.agentSignalColor}
            agentNodeColor={settings.agentNodeColor}
            agentDecayLength={settings.agentDecayLength}
            agentRefractory={settings.agentRefractory}
            agentSpawnRate={settings.agentSpawnRate}
            agentMinAmplitude={settings.agentMinAmplitude}
            realism={realismFromSettings(settings)}
            outcomes={settings}
            controlsRef={orbitControlsRef}
          />
          <OutcomesOverlay settings={settings} />
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

        <Section title="Realism">
          <ToggleField
            size="compact"
            label="Enabled"
            checked={settings.realismEnabled}
            onCheckedChange={(v) => update("realismEnabled", v)}
          />
          <SliderField
            label="Exposure"
            value={settings.toneMappingExposure}
            min={30}
            max={200}
            step={1}
            onChange={(v) => update("toneMappingExposure", v)}
          />
          <ToggleField
            size="compact"
            label="HDRI"
            checked={settings.hdriEnabled}
            onCheckedChange={(v) => update("hdriEnabled", v)}
          />
          <SelectField
            label="HDRI Preset"
            value={settings.hdriPreset}
            onChange={(v) => update("hdriPreset", v as GlassEnv)}
            options={glassEnvOptions.map((o) => ({ value: o.value, label: o.label }))}
          />
          <SliderField
            label="HDRI Intensity"
            value={settings.hdriIntensity}
            min={0}
            max={200}
            onChange={(v) => update("hdriIntensity", v)}
          />
          <ToggleField
            size="compact"
            label="HDRI as Background"
            checked={settings.hdriBackground}
            onCheckedChange={(v) => update("hdriBackground", v)}
          />
          <ToggleField
            size="compact"
            label="Ambient Occlusion"
            checked={settings.aoEnabled}
            onCheckedChange={(v) => update("aoEnabled", v)}
          />
          <SliderField
            label="AO Intensity"
            value={settings.aoIntensity}
            min={0}
            max={200}
            onChange={(v) => update("aoIntensity", v)}
          />
          <SliderField
            label="AO Radius"
            value={settings.aoRadius}
            min={0}
            max={100}
            onChange={(v) => update("aoRadius", v)}
          />
          <SliderField
            label="AO Aperture"
            value={settings.aoAperture}
            min={0}
            max={100}
            onChange={(v) => update("aoAperture", v)}
          />
          <SliderField
            label="Key Light"
            value={settings.keyLightIntensity}
            min={0}
            max={300}
            onChange={(v) => update("keyLightIntensity", v)}
          />
          <ColorField
            label="Key Color"
            color={settings.keyLightColor}
            opacity={100}
            onColorChange={(v) => update("keyLightColor", v)}
            onOpacityChange={() => {}}
            showPipette={false}
          />
          <SliderField
            label="Fill Light"
            value={settings.fillLightIntensity}
            min={0}
            max={300}
            onChange={(v) => update("fillLightIntensity", v)}
          />
          <SliderField
            label="Rim Light"
            value={settings.rimLightIntensity}
            min={0}
            max={300}
            onChange={(v) => update("rimLightIntensity", v)}
          />
          <ColorField
            label="Rim Color"
            color={settings.rimLightColor}
            opacity={100}
            onColorChange={(v) => update("rimLightColor", v)}
            onOpacityChange={() => {}}
            showPipette={false}
          />
          <SliderField
            label="Film Grain"
            value={settings.filmGrain}
            min={0}
            max={100}
            onChange={(v) => update("filmGrain", v)}
          />
          <SliderField
            label="Line Opacity (global)"
            value={settings.globalLineOpacity}
            min={0}
            max={100}
            onChange={(v) => update("globalLineOpacity", v)}
          />
        </Section>

        <Section title="Outcomes">
          <ToggleField
            size="compact"
            label="Enabled"
            checked={settings.outcomesEnabled}
            onCheckedChange={(v) => update("outcomesEnabled", v)}
          />
          {settings.outcomeLabels.map((label, i) => (
            <TextField
              key={`outcome-${i}`}
              label={`Outcome ${i + 1}`}
              value={label}
              onChange={(v) => {
                const next = settings.outcomeLabels.slice();
                next[i] = v;
                update("outcomeLabels", next);
              }}
            />
          ))}
          <SliderField
            label="Right Offset %"
            value={settings.outcomeRightPct}
            min={0}
            max={40}
            step={0.5}
            onChange={(v) => update("outcomeRightPct", v)}
          />
          <SliderField
            label="Top Offset %"
            value={settings.outcomeTopPct}
            min={0}
            max={80}
            step={0.5}
            onChange={(v) => update("outcomeTopPct", v)}
          />
          <SliderField
            label="Spacing %"
            value={settings.outcomeSpacingPct}
            min={2}
            max={30}
            step={0.5}
            onChange={(v) => update("outcomeSpacingPct", v)}
          />
          <SliderField
            label="Font Size"
            value={settings.outcomeFontSize}
            min={8}
            max={32}
            step={1}
            onChange={(v) => update("outcomeFontSize", v)}
          />
          <ColorField
            label="Text"
            color={settings.outcomeFg}
            opacity={100}
            onColorChange={(v) => update("outcomeFg", v)}
            onOpacityChange={() => {}}
            showPipette={false}
          />
          <ToggleField
            size="compact"
            label="Connector Lines"
            checked={settings.outcomeConnectorsEnabled}
            onCheckedChange={(v) => update("outcomeConnectorsEnabled", v)}
          />
          <ColorField
            label="Connector Color"
            color={settings.outcomeConnectorColor}
            opacity={100}
            onColorChange={(v) => update("outcomeConnectorColor", v)}
            onOpacityChange={() => {}}
            showPipette={false}
          />
          <SliderField
            label="Connector Thickness"
            value={settings.outcomeConnectorThickness}
            min={0.01}
            max={0.4}
            step={0.005}
            onChange={(v) => update("outcomeConnectorThickness", v)}
          />
          <SliderField
            label="Connector Opacity"
            value={settings.outcomeConnectorOpacity}
            min={0}
            max={100}
            onChange={(v) => update("outcomeConnectorOpacity", v)}
          />
        </Section>

        <Section title="Vertical Slabs">
          <ToggleField
            size="compact"
            label="Enabled"
            checked={settings.verticalSlabsEnabled}
            onCheckedChange={(v) => update("verticalSlabsEnabled", v)}
          />
          <SliderField
            label="Count"
            value={settings.verticalSlabCount}
            min={1}
            max={10}
            step={1}
            onChange={(v) => update("verticalSlabCount", v)}
          />
          <SliderField
            label="Center X %"
            value={settings.verticalSlabCenterXPct}
            min={0}
            max={100}
            step={0.5}
            onChange={(v) => update("verticalSlabCenterXPct", v)}
          />
          <SliderField
            label="Zone Width %"
            value={settings.verticalSlabZoneWidthPct}
            min={0}
            max={30}
            step={0.5}
            onChange={(v) => update("verticalSlabZoneWidthPct", v)}
          />
          <SliderField
            label="Height %"
            value={settings.verticalSlabHeightPct}
            min={10}
            max={100}
            step={1}
            onChange={(v) => update("verticalSlabHeightPct", v)}
          />
          <SliderField
            label="Depth %"
            value={settings.verticalSlabDepthPct}
            min={10}
            max={100}
            step={1}
            onChange={(v) => update("verticalSlabDepthPct", v)}
          />
          <SliderField
            label="Thickness"
            value={settings.verticalSlabThickness}
            min={0.02}
            max={1}
            step={0.01}
            onChange={(v) => update("verticalSlabThickness", v)}
          />
          <ColorField
            label="Color"
            color={settings.verticalSlabColor}
            opacity={settings.verticalSlabOpacity}
            onColorChange={(v) => update("verticalSlabColor", v)}
            onOpacityChange={(v) => update("verticalSlabOpacity", v)}
            showPipette={false}
          />
          <SliderField
            label="Grid Resolution"
            value={settings.verticalSlabGridResolution}
            min={2}
            max={60}
            step={1}
            onChange={(v) => update("verticalSlabGridResolution", v)}
          />
        </Section>

        <Section title="Camera">
          <SelectField label="Aspect Ratio" value={settings.canvasAspect ?? "auto"}
            options={canvasAspectOptions} onChange={selectAspect} />
          {settings.canvasAspect === "custom" && <SectionButton onClick={() => setCustomAspectOpen(true)}>Edit custom ratio</SectionButton>}
          <ToggleField size="compact"
            label="Isometric"
            checked={settings.isoView}
            onCheckedChange={(v) => update("isoView", v)}
          />
          <ToggleField size="compact"
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

        <Section title="Enclosure">
          <SliderField
            label="Width"
            value={settings.enclosureWidth}
            min={2}
            max={20}
            step={0.1}
            onChange={(v) => update("enclosureWidth", v)}
          />
          <SliderField
            label="Height"
            value={settings.enclosureHeight}
            min={4}
            max={30}
            step={0.1}
            onChange={(v) => update("enclosureHeight", v)}
          />
          <SliderField
            label="Thickness"
            value={settings.enclosureDepth}
            min={1}
            max={15}
            step={0.1}
            onChange={(v) => update("enclosureDepth", v)}
          />
          <SliderField
            label="Frame Rings"
            value={settings.enclosureRings}
            min={3}
            max={40}
            step={1}
            onChange={(v) => update("enclosureRings", v)}
          />
          <SliderField
            label="Line Opacity"
            value={settings.enclosureLineOpacity}
            min={0}
            max={100}
            onChange={(v) => update("enclosureLineOpacity", v)}
          />
        </Section>

        <Section title="Center Cube">
          <SliderField
            label="Width"
            value={settings.coreCubeWidth}
            min={0.2}
            max={6}
            step={0.1}
            onChange={(v) => update("coreCubeWidth", v)}
          />
          <SliderField
            label="Height"
            value={settings.coreCubeHeight}
            min={0.2}
            max={12}
            step={0.1}
            onChange={(v) => update("coreCubeHeight", v)}
          />
          <SliderField
            label="Thickness"
            value={settings.coreCubeDepth}
            min={0.2}
            max={4}
            step={0.1}
            onChange={(v) => update("coreCubeDepth", v)}
          />
          <SliderField
            label="Floor Padding"
            value={settings.coreCubeFloorPadding}
            min={0}
            max={14}
            step={0.1}
            onChange={(v) => update("coreCubeFloorPadding", v)}
          />
        </Section>

        <Section title="Lines">
          <SliderField
            label="Quantity"
            value={settings.lineCount}
            min={20}
            max={600}
            step={1}
            onChange={(v) => update("lineCount", v)}
          />
          <ColorField
            label="Color"
            color={settings.lineColor}
            opacity={100}
            onColorChange={(v) => update("lineColor", v)}
            onOpacityChange={() => {}}
            showPipette={false}
          />
          <SliderField
            label="Animation Speed"
            value={settings.lineAnimationSpeed}
            min={0}
            max={200}
            onChange={(v) => update("lineAnimationSpeed", v)}
          />
          <SliderField
            label="Bottom Density"
            value={settings.lineBottomDensity}
            min={0}
            max={100}
            onChange={(v) => update("lineBottomDensity", v)}
          />
          <SliderField
            label="Bottom Spread"
            value={settings.lineBottomSpread}
            min={0}
            max={250}
            onChange={(v) => update("lineBottomSpread", v)}
          />
          <SliderField
            label="Flow Density"
            value={settings.lineFlowDensity}
            min={1}
            max={30}
            step={1}
            onChange={(v) => update("lineFlowDensity", v)}
          />
          <SliderField
            label="Flow Duty"
            value={settings.lineFlowDuty}
            min={5}
            max={90}
            onChange={(v) => update("lineFlowDuty", v)}
          />
          <SliderField
            label="Top Fade"
            value={settings.lineTopFade}
            min={0}
            max={50}
            onChange={(v) => update("lineTopFade", v)}
          />
          <SliderField
            label="Bottom Fade"
            value={settings.lineBottomFade}
            min={0}
            max={50}
            onChange={(v) => update("lineBottomFade", v)}
          />
        </Section>

        <Section title="Agent">
          <ToggleField
            size="compact"
            label="Enabled"
            checked={settings.agentEnabled}
            onCheckedChange={(v) => update("agentEnabled", v)}
          />
          <ColorField
            label="Signal Color"
            color={settings.agentSignalColor}
            opacity={100}
            onColorChange={(v) => update("agentSignalColor", v)}
            onOpacityChange={() => {}}
            showPipette={false}
          />
          <ColorField
            label="Node Color"
            color={settings.agentNodeColor}
            opacity={100}
            onColorChange={(v) => update("agentNodeColor", v)}
            onOpacityChange={() => {}}
            showPipette={false}
          />
          <SliderField
            label="Grid Size"
            value={settings.agentGridN}
            min={4}
            max={32}
            step={1}
            onChange={(v) => update("agentGridN", v)}
          />
          <SliderField
            label="Node Size"
            value={settings.agentNodeSize}
            min={0}
            max={100}
            onChange={(v) => update("agentNodeSize", v)}
          />
          <SliderField
            label="Edge Opacity"
            value={settings.agentEdgeOpacity}
            min={0}
            max={100}
            onChange={(v) => update("agentEdgeOpacity", v)}
          />
          <SliderField
            label="Signal Count"
            value={settings.agentSignalCount}
            min={0}
            max={800}
            step={1}
            onChange={(v) => update("agentSignalCount", v)}
          />
          <SliderField
            label="Signal Speed"
            value={settings.agentSignalSpeed}
            min={0}
            max={400}
            onChange={(v) => update("agentSignalSpeed", v)}
          />
          <SliderField
            label="Signal Length"
            value={settings.agentSignalLength}
            min={5}
            max={100}
            onChange={(v) => update("agentSignalLength", v)}
          />
          <SliderField
            label="Signal Thickness"
            value={settings.agentSignalThickness}
            min={1}
            max={20}
            onChange={(v) => update("agentSignalThickness", v)}
          />
          <SliderField
            label="Decay Length"
            value={settings.agentDecayLength}
            min={0}
            max={100}
            onChange={(v) => update("agentDecayLength", v)}
          />
          <SliderField
            label="Layer Y"
            value={settings.agentLayerY}
            min={-7}
            max={7}
            step={0.1}
            onChange={(v) => update("agentLayerY", v)}
          />
          <SliderField
            label="Layer Size"
            value={settings.agentSize}
            min={1}
            max={14}
            step={0.1}
            onChange={(v) => update("agentSize", v)}
          />
          <SliderField
            label="Layer Count"
            value={settings.agentLayerCount}
            min={1}
            max={8}
            step={1}
            onChange={(v) => update("agentLayerCount", v)}
          />
          <SliderField
            label="Layer Spacing"
            value={settings.agentLayerSpacing}
            min={0}
            max={3}
            step={0.05}
            onChange={(v) => update("agentLayerSpacing", v)}
          />
          <SliderField
            label="Layer Stagger"
            value={settings.agentLayerStagger}
            min={0}
            max={100}
            onChange={(v) => update("agentLayerStagger", v)}
          />
        </Section>

        <Section title="Base Plane">
          <SliderField
            label="Size"
            value={settings.floorSize}
            min={4}
            max={80}
            step={1}
            onChange={(v) => update("floorSize", v)}
          />
          <SliderField
            label="Cells"
            value={settings.floorCells}
            min={2}
            max={120}
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
            min={10}
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
            color={settings.floorGridColor}
            opacity={100}
            onColorChange={(v) => update("floorGridColor", v)}
            onOpacityChange={() => {}}
            showPipette={false}
          />
          <SliderField
            label="Opacity Near"
            value={settings.floorOpacityNear}
            min={0}
            max={100}
            onChange={(v) => update("floorOpacityNear", v)}
          />
          <SliderField
            label="Opacity Far"
            value={settings.floorOpacityFar}
            min={0}
            max={100}
            onChange={(v) => update("floorOpacityFar", v)}
          />
        </Section>

        <Section title="Zero Nodes">
          <SliderField
            label="Count"
            value={settings.zeroNodeCount}
            min={0}
            max={300}
            step={1}
            onChange={(v) => update("zeroNodeCount", v)}
          />
          <ColorField
            label="Color"
            color={settings.zeroNodeColor}
            opacity={settings.zeroNodeOpacity}
            onColorChange={(v) => update("zeroNodeColor", v)}
            onOpacityChange={(v) => update("zeroNodeOpacity", v)}
            showPipette={false}
          />
          <SliderField
            label="Tile Size"
            value={settings.zeroNodeSize}
            min={10}
            max={120}
            onChange={(v) => update("zeroNodeSize", v)}
          />
          <SliderField
            label="Radius"
            value={settings.zeroNodeRadius}
            min={10}
            max={100}
            onChange={(v) => update("zeroNodeRadius", v)}
          />
        </Section>

        <Section title="Grid">
          <SliderField
            label="Resolution"
            value={settings.gridResolution}
            min={2}
            max={60}
            step={1}
            onChange={(v) => update("gridResolution", v)}
          />
          <ColorField
            label="Color"
            color={settings.gridColor}
            opacity={100}
            onColorChange={(v) => update("gridColor", v)}
            onOpacityChange={() => {}}
            showPipette={false}
          />
          <SliderField
            label="Opacity"
            value={settings.gridOpacity}
            min={0}
            max={100}
            onChange={(v) => update("gridOpacity", v)}
          />
          <SliderField
            label="Padding"
            value={settings.gridPadding}
            min={0}
            max={30}
            onChange={(v) => update("gridPadding", v)}
          />
        </Section>

        <Section title="Background">
          <ColorField
            label="Color"
            color={settings.backgroundColor}
            opacity={100}
            onColorChange={(v) => update("backgroundColor", v)}
            onOpacityChange={() => {}}
            showPipette={false}
          />
        </Section>
      </ControlsPanel>
    </ToolShell>
  );
}
