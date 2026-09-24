"use client";

import { useEffect, useRef, useState } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { SelectField, SliderField } from "@/components/tool-shell";
import type { StrataSettings } from "./defaults";
import { videoDimensions, videoResolutions, type ExportCamera, type VideoExportOptions } from "./export-options";

function download(url: string, filename: string) {
  const link = document.createElement("a");
  link.href = url; link.download = filename;
  document.body.appendChild(link); link.click(); link.remove();
}

export default function ExportDialog({ settings, camera, onClose, onPng }: {
  settings: StrataSettings; camera: ExportCamera; onClose: () => void; onPng: () => void;
}) {
  const [format, setFormat] = useState<"webm" | "mp4" | "png" | "code">("webm");
  const [options, setOptions] = useState<VideoExportOptions>({ resolution: "1080p", fps: 30, duration: 10, quality: "high" });
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<{ url: string; name: string; key: string } | null>(null);
  const exportKey = JSON.stringify({ format, options });
  const isVideo = format === "webm" || format === "mp4";
  const controller = useRef<AbortController | null>(null);
  const resultUrl = useRef<string | null>(null);
  useEffect(() => () => {
    controller.current?.abort();
    if (resultUrl.current) URL.revokeObjectURL(resultUrl.current);
  }, []);
  const start = async () => {
    if (controller.current) return;
    if (format === "png") { onPng(); return; }
    const job = new AbortController(); controller.current = job;
    setBusy(true); setProgress(0); setMessage(""); setResult(null);
    if (resultUrl.current) { URL.revokeObjectURL(resultUrl.current); resultUrl.current = null; }
    try {
      let blob: Blob;
      if (format === "code") {
        const { exportStrataCode } = await import("./export-code");
        blob = await exportStrataCode(settings, camera, job.signal);
      } else {
        // Encoder code is loaded only on export; website embeds never import it.
        const { exportStrataVideo } = await import("./export-video");
        job.signal.throwIfAborted();
        blob = await exportStrataVideo(settings, camera, options, format, job.signal, setProgress);
      }
      job.signal.throwIfAborted();
      const url = URL.createObjectURL(blob);
      resultUrl.current = url;
      const name = format === "code" ? "mesh-strata-website.zip" : `mesh-strata-${options.resolution}-${options.fps}fps.${format}`;
      setResult({ url, name, key: exportKey });
      setMessage(format === "code" ? "Ready · Website code ZIP with your current settings" : `Ready · ${format.toUpperCase()} · ${options.resolution.toUpperCase()} · ${options.fps} FPS · ${options.duration}s`);
      download(url, name);
    } catch (error) {
      setMessage(job.signal.aborted ? "Export cancelled." : error instanceof Error ? error.message : "Export failed. Please try again.");
    } finally { setBusy(false); controller.current = null; }
  };
  return <Dialog.Root open onOpenChange={(open) => { if (!open) { controller.current?.abort(); onClose(); } }}>
    <Dialog.Portal>
      <Dialog.Backdrop className="fixed inset-0 z-40 bg-black/20" />
      <Dialog.Popup className="fixed left-1/2 top-1/2 z-50 w-[360px] max-w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 rounded-[10px] border border-border bg-card p-4 text-foreground">
        <div className="mb-4 flex items-center justify-between">
          <Dialog.Title className="text-[12px] font-medium">Export Mesh Strata</Dialog.Title>
          <Dialog.Close className="rounded-[7px] px-2 py-1 text-[10px] hover:bg-muted">Close</Dialog.Close>
        </div>
        <Dialog.Description className="mb-4 text-[10px] text-muted-foreground">
          {isVideo ? `Render your current view as ${format === "mp4" ? "MP4" : "WebM"} video. High-resolution exports may take longer than the clip duration.` : format === "code" ? "Download a runnable React website with your current settings, camera view, renderer, fonts, and setup guide." : "Download a PNG of the current canvas."}
        </Dialog.Description>
        <fieldset disabled={busy} inert={busy} className="space-y-2 disabled:opacity-60">
          <SelectField label="Format" value={format} onChange={(value) => { setFormat(value); setMessage(""); }} options={[{value:"webm",label:"WebM video"},{value:"mp4",label:"MP4 video"},{value:"png",label:"PNG image"},{value:"code",label:"Website code (ZIP)"}]} />
          {isVideo && <>
            <SelectField label="Resolution" value={options.resolution} options={videoResolutions.map((preset) => {
              const { width, height } = videoDimensions(preset, settings.canvasAspect, settings.canvasAspectWidth, settings.canvasAspectHeight, camera.viewport);
              return { value: preset.value, label: `${preset.value.toUpperCase()} · ${width} × ${height}` };
            })}
              onChange={(resolution) => setOptions((value) => ({...value, resolution}))} />
            <SelectField label="FPS" value={String(options.fps)} options={[{value:"24",label:"24 FPS"},{value:"30",label:"30 FPS"},{value:"60",label:"60 FPS"}]}
              onChange={(fps) => setOptions((value) => ({...value, fps: Number(fps) as VideoExportOptions["fps"]}))} />
            <SelectField label="Quality" value={options.quality} options={[{value:"standard",label:"Standard"},{value:"high",label:"High"},{value:"maximum",label:"Maximum"}]}
              onChange={(quality) => setOptions((value) => ({...value, quality}))} />
            <SliderField label="Duration (seconds)" value={options.duration} min={1} max={30}
              onChange={(duration) => setOptions((value) => ({...value, duration}))} />
          </>}
        </fieldset>
        {busy && <div className="mt-4">
          <progress aria-label="Export progress" value={progress} max={1} className="h-2 w-full accent-foreground" />
          <p className="mt-1 text-[10px] text-muted-foreground">{format === "code" ? "Preparing code package…" : progress === 0 ? "Preparing renderer…" : progress >= 0.95 ? "Finishing video…" : `Rendering · ${Math.round(progress * 100)}%`}</p>
        </div>}
        <p role="status" aria-live="polite" className="mt-3 text-[10px] text-muted-foreground">{!result || result.key === exportKey ? message : ""}</p>
        <div className="mt-4 flex gap-2">
          <button type="button" disabled={busy} onClick={() => void start()}
            className="h-[28px] flex-1 rounded-[7px] bg-foreground text-[10px] font-medium text-background disabled:opacity-50">
            {isVideo ? `Export ${format === "mp4" ? "MP4" : "WebM"}` : format === "code" ? "Download code ZIP" : "Download PNG"}
          </button>
          {busy && <button type="button" onClick={() => controller.current?.abort()} className="h-[28px] rounded-[7px] bg-muted px-3 text-[10px]">Cancel export</button>}
          {result && exportKey === result.key && !busy && <button type="button" onClick={() => download(result.url, result.name)} className="h-[28px] rounded-[7px] bg-muted px-3 text-[10px]">Download again</button>}
        </div>
      </Dialog.Popup>
    </Dialog.Portal>
  </Dialog.Root>;
}
