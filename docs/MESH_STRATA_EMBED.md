# Embedding Mesh Strata

Use the renderer entry point, not `mesh-strata-3d-tool.tsx`. The editor includes hundreds of controls, preset import/export, and the tool shell; the embed has none of those dependencies.

## React

```tsx
import { MeshStrataEmbed } from "./features/mesh-strata-3d/embed";

export function Hero() {
  return <MeshStrataEmbed style={{ height: 600 }} />;
}
```

The parent must have a nonzero height. The embed uses the saved Final preset by default. Pass a complete `StrataSettings` object through `settings` for another preset, or merge overrides with `defaultStrataSettings`.

Props:

- `maxDpr`: defaults to 1.5, capped by the device's pixel ratio. Use 1 for low-power devices or 2 for higher sharpness. Geometry, colors, and animation counts stay unchanged.
- `interactive`: defaults to false so wheel and touch scrolling continue through a website illustration. Auto rotation still runs. Set true for the editor-style orbit/zoom gestures.
- `preserveDrawingBuffer`: defaults to false. Enable only for a synchronous canvas screenshot integration; the editor enables it for its PNG export.
- `style`: wrapper size and styling.
- `initialCamera`: optional position and target tuples to start from a saved point of view.

## Download website code

Open **Export as → Website code (ZIP)**. The ZIP includes a runnable React/Vite website, the optimized renderer, your current settings and camera view, Violet Sans with its license, and a README with setup and integration instructions. Extract it, run `npm install`, then `npm run dev`; use `npm run build` for deployment. Node.js 20.19+ or 22.12+ is required by Vite. No editor or video encoder is included in the website bundle.

The template is generated from an explicit renderer-file allowlist by `npm run export:template`, automatically before development and production builds. If renderer files change while the development server is running, rerun that command to refresh code downloads. Settings and camera data are added locally in the browser; they are not uploaded. Optional glass environment presets may load an external HDR, as documented in the downloaded README.

Verified an actual downloaded ZIP with a modified layer name: installed dependencies, passed its standalone TypeScript/production build, and visually checked the built website with no browser errors.

Copy these files when extracting into another React project:

- `embed.tsx`, `viewer.tsx`, `scene.tsx`, `defaults.ts`
- `foundation-batch.tsx`, `layer-name-label.tsx`, `renderer-diagnostics.tsx`
- `public/fonts/VioletSans-Regular.woff2` and `VioletSans-OFL.txt`

Runtime packages are `react`, `react-dom`, `three`, `@react-three/fiber`, `@react-three/drei`, and `@react-three/postprocessing`. Use the versions in this repository's package manifest/lockfile; TypeScript projects also need `@types/three`. The renderer has no Next.js-specific imports or Tailwind requirement. The Violet Sans URL assumes the font is served at `/fonts/VioletSans-Regular.woff2`; adjust it if hosting under another asset path. Non-Next bundlers must replace `process.env.NODE_ENV` with their environment value.

## Iframe

The standalone route is `/embed/mesh-strata-3d`:

```html
<iframe
  src="https://YOUR_HOST/embed/mesh-strata-3d"
  title="Mesh Strata"
  loading="lazy"
  width="100%"
  height="600"
  style="border: 0"
></iframe>
```

## Optimizations and measurement

- Box fill/edges are batched into two draws per layer, instead of two per box. Box bobbing and cursor displacement run in the vertex shader with the same positions and height factors used by the connector anchors.
- Arc vertex buffers update only when an arc changes, instead of recalculating and uploading 96 samples per arc every frame. Arc resources are disposed when removed.
- The WebGL module loads when the embed comes within 200px of the viewport. Once loaded, rendering stops when offscreen or when the document is hidden, and resumes without resetting animation time.
- Website embeds do not preserve the drawing buffer. They cap DPR at 1.5, which uses 43.75% fewer framebuffer pixels than DPR 2 at the same CSS size on a high-DPI device. The editor retains a maximum DPR of 2 and PNG export support.
- No mesh density or particle count reduction is applied automatically.

Measured with the Final preset in the local development browser at DPR 2: total draw calls across all rendering passes fell from **2,447 to 509 per frame (79.2%)**. Triangle counts stayed at **2,897,051 per frame across passes**. This is a draw-call reduction, not a claim of the same percentage FPS improvement. Glass/refraction and postprocessing still render multiple passes; this remains a WebGL illustration, not a tiny CSS asset. Test on target phones and laptops before choosing the embedding resolution.

For development diagnostics, append `?strataStats` to either scene route. The console reports draw calls, triangles, FPS, GPU resource counts, and DPR every 120 frames. Diagnostics are disabled in production. Use the same preset, canvas dimensions, DPR, browser, and hardware for comparisons; exclude startup and resume samples from FPS comparisons.

Validation: visually checked the editor and standalone canvas, verified deferred canvas creation and offscreen pause/resume, and checked for WebGL errors. Run `npm run check` for lint, TypeScript, and the production build.

## Video export from the editor

**Camera → Aspect Ratio** sets the preview to Auto, 16:9, 9:16, 1:1, 4:3, 3:4, 4:5, or 21:9. Fixed ratios fit inside the available stage and are saved with presets and website code. PNG captures that canvas. Video uses the selected ratio with the resolution preset's long edge (for example, portrait 1080p is 1080×1920); dimensions are rounded to even pixels for encoder compatibility and displayed in the resolution menu. Auto preserves the current preview aspect ratio when exported, using the resolution preset’s long edge. Exported labels scale proportionally with the captured preview height. Website code also retains this framing and label scale. Reframe with orbit/zoom after choosing a narrower canvas if needed.

Open **Export as**, choose **WebM video** or **MP4 video**, then select:

- 1080p: 1920×1080
- 1440p: 2560×1440
- 2K (DCI): 2048×1080
- 4K (UHD): 3840×2160
- 24, 30, or 60 FPS; 1–30 seconds; Standard, High, or Maximum compression quality.

Export uses a separate renderer at the requested resolution and the current camera position. Frames advance at exactly `1 / FPS` seconds and are encoded with WebCodecs through [Mediabunny](https://mediabunny.dev/guide/writing-media-files). WebM prefers VP9 and falls back to VP8; MP4 uses H.264 with fast-start metadata. A slow device can take longer than the video duration without skipping animation frames. This exports an animation from its starting phase, not a recording of elapsed editor time. The clip has no audio. The preview pauses while the export dialog is open. Cancel releases the temporary renderer/encoder and does not download a partial file.

The encoder is dynamically loaded only when the user starts a video export; it is not imported by the website viewer. The existing PNG option saves the current preview at its current canvas size.

Verified downloaded WebM and H.264 MP4 test files with ffprobe: 1080p/30 FPS produced 30 frames in 1 second; 4K/60 FPS produced 60 frames in 1 second. The WebM test also checked that all 60 decoded frames were distinct. Encoding support at higher resolutions depends on the browser/device; unsupported configurations show an error instead of silently reducing resolution or FPS.
