import type { SecurityGridSettings } from "./defaults";
import type { ExportCamera } from "./export-options";

/** Settings stay in the browser; only the public, allowlisted renderer template is fetched. */
export async function exportSecurityGridCode(
  settings: SecurityGridSettings,
  camera: ExportCamera,
  signal: AbortSignal,
) {
  const response = await fetch("/exports/security-grid-template.json", { signal, cache: "no-cache" });
  if (!response.ok)
    throw new Error("The website code template is unavailable. Restart the dev server or rebuild the app.");
  const template = (await response.json()) as { version: number; files: Record<string, string> };
  if (template.version !== 1 || !template.files)
    throw new Error("The website code template is invalid. Please rebuild the app.");
  const { zipSync, strToU8 } = await import("fflate");
  signal.throwIfAborted();
  const files: Record<string, Uint8Array> = {};
  const prefix = "security-grid-3d-website/";
  for (const [name, content] of Object.entries(template.files)) {
    if (name.startsWith("/") || name.split("/").includes(".."))
      throw new Error("Invalid template filename.");
    files[prefix + name] = strToU8(content);
  }
  files[prefix + "src/settings.json"] = strToU8(JSON.stringify(settings, null, 2));
  files[prefix + "src/camera.json"] = strToU8(JSON.stringify(camera, null, 2));
  const archive = zipSync(files, { level: 6 });
  signal.throwIfAborted();
  return new Blob([new Uint8Array(archive)], { type: "application/zip" });
}
