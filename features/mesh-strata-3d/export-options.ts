import { canvasAspectValue, type CanvasAspect } from "./defaults";

export function videoDimensions(resolution: { width: number; height: number }, aspect?: CanvasAspect, customWidth?: number, customHeight?: number, viewport?: { width: number; height: number }) {
  const ratio = canvasAspectValue(aspect, customWidth, customHeight) ?? (viewport && viewport.height > 0 ? viewport.width / viewport.height : undefined);
  if (!ratio) return { width: resolution.width, height: resolution.height };
  // Preserve the resolution preset's long edge; even dimensions support H.264.
  const edge = Math.max(resolution.width, resolution.height);
  return ratio >= 1 ? { width: edge, height: Math.round(edge / ratio / 2) * 2 }
    : { width: Math.round(edge * ratio / 2) * 2, height: edge };
}

export const videoResolutions = [
  { value: "1080p", label: "1080p · 1920 × 1080", width: 1920, height: 1080 },
  { value: "1440p", label: "1440p · 2560 × 1440", width: 2560, height: 1440 },
  { value: "2k", label: "2K · 2048 × 1080", width: 2048, height: 1080 },
  { value: "4k", label: "4K · 3840 × 2160", width: 3840, height: 2160 },
] as const;
export type VideoExportOptions = {
  resolution: typeof videoResolutions[number]["value"];
  fps: 24 | 30 | 60;
  duration: number;
  quality: "standard" | "high" | "maximum";
};
export type ExportCamera = { position: [number, number, number]; target: [number, number, number]; viewport?: { width: number; height: number } };
