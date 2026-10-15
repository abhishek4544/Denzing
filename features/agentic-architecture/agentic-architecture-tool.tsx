"use client";

import Image from "next/image";
import { useCallback, useRef, useState } from "react";
import {
  CanvasArea,
  ColorField,
  ControlsPanel,
  Section,
  SectionButton,
  SliderField,
  TextField,
  ToggleField,
  ToolShell,
} from "@/components/tool-shell";
import { downloadPreset, pickPresetFile } from "@/features/preset-io";
import { tools } from "@/features/tool-registry";
import {
  defaultAgenticArchitectureSettings,
  type AgenticArchitectureSettings,
} from "./defaults";
import { AgenticArchitectureScene } from "./scene";
import { exportArchitectureScene } from "./export-image";

export function AgenticArchitectureTool() {
  const [settings, setSettings] = useState<AgenticArchitectureSettings>(
    defaultAgenticArchitectureSettings,
  );
  const svgRef = useRef<SVGSVGElement | null>(null);

  const update = useCallback(
    <K extends keyof AgenticArchitectureSettings>(
      key: K,
      value: AgenticArchitectureSettings[K],
    ) => {
      setSettings((current) => ({ ...current, [key]: value }));
    },
    [],
  );

  const onReset = useCallback(
    () => setSettings(defaultAgenticArchitectureSettings),
    [],
  );

  const onSavePreset = useCallback(() => {
    downloadPreset<AgenticArchitectureSettings>("agentic-architecture", settings);
  }, [settings]);

  const onLoadPreset = useCallback(() => {
    pickPresetFile<AgenticArchitectureSettings>(
      "agentic-architecture",
      (loaded) =>
        setSettings({ ...defaultAgenticArchitectureSettings, ...loaded }),
      (msg) => {
        if (typeof window !== "undefined") window.alert(`Preset load failed: ${msg}`);
      },
    );
  }, []);

  const onExport = useCallback(() => {
    if (svgRef.current) exportArchitectureScene(svgRef.current, settings.backgroundColor);
  }, [settings.backgroundColor]);

  return (
    <ToolShell
      toolLabel="Agentic Architecture"
      tools={tools}
      activeToolId="agentic-architecture"
      onExport={onExport}
    >
      <CanvasArea>
        <div
          className="relative h-full w-full overflow-hidden rounded-lg"
          style={{
            background: settings.backgroundColor,
            boxShadow:
              "inset 0 0 0 1px rgba(255,255,255,0.05), 0 22px 60px -30px rgba(0,0,0,0.65)",
          }}
        >
          <AgenticArchitectureScene settings={settings} svgRef={svgRef} />
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

        <Section title="Canvas">
          <ColorField
            label="Background"
            color={settings.backgroundColor}
            opacity={100}
            onColorChange={(v) => update("backgroundColor", v)}
            onOpacityChange={() => {}}
            showPipette={false}
          />
          <ColorField
            label="Line"
            color={settings.lineColor}
            opacity={100}
            onColorChange={(v) => update("lineColor", v)}
            onOpacityChange={() => {}}
            showPipette={false}
          />
          <SliderField
            label="Line Opacity"
            value={settings.lineOpacity}
            min={0}
            max={100}
            onChange={(v) => update("lineOpacity", v)}
          />
          <SliderField
            label="Line Thickness"
            value={settings.lineThickness}
            min={0.3}
            max={4}
            step={0.1}
            onChange={(v) => update("lineThickness", v)}
          />
          <ColorField
            label="Accent"
            color={settings.accentColor}
            opacity={100}
            onColorChange={(v) => update("accentColor", v)}
            onOpacityChange={() => {}}
            showPipette={false}
          />
          <SliderField
            label="Accent Opacity"
            value={settings.accentOpacity}
            min={0}
            max={100}
            onChange={(v) => update("accentOpacity", v)}
          />
        </Section>

        <Section title="Title">
          <TextField
            label="Eyebrow"
            value={settings.subtitleText}
            onChange={(v) => update("subtitleText", v)}
          />
          <TextField
            label="Headline"
            value={settings.titleText}
            onChange={(v) => update("titleText", v)}
          />
          <ColorField
            label="Eyebrow Color"
            color={settings.subtitleColor}
            opacity={100}
            onColorChange={(v) => update("subtitleColor", v)}
            onOpacityChange={() => {}}
            showPipette={false}
          />
          <ColorField
            label="Headline Color"
            color={settings.titleColor}
            opacity={100}
            onColorChange={(v) => update("titleColor", v)}
            onOpacityChange={() => {}}
            showPipette={false}
          />
          <SliderField
            label="Eyebrow Size"
            value={settings.subtitleFontSize}
            min={6}
            max={28}
            step={1}
            onChange={(v) => update("subtitleFontSize", v)}
          />
          <SliderField
            label="Headline Size"
            value={settings.titleFontSize}
            min={16}
            max={72}
            step={1}
            onChange={(v) => update("titleFontSize", v)}
          />
        </Section>

        <Section title="Modules">
          <TextField
            label="Top Caption"
            value={settings.moduleTopLabel}
            onChange={(v) => update("moduleTopLabel", v)}
          />
          <TextField
            label="Center Caption"
            value={settings.moduleCenterLabel}
            onChange={(v) => update("moduleCenterLabel", v)}
          />
          <TextField
            label="Bottom Caption"
            value={settings.moduleBottomLabel}
            onChange={(v) => update("moduleBottomLabel", v)}
          />
          <TextField
            label="Top Bracket"
            value={settings.bracketLabelTop}
            onChange={(v) => update("bracketLabelTop", v)}
          />
          <TextField
            label="Center Bracket"
            value={settings.bracketLabelCenter}
            onChange={(v) => update("bracketLabelCenter", v)}
          />
          <TextField
            label="Bottom Bracket"
            value={settings.bracketLabelBottom}
            onChange={(v) => update("bracketLabelBottom", v)}
          />
          <SliderField
            label="Module Width %"
            value={settings.moduleWidthPct}
            min={50}
            max={160}
            step={1}
            onChange={(v) => update("moduleWidthPct", v)}
          />
          <SliderField
            label="Module Gap %"
            value={settings.moduleGapPct}
            min={0}
            max={15}
            step={0.1}
            onChange={(v) => update("moduleGapPct", v)}
          />
        </Section>

        <Section title="Motion">
          <SliderField
            label="Orbit Speed"
            value={settings.orbitSpeed}
            min={0}
            max={100}
            onChange={(v) => update("orbitSpeed", v)}
          />
        </Section>

        <Section title="Flow Lines">
          <ToggleField
            label="Enabled"
            checked={settings.flowLinesEnabled}
            onCheckedChange={(v) => update("flowLinesEnabled", v)}
          />
          <SliderField
            label="Count (per corner)"
            value={settings.flowLineCount}
            min={1}
            max={6}
            step={1}
            onChange={(v) => update("flowLineCount", v)}
          />
          <SliderField
            label="Opacity"
            value={settings.flowLineOpacity}
            min={0}
            max={100}
            onChange={(v) => update("flowLineOpacity", v)}
          />
        </Section>
      </ControlsPanel>
    </ToolShell>
  );
}
