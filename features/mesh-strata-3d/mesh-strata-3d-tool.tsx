"use client";

import Image from "next/image";
import { Children, Fragment, isValidElement, lazy, Suspense, useCallback, useRef, useState, type ComponentRef, type ReactElement, type ReactNode } from "react";
import type { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { GripVertical } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
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
  defaultStrataSettings,
  canvasAspectOptions,
  frameColorPresets,
  frameShapeOptions,
  layerConceptOptions,
  MAX_LAYERS,
  type FrameColorPreset,
  type FrameShape,
  type LayerConcept,
  type StrataSettings,
  type CanvasAspect,
} from "./defaults";
import MeshStrataViewer from "./viewer";
import { validateStrataPreset } from "./validate-preset";
import { CustomAspectDialog } from "./custom-aspect-dialog";
import { exportStrataScene } from "./export-image";
import type { ExportCamera } from "./export-options";

const ExportDialog = lazy(() => import("./export-dialog"));

/** Group heading row that sits between runs of Sections in the inspector.
 * Not a Section itself — just a labeled divider so the long control list
 * reads as 5-6 named zones instead of one wall of accordions. */
function GroupHeading({ label }: { label: string }) {
  return (
    <div className="px-3.5 pt-5 pb-1.5 bg-card border-b border-border">
      <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </span>
    </div>
  );
}

/** Maps each Section title to a {group, order} so children can be rendered
 * in a predictable grouped order regardless of their source position. New
 * sections default to the "misc" group at the bottom. */
const SECTION_LAYOUT: Record<string, { group: string; order: number }> = {
  "Preset": { group: "Stage", order: 0 },
  "Stack & Layout": { group: "Stack & Layers", order: 10 },
  "Pavilions (Top Layer)": { group: "Stack & Layers", order: 11 },
  "Frame Wrapper": { group: "Stack & Layers", order: 12 },
  "Wires Between Layers": { group: "Stack & Layers", order: 13 },
  "Base Colors": { group: "Surface Look", order: 20 },
  "Surface Wave & Content": { group: "Surface Look", order: 21 },
  "Sparkle Layer": { group: "Per-Concept Tuning", order: 30 },
  "Agent Layer": { group: "Per-Concept Tuning", order: 31 },
  "Cloud Layer": { group: "Per-Concept Tuning", order: 32 },
  "Terrain Layer": { group: "Per-Concept Tuning", order: 33 },
  "Platforms Layer": { group: "Per-Concept Tuning", order: 34 },
  "Box Layer": { group: "Per-Concept Tuning", order: 35 },
  "Camera & Rotation": { group: "Camera & Motion", order: 40 },
  "Cursor Response": { group: "Camera & Motion", order: 41 },
  "Idle Sway": { group: "Camera & Motion", order: 42 },
  "Depth of Field": { group: "Post-Processing", order: 50 },
  "Bloom & Vignette": { group: "Post-Processing", order: 51 },
};
const GROUP_ORDER = ["Stage", "Stack & Layers", "Surface Look", "Per-Concept Tuning", "Camera & Motion", "Post-Processing", "Misc"];

/** Reads each child Section's title, groups and sorts them, and injects a
 * GroupHeading before the first section of each group. Children can be
 * authored in any order — this hoists the IA into one lookup. */
function GroupedSections({ children }: { children: ReactNode }) {
  const sorted = Children.toArray(children)
    .filter((child): child is ReactElement<{ title: string }> =>
      isValidElement(child) && typeof (child.props as { title?: unknown }).title === "string",
    )
    .map((child) => {
      const entry = SECTION_LAYOUT[child.props.title] ?? { group: "Misc", order: 999 };
      return { child, group: entry.group, order: entry.order };
    })
    .sort((a, b) => {
      const ag = GROUP_ORDER.indexOf(a.group);
      const bg = GROUP_ORDER.indexOf(b.group);
      if (ag !== bg) return ag - bg;
      return a.order - b.order;
    });
  const items = sorted.map((item, i) => ({
    ...item,
    showHeading: i === 0 || item.group !== sorted[i - 1].group,
  }));
  return (
    <>
      {items.map(({ child, group, showHeading }, i) => (
        <Fragment key={i}>
          {showHeading ? <GroupHeading label={group} /> : null}
          {child}
        </Fragment>
      ))}
    </>
  );
}

export function MeshStrata3DTool() {
  const [settings, setSettings] = useState<StrataSettings>(defaultStrataSettings);
  const [exportOpen, setExportOpen] = useState(false);
  const [customAspectOpen, setCustomAspectOpen] = useState(false);
  const [openSection, setOpenSection] = useState<string | null>(null);
  const sectionProps = useCallback(
    (title: string) => ({
      title,
      open: openSection === title,
      onOpenChange: (open: boolean) => setOpenSection(open ? title : null),
    }),
    [openSection],
  );
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
    downloadPreset<StrataSettings>("mesh-strata-3d", settings);
  }, [settings]);

  const onLoadPreset = useCallback(() => {
    pickPresetFile<StrataSettings>(
      "mesh-strata-3d",
      (loaded) => setSettings(validateStrataPreset(loaded)),
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

  const setLayerConcept = useCallback(
    (index: number, concept: LayerConcept) => {
      setSettings((current) => {
        const next = current.layerConcept.slice();
        next[index] = concept;
        return { ...current, layerConcept: next };
      });
    },
    [],
  );

  const setLayerBaseOpacity = useCallback(
    (index: number, value: number) => {
      setSettings((current) => {
        const next = current.layerBaseOpacity.slice();
        next[index] = value;
        return { ...current, layerBaseOpacity: next };
      });
    },
    [],
  );

  const setLayerBg = useCallback(
    <K extends "layerBgOpacity" | "layerBgBlur" | "layerBgTransmission" | "layerBgColor">(
      index: number,
      key: K,
      value: StrataSettings[K][number],
    ) => {
      setSettings((current) => {
        const next = current[key].slice();
        (next as (number | string)[])[index] = value;
        return { ...current, [key]: next };
      });
    },
    [],
  );


  const updatePavilion = useCallback(
    <K extends keyof StrataSettings["pavilions"][number]>(
      index: number,
      key: K,
      value: StrataSettings["pavilions"][number][K],
    ) => {
      setSettings((current) => {
        const next = current.pavilions.slice();
        next[index] = { ...next[index], [key]: value };
        return { ...current, pavilions: next };
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

  const setLayerEscapeHeight = useCallback(
    (index: number, value: number) => {
      setSettings((current) => {
        const next = current.layerEscapeHeight.slice();
        next[index] = value;
        return { ...current, layerEscapeHeight: next };
      });
    },
    [],
  );

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
        layerConcept: move(current.layerConcept),
        layerBaseOpacity: move(current.layerBaseOpacity),
        layerBgOpacity: move(current.layerBgOpacity),
        layerBgBlur: move(current.layerBgBlur),
        layerBgTransmission: move(current.layerBgTransmission),
        layerBgColor: move(current.layerBgColor),
        layerAmplitudes: move(current.layerAmplitudes),
        layerWaveScales: move(current.layerWaveScales),
        layerNames: move(current.layerNames),
        layerEscapeHeight: move(current.layerEscapeHeight),
        layerSparkleHeight: move(current.layerSparkleHeight),
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

  const setPairWires = useCallback((index: number, wires: number) => {
    setSettings((current) => {
      const next = current.interlayerWiresPerHubByPair.slice();
      next[index] = wires;
      return { ...current, interlayerWiresPerHubByPair: next };
    });
  }, []);

  const setPairEnabled = useCallback((index: number, on: boolean) => {
    setSettings((current) => {
      const next = current.interlayerEnabledByPair.slice();
      next[index] = on;
      return { ...current, interlayerEnabledByPair: next };
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

  const onPngExport = useCallback(() => {
    const host = canvasHostRef.current;
    if (!host) return;
    const gl = host.querySelector("canvas");
    if (!(gl instanceof HTMLCanvasElement)) return;
    exportStrataScene(gl);
  }, []);

  // Pulled-back framing leaves breathing room around the full stack.
  return (
    <ToolShell
      toolLabel="Mesh Strata 3D"
      tools={tools}
      activeToolId="mesh-strata-3d"
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
      <CanvasArea hasLeftPanel>
        <div
          ref={canvasHostRef}
          className="relative h-full w-full rounded-lg overflow-hidden"
          style={{
            background: settings.canvasAspect && settings.canvasAspect !== "auto" ? "var(--background)" : settings.backgroundColor,
            boxShadow:
              "inset 0 0 0 1px rgba(255,255,255,0.05), 0 22px 60px -30px rgba(0,0,0,0.65)",
          }}
        >
          <MeshStrataViewer settings={settings} maxDpr={2} paused={exportOpen}
            preserveDrawingBuffer interactive controlsRef={orbitControlsRef} />
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
                  value={settings.layerConcept[i] ?? "uniform"}
                  onChange={(e) =>
                    setLayerConcept(i, e.target.value as LayerConcept)
                  }
                  className="h-[21px] rounded-[5px] bg-muted border-none text-[10px] font-medium text-foreground px-1 outline-none shrink-0 max-w-[100px]"
                  aria-label={`Layer ${i + 1} concept`}
                >
                  {layerConceptOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              {(settings.layerConcept[i] === "box" ||
                settings.layerConcept[i] === "uniform") && (
                <div className="px-2 pb-1">
                  <SliderField
                    label="Base Opacity"
                    value={settings.layerBaseOpacity[i] ?? 35}
                    min={0}
                    max={100}
                    onChange={(v) => setLayerBaseOpacity(i, v)}
                  />
                </div>
              )}
              {settings.layerConcept[i] === "cloud" && (
                <div className="px-2 pb-1 space-y-1">
                  <SliderField
                    label="Base Opacity"
                    value={settings.layerBaseOpacity[i] ?? 35}
                    min={0}
                    max={100}
                    onChange={(v) => setLayerBaseOpacity(i, v)}
                  />
                  <SliderField
                    label="Escape Height"
                    value={settings.layerEscapeHeight[i] ?? 35}
                    min={0}
                    max={100}
                    onChange={(v) => setLayerEscapeHeight(i, v)}
                  />
                </div>
              )}
              {settings.layerConcept[i] === "sparkle" && (
                <div className="px-2 pb-1">
                  <SliderField
                    label="Height"
                    value={settings.layerSparkleHeight[i] ?? settings.sparkleHeight}
                    min={0}
                    max={100}
                    onChange={(value) => setSettings((current) => {
                      const next = current.layerSparkleHeight.slice();
                      next[i] = value;
                      return { ...current, layerSparkleHeight: next };
                    })}
                  />
                </div>
              )}
              <div className="px-2 pb-1 pt-1 space-y-1 border-t border-border/40">
                <div className="text-[9px] font-semibold uppercase tracking-[0.08em] text-muted-foreground pb-0.5">
                  Layer Background
                </div>
                <ColorField
                  label="Color"
                  color={
                    settings.layerBgColor[i] ||
                    settings.layerColors[i] ||
                    settings.meshColor
                  }
                  opacity={100}
                  onColorChange={(v) => setLayerBg(i, "layerBgColor", v)}
                  onOpacityChange={() => {}}
                  showPipette={false}
                />
                <SliderField
                  label="Transparency"
                  value={settings.layerBgOpacity[i] ?? 0}
                  min={0}
                  max={100}
                  onChange={(v) => setLayerBg(i, "layerBgOpacity", v)}
                />
                <SliderField
                  label="Blur"
                  value={settings.layerBgBlur[i] ?? 40}
                  min={0}
                  max={100}
                  onChange={(v) => setLayerBg(i, "layerBgBlur", v)}
                />
                <SliderField
                  label="Background Blend"
                  value={settings.layerBgTransmission[i] ?? 20}
                  min={0}
                  max={100}
                  onChange={(v) => setLayerBg(i, "layerBgTransmission", v)}
                />
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
              {!isLast && (
                <div className="px-2 pb-1 space-y-1">
                  <ToggleField size="compact"
                    label="Wires to next layer"
                    checked={
                      settings.interlayerEnabledByPair[i] ??
                      settings.interlayerEnabled
                    }
                    onCheckedChange={(v) => setPairEnabled(i, v)}
                  />
                  <SliderField
                    label="Wire Count"
                    value={
                      settings.interlayerWiresPerHubByPair[i] ??
                      settings.interlayerWiresPerHub
                    }
                    min={0}
                    max={80}
                    step={1}
                    onChange={(v) => setPairWires(i, v)}
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
        <GroupedSections>
        <Section {...sectionProps("Preset")}>
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

        <Section {...sectionProps("Stack & Layout")}>
          <SliderField
            label="Label Font Size"
            value={settings.layerLabelFontSize}
            min={7}
            max={32}
            step={1}
            onChange={(v) => update("layerLabelFontSize", v)}
          />
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

        <Section {...sectionProps("Pavilions (Top Layer)")}>
          <SliderField
            label="Gutter"
            value={settings.pavilionGutter}
            min={0}
            max={10}
            step={0.1}
            onChange={(v) => update("pavilionGutter", v)}
          />
          <SliderField
            label="Row Split (Back %)"
            value={settings.pavilionRowSplit}
            min={20}
            max={80}
            step={0.5}
            onChange={(v) => update("pavilionRowSplit", v)}
          />
          <SliderField
            label="Back Split (Left %)"
            value={settings.pavilionBackSplit}
            min={20}
            max={80}
            step={0.5}
            onChange={(v) => update("pavilionBackSplit", v)}
          />
          <SliderField
            label="Height"
            value={settings.pavilionHeight}
            min={1}
            max={30}
            step={0.5}
            onChange={(v) => update("pavilionHeight", v)}
          />
          <SliderField
            label="Label Gap"
            value={settings.pavilionLabelGap}
            min={0}
            max={20}
            step={0.5}
            onChange={(v) => update("pavilionLabelGap", v)}
          />
          {settings.pavilions.map((p, i) => (
            <div
              key={p.id}
              className="border-t border-border/60 first:border-t-0 pt-2 pb-1 mt-2 first:mt-0 space-y-1.5"
            >
              <div className="flex items-center gap-1.5 px-1 pb-1">
                <label
                  className="relative w-3 h-3 rounded-[3px] border border-[#f2f2f3] shrink-0 cursor-pointer overflow-hidden"
                  aria-label={`${p.id} color`}
                >
                  <span className="absolute inset-0" style={{ backgroundColor: p.color }} />
                  <input
                    type="color"
                    value={p.color}
                    onChange={(e) => updatePavilion(i, "color", e.target.value)}
                    className="absolute inset-0 opacity-0 cursor-pointer"
                  />
                </label>
                <span className="text-[11px] font-semibold text-foreground tracking-[-0.1px] uppercase">
                  Slab {i + 1}
                </span>
              </div>
              <div className="flex items-center gap-1.5 px-1">
                <span className="text-[10px] text-muted-foreground w-14 shrink-0">Name</span>
                <input
                  type="text"
                  value={p.label}
                  onChange={(e) => updatePavilion(i, "label", e.target.value)}
                  className="flex-1 min-w-0 h-[22px] px-1.5 bg-muted text-[11px] text-foreground rounded-[4px] outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
              <div className="flex items-center gap-1.5 px-1">
                <span className="text-[10px] text-muted-foreground w-14 shrink-0">Font</span>
                <input
                  type="text"
                  value={p.fontFamily}
                  onChange={(e) => updatePavilion(i, "fontFamily", e.target.value)}
                  placeholder='"Violet Sans", sans-serif'
                  className="flex-1 min-w-0 h-[22px] px-1.5 bg-muted text-[10px] text-foreground rounded-[4px] outline-none focus:ring-1 focus:ring-ring font-mono"
                />
              </div>
              <ColorField
                label="Text Color"
                color={
                  p.textColor && p.textColor.trim()
                    ? p.textColor
                    : (() => {
                        // Reflect the auto-derived default (deepTint) in the
                        // swatch when the user hasn't picked a color.
                        const c = new THREE.Color(p.color);
                        const hsl = { h: 0, s: 0, l: 0 };
                        c.getHSL(hsl);
                        c.setHSL(hsl.h, Math.min(1, hsl.s + 0.25), 0.1);
                        return `#${c.getHexString()}`;
                      })()
                }
                opacity={100}
                onColorChange={(v) => updatePavilion(i, "textColor", v)}
                onOpacityChange={() => {}}
                showPipette={false}
              />
              <SliderField
                label="Size (% of slab)"
                value={p.fontSize}
                min={5}
                max={60}
                step={0.5}
                onChange={(v) => updatePavilion(i, "fontSize", v)}
              />
              <SliderField
                label="Weight"
                value={p.fontWeight}
                min={100}
                max={900}
                step={100}
                onChange={(v) => updatePavilion(i, "fontWeight", v)}
              />
              <SliderField
                label="Glow"
                value={p.glow}
                min={0}
                max={100}
                onChange={(v) => updatePavilion(i, "glow", v)}
              />
              <SliderField
                label="Reflection"
                value={p.reflection}
                min={0}
                max={100}
                onChange={(v) => updatePavilion(i, "reflection", v)}
              />
              <SliderField
                label="Noise"
                value={p.noise}
                min={0}
                max={100}
                onChange={(v) => updatePavilion(i, "noise", v)}
              />
            </div>
          ))}
        </Section>

        <Section {...sectionProps("Surface Wave & Content")}>
          <SliderField
            label="Amplitude"
            value={settings.amplitude}
            min={0}
            max={100}
            onChange={(v) => update("amplitude", v)}
          />
          <ToggleField size="compact"
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
          <ToggleField size="compact"
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

        <Section {...sectionProps("Base Colors")}>
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

        <Section {...sectionProps("Frame Wrapper")}>
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
          <ToggleField size="compact"
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

        <Section {...sectionProps("Sparkle Layer")}>
          <SliderField
            label="Layer Height (all)"
            value={settings.sparkleHeight}
            min={0}
            max={100}
            onChange={(value) => setSettings((current) => ({
              ...current,
              sparkleHeight: value,
              layerSparkleHeight: Array(MAX_LAYERS).fill(null),
            }))}
          />
          <ToggleField size="compact"
            label="Glass"
            checked={settings.sparkleGlass}
            onCheckedChange={(v) => update("sparkleGlass", v)}
          />
          {settings.sparkleGlass && (
            <>
              <ColorField
                label="Glass Tint"
                color={settings.sparkleGlassTint}
                opacity={100}
                onColorChange={(v) => update("sparkleGlassTint", v)}
                onOpacityChange={() => {}}
                showPipette={false}
              />
              <SliderField
                label="Roughness"
                value={settings.sparkleGlassRoughness}
                min={0}
                max={100}
                onChange={(v) => update("sparkleGlassRoughness", v)}
              />
              <SliderField
                label="Refraction (IOR)"
                value={settings.sparkleGlassIOR}
                min={100}
                max={240}
                onChange={(v) => update("sparkleGlassIOR", v)}
              />
              <SliderField
                label="Reflection"
                value={settings.sparkleGlassReflection}
                min={0}
                max={200}
                onChange={(v) => update("sparkleGlassReflection", v)}
              />
            </>
          )}
          <ColorField
            label="Color"
            color={settings.sparkleColor}
            opacity={100}
            onColorChange={(v) => update("sparkleColor", v)}
            onOpacityChange={() => {}}
            showPipette={false}
          />
          <SliderField
            label="Size"
            value={settings.sparkleSize}
            min={5}
            max={100}
            onChange={(v) => update("sparkleSize", v)}
          />
          <SliderField
            label="Pinch"
            value={settings.sparklePinch}
            min={5}
            max={45}
            onChange={(v) => update("sparklePinch", v)}
          />
          <SliderField
            label="Pulse"
            value={settings.sparklePulse}
            min={0}
            max={100}
            onChange={(v) => update("sparklePulse", v)}
          />
          <SliderField
            label="Pulse Speed"
            value={settings.sparklePulseSpeed}
            min={0}
            max={100}
            onChange={(v) => update("sparklePulseSpeed", v)}
          />
          <SliderField
            label="Spin (cutout)"
            value={settings.sparkleSpin}
            min={0}
            max={100}
            onChange={(v) => update("sparkleSpin", v)}
          />
          <SliderField
            label="Bevel"
            value={settings.sparkleBevel}
            min={0}
            max={45}
            onChange={(v) => update("sparkleBevel", v)}
          />
          <ToggleField size="compact"
            label="Sparkle Cutout"
            checked={settings.sparkleSubtract}
            onCheckedChange={(v) => update("sparkleSubtract", v)}
          />
          {!settings.sparkleGlass && (
            <>
          <SliderField
            label="Wave"
            value={settings.sparkleWave}
            min={0}
            max={100}
            onChange={(v) => update("sparkleWave", v)}
          />
          <SliderField
            label="Wave Speed"
            value={settings.sparkleWaveSpeed}
            min={0}
            max={100}
            onChange={(v) => update("sparkleWaveSpeed", v)}
          />
            </>
          )}
          <ToggleField size="compact"
            label="Billboard (flat only)"
            checked={settings.sparkleBillboard}
            onCheckedChange={(v) => update("sparkleBillboard", v)}
          />
        </Section>

        <Section {...sectionProps("Agent Layer")}>
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
            min={2}
            max={100}
            step={1}
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
            max={300}
            step={1}
            onChange={(v) => update("agentSignalCount", v)}
          />
          <SliderField
            label="Signal Speed"
            value={settings.agentSignalSpeed}
            min={0}
            max={200}
            onChange={(v) => update("agentSignalSpeed", v)}
          />
          <SliderField
            label="Signal Length"
            value={settings.agentSignalLength}
            min={10}
            max={100}
            onChange={(v) => update("agentSignalLength", v)}
          />
          <SliderField
            label="Signal Thickness"
            value={settings.agentSignalThickness}
            min={1}
            max={100}
            step={1}
            onChange={(v) => update("agentSignalThickness", v)}
          />
          <SliderField
            label="Decay Length"
            value={settings.agentDecayLength}
            min={1}
            max={100}
            onChange={(v) => update("agentDecayLength", v)}
          />
          <SliderField
            label="Node Refractory"
            value={settings.agentRefractory}
            min={0}
            max={100}
            onChange={(v) => update("agentRefractory", v)}
          />
          <SliderField
            label="Spawn Rate"
            value={settings.agentSpawnRate}
            min={0}
            max={100}
            onChange={(v) => update("agentSpawnRate", v)}
          />
          <SliderField
            label="Min Amplitude"
            value={settings.agentMinAmplitude}
            min={0}
            max={50}
            onChange={(v) => update("agentMinAmplitude", v)}
          />
          <ToggleField size="compact"
            label="Junction Split"
            checked={settings.agentJunctionSplit}
            onCheckedChange={(v) => update("agentJunctionSplit", v)}
          />
          <SliderField
            label="Arc Count"
            value={settings.agentArcCount}
            min={0}
            max={80}
            step={1}
            onChange={(v) => update("agentArcCount", v)}
          />
          <SliderField
            label="Arc Speed"
            value={settings.agentArcSpeed}
            min={0}
            max={100}
            onChange={(v) => update("agentArcSpeed", v)}
          />
          <SliderField
            label="Arc Ball Speed"
            value={settings.agentArcBallSpeed}
            min={0}
            max={300}
            onChange={(v) => update("agentArcBallSpeed", v)}
          />
          <SliderField
            label="Arc Ball Size"
            value={settings.agentArcBallSize}
            min={1}
            max={100}
            step={1}
            onChange={(v) => update("agentArcBallSize", v)}
          />
          <SliderField
            label="Arc Lift"
            value={settings.agentArcLift}
            min={0}
            max={100}
            onChange={(v) => update("agentArcLift", v)}
          />
          <SliderField
            label="Arc Thickness"
            value={settings.agentArcThickness}
            min={0}
            max={100}
            onChange={(v) => update("agentArcThickness", v)}
          />
          <SliderField
            label="Arc Dash Length"
            value={settings.agentArcDashLength}
            min={2}
            max={60}
            onChange={(v) => update("agentArcDashLength", v)}
          />
          <SliderField
            label="Arc Glow"
            value={settings.agentArcGlow}
            min={0}
            max={100}
            onChange={(v) => update("agentArcGlow", v)}
          />
          <ColorField
            label="Arc Color"
            color={settings.agentArcColor}
            opacity={100}
            onColorChange={(v) => update("agentArcColor", v)}
            onOpacityChange={() => {}}
            showPipette={false}
          />
        </Section>

        <Section {...sectionProps("Terrain Layer")}>
          <SliderField
            label="Grid Resolution"
            value={settings.terrainGridN}
            min={30}
            max={140}
            step={1}
            onChange={(v) => update("terrainGridN", v)}
          />
          <SliderField
            label="Dot Size"
            value={settings.terrainDotSize}
            min={2}
            max={100}
            onChange={(v) => update("terrainDotSize", v)}
          />
          <SliderField
            label="Height Scale"
            value={settings.terrainHeightScale}
            min={0}
            max={100}
            onChange={(v) => update("terrainHeightScale", v)}
          />
          <SliderField
            label="Opacity"
            value={settings.terrainOpacity}
            min={0}
            max={100}
            onChange={(v) => update("terrainOpacity", v)}
          />
          <ColorField
            label="Ramp Low"
            color={settings.terrainRampC0}
            opacity={100}
            onColorChange={(v) => update("terrainRampC0", v)}
            onOpacityChange={() => {}}
            showPipette={false}
          />
          <ColorField
            label="Ramp Mid-Low"
            color={settings.terrainRampC1}
            opacity={100}
            onColorChange={(v) => update("terrainRampC1", v)}
            onOpacityChange={() => {}}
            showPipette={false}
          />
          <ColorField
            label="Ramp Mid"
            color={settings.terrainRampC2}
            opacity={100}
            onColorChange={(v) => update("terrainRampC2", v)}
            onOpacityChange={() => {}}
            showPipette={false}
          />
          <ColorField
            label="Ramp Mid-High"
            color={settings.terrainRampC3}
            opacity={100}
            onColorChange={(v) => update("terrainRampC3", v)}
            onOpacityChange={() => {}}
            showPipette={false}
          />
          <ColorField
            label="Ramp High"
            color={settings.terrainRampC4}
            opacity={100}
            onColorChange={(v) => update("terrainRampC4", v)}
            onOpacityChange={() => {}}
            showPipette={false}
          />
          <ColorField
            label="Ramp Peak"
            color={settings.terrainRampC5}
            opacity={100}
            onColorChange={(v) => update("terrainRampC5", v)}
            onOpacityChange={() => {}}
            showPipette={false}
          />
        </Section>

        <Section {...sectionProps("Wires Between Layers")}>
          <ToggleField size="compact"
            label="Enabled"
            checked={settings.interlayerEnabled}
            onCheckedChange={(v) => update("interlayerEnabled", v)}
          />
          <SelectField
            label="Style"
            value={settings.interlayerStyle}
            onChange={(v) =>
              update("interlayerStyle", v as "strings" | "fan")
            }
            options={[
              { value: "strings", label: "Strings" },
              { value: "fan", label: "Hub Fan" },
            ]}
          />
          <SliderField
            label={settings.interlayerStyle === "fan" ? "Wires / Hub" : "Wires / Group"}
            value={settings.interlayerWiresPerHub}
            min={0}
            max={80}
            step={1}
            onChange={(v) => update("interlayerWiresPerHub", v)}
          />
          <SliderField
            label={settings.interlayerStyle === "fan" ? "Hubs / Side" : "Groups / Side"}
            value={settings.interlayerHubsPerSide}
            min={1}
            max={4}
            step={1}
            onChange={(v) => update("interlayerHubsPerSide", v)}
          />
          <SliderField
            label="Cascade"
            value={settings.interlayerCascade}
            min={0}
            max={100}
            onChange={(v) => update("interlayerCascade", v)}
          />
          {settings.interlayerStyle === "fan" && (
            <SliderField
              label="Waist Depth"
              value={settings.interlayerWaistDepth}
              min={0}
              max={100}
              onChange={(v) => update("interlayerWaistDepth", v)}
            />
          )}
          <SliderField
            label={settings.interlayerStyle === "fan" ? "Fan Radius" : "Wire Spread"}
            value={settings.interlayerFanRadius}
            min={0}
            max={100}
            onChange={(v) => update("interlayerFanRadius", v)}
          />
          <SliderField
            label="Tube Radius"
            value={settings.interlayerTubeRadius}
            min={1}
            max={40}
            onChange={(v) => update("interlayerTubeRadius", v)}
          />
          <SliderField
            label="Wire Opacity"
            value={settings.interlayerOpacity}
            min={0}
            max={100}
            onChange={(v) => update("interlayerOpacity", v)}
          />
          <SliderField
            label="Top Opacity Fade"
            value={settings.interlayerTopBlend}
            min={0}
            max={50}
            onChange={(v) => update("interlayerTopBlend", v)}
          />
          <SliderField
            label="Bottom Opacity Fade"
            value={settings.interlayerBottomBlend}
            min={0}
            max={50}
            onChange={(v) => update("interlayerBottomBlend", v)}
          />
          <ColorField
            label="Wire Color"
            color={settings.interlayerColor}
            opacity={settings.interlayerOpacity}
            onColorChange={(v) => update("interlayerColor", v)}
            onOpacityChange={(v) => update("interlayerOpacity", v)}
            showPipette={false}
          />
          <ToggleField size="compact"
            label="Use Palette"
            checked={settings.interlayerUsePalette}
            onCheckedChange={(v) => update("interlayerUsePalette", v)}
          />
          {settings.interlayerUsePalette && (
            <>
              <ColorField
                label="Palette Bottom"
                color={settings.interlayerPaletteBottom}
                opacity={100}
                onColorChange={(v) => update("interlayerPaletteBottom", v)}
                onOpacityChange={() => {}}
                showPipette={false}
              />
              <ColorField
                label="Palette Mid"
                color={settings.interlayerPaletteMid}
                opacity={100}
                onColorChange={(v) => update("interlayerPaletteMid", v)}
                onOpacityChange={() => {}}
                showPipette={false}
              />
              <ColorField
                label="Palette Top"
                color={settings.interlayerPaletteTop}
                opacity={100}
                onColorChange={(v) => update("interlayerPaletteTop", v)}
                onOpacityChange={() => {}}
                showPipette={false}
              />
            </>
          )}
          <SliderField
            label="Glow"
            value={settings.interlayerGlow}
            min={0}
            max={100}
            onChange={(v) => update("interlayerGlow", v)}
          />
          <SliderField
            label="Flow Speed"
            value={settings.interlayerFlowSpeed}
            min={0}
            max={100}
            onChange={(v) => update("interlayerFlowSpeed", v)}
          />
          <SliderField
            label="Balls / Layer Gap"
            value={settings.interlayerBeadCount}
            min={1}
            max={50}
            step={1}
            onChange={(v) => update("interlayerBeadCount", v)}
          />
          <SliderField
            label="Ball Size"
            value={settings.interlayerBeadWidth}
            min={2}
            max={80}
            onChange={(v) => update("interlayerBeadWidth", v)}
          />
          <SliderField
            label="Ball Opacity"
            value={settings.interlayerBallOpacity}
            min={0}
            max={100}
            onChange={(v) => update("interlayerBallOpacity", v)}
          />
          <ColorField
            label="Ball Color"
            color={settings.interlayerBallColor}
            opacity={settings.interlayerBallOpacity}
            onColorChange={(v) => update("interlayerBallColor", v)}
            onOpacityChange={(v) => update("interlayerBallOpacity", v)}
            showPipette={false}
          />
          <SliderField
            label="Bead Brightness"
            value={settings.interlayerBeadBrightness}
            min={0}
            max={300}
            onChange={(v) => update("interlayerBeadBrightness", v)}
          />
          {settings.interlayerStyle === "fan" && (
            <SliderField
              label="Cluster Size"
              value={settings.interlayerClusterSize}
              min={1}
              max={12}
              step={1}
              onChange={(v) => update("interlayerClusterSize", v)}
            />
          )}
          {settings.interlayerStyle === "fan" && (
            <SliderField
              label="Cap Size"
              value={settings.interlayerCapSize}
              min={0}
              max={100}
              onChange={(v) => update("interlayerCapSize", v)}
            />
          )}
          <SliderField
            label="Seed"
            value={settings.interlayerSeed}
            min={0}
            max={100}
            step={1}
            onChange={(v) => update("interlayerSeed", v)}
          />
        </Section>

        <Section {...sectionProps("Cloud Layer")}>
          <ColorField
            label="Color A"
            color={settings.cloudColorB}
            opacity={100}
            onColorChange={(v) => update("cloudColorB", v)}
            onOpacityChange={() => {}}
            showPipette={false}
          />
          <ColorField
            label="Color B"
            color={settings.cloudColorC}
            opacity={100}
            onColorChange={(v) => update("cloudColorC", v)}
            onOpacityChange={() => {}}
            showPipette={false}
          />
          <SliderField
            label="Dot Size"
            value={settings.cloudDotSize}
            min={0.25}
            max={100}
            step={0.25}
            onChange={(v) => update("cloudDotSize", v)}
          />
          <SliderField
            label="Density"
            value={settings.cloudDensity}
            min={16}
            max={200}
            step={1}
            onChange={(v) => update("cloudDensity", v)}
          />
          <SliderField
            label="Height"
            value={settings.cloudHeight}
            min={0}
            max={200}
            onChange={(v) => update("cloudHeight", v)}
          />
          <SliderField
            label="Escape Speed"
            value={settings.escapeSpeed}
            min={0}
            max={100}
            onChange={(v) => update("escapeSpeed", v)}
          />
          <SliderField
            label="Ceiling Jitter"
            value={settings.escapeJitter}
            min={0}
            max={100}
            onChange={(v) => update("escapeJitter", v)}
          />
        </Section>

        <Section {...sectionProps("Depth of Field")}>
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

        <Section {...sectionProps("Camera & Rotation")}>
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

        <Section {...sectionProps("Platforms Layer")}>
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

        <Section {...sectionProps("Box Layer")}>
          <ColorField
            label="Color"
            color={settings.foundationColor}
            opacity={100}
            onColorChange={(v) => update("foundationColor", v)}
            onOpacityChange={() => {}}
            showPipette={false}
          />
          <SliderField
            label="Boxes / Side"
            value={settings.foundationCount}
            min={1}
            max={28}
            step={1}
            onChange={(v) => update("foundationCount", v)}
          />
          <SliderField
            label="Box Gap"
            value={settings.foundationBoxGap}
            min={0}
            max={90}
            onChange={(v) => update("foundationBoxGap", v)}
          />
          <SliderField
            label="Block Size"
            value={settings.foundationBlockSize}
            min={10}
            max={120}
            onChange={(v) => update("foundationBlockSize", v)}
          />
          <SliderField
            label="Min Thickness"
            value={settings.foundationMinThickness}
            min={0}
            max={100}
            onChange={(v) => update("foundationMinThickness", v)}
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
          <SliderField
            label="Fill Opacity"
            value={settings.foundationFillOpacity}
            min={0}
            max={100}
            onChange={(v) => update("foundationFillOpacity", v)}
          />
          <SliderField
            label="Edge Opacity"
            value={settings.foundationEdgeOpacity}
            min={0}
            max={100}
            onChange={(v) => update("foundationEdgeOpacity", v)}
          />
        </Section>

        <Section {...sectionProps("Cursor Response")}>
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

        <Section {...sectionProps("Idle Sway")}>
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

        <Section {...sectionProps("Bloom & Vignette")}>
          <SliderField
            label="Bloom Intensity"
            value={settings.bloomIntensity}
            min={0}
            max={200}
            onChange={(v) => update("bloomIntensity", v)}
          />
        </Section>
        </GroupedSections>
      </ControlsPanel>
    </ToolShell>
  );
}
