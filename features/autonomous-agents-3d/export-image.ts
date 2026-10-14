import type * as THREE from "three";
import type { StrataSettings } from "./defaults";
import { drawCalloutsOnCanvas } from "./callout-draw";

/** Export the current viewer as a PNG. If settings + camera are supplied,
 * the callout overlay (badges + connector lines) is composited on top of
 * the WebGL frame so the download matches what is on screen. */
export function exportStrataScene(
  canvas: HTMLCanvasElement,
  settings?: StrataSettings,
  camera?: THREE.Camera,
) {
  let source: HTMLCanvasElement = canvas;
  if (settings && camera && settings.showCallouts) {
    const composite = document.createElement("canvas");
    composite.width = canvas.width;
    composite.height = canvas.height;
    const ctx = composite.getContext("2d");
    if (ctx) {
      ctx.drawImage(canvas, 0, 0);
      drawCalloutsOnCanvas(ctx, composite.width, composite.height, settings, camera);
      source = composite;
    }
  }
  const url = source.toDataURL("image/png");
  const link = document.createElement("a");
  link.href = url;
  link.download = "autonomous-agents-3d.png";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
