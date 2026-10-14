"use client";

import { useEffect, useMemo, useState } from "react";
import * as THREE from "three";
import { loadVioletFont } from "./layer-name-label";
import type { PavilionDef } from "./defaults";

/** Shared procedural surface-imperfection texture used as a roughness map on
 * every pavilion slab. Smoothed grayscale noise so the roughness variation
 * reads as subtle optical-glass haze rather than visible pixel grit. */
function buildNoiseTexture(): THREE.CanvasTexture | null {
  if (typeof document === "undefined") return null;
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const image = ctx.createImageData(size, size);
  for (let i = 0; i < image.data.length; i += 4) {
    const v = Math.floor(96 + Math.random() * 160);
    image.data[i] = v;
    image.data[i + 1] = v;
    image.data[i + 2] = v;
    image.data[i + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
  // Soften — a two-pass blur hides the hard pixel grid.
  ctx.filter = "blur(1.6px)";
  ctx.drawImage(canvas, 0, 0);
  ctx.filter = "blur(0.8px)";
  ctx.drawImage(canvas, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2);
  tex.colorSpace = THREE.NoColorSpace;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

/** Derive a deep, saturated version of the slab color for the label text.
 * Lightness pinned low so the glyphs stay legible against the bright emissive
 * glass; saturation boosted so the text still reads as a tinted-glass etching
 * rather than flat black. */
function deepTint(color: string): string {
  const c = new THREE.Color(color);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  c.setHSL(hsl.h, Math.min(1, hsl.s + 0.25), 0.1);
  return `#${c.getHexString()}`;
}

/** Build a transparent-background canvas-texture label. Text is drawn in a
 * deep tinted color on a cleared canvas with a soft dark drop shadow so the
 * glyphs read as etched into the glass rather than painted on top. */
function useLabelTexture({
  text,
  fontFamily,
  fontWeight,
  fontSize,
  color,
}: {
  text: string;
  fontFamily: string;
  fontWeight: number;
  fontSize: number;
  color: string;
}) {
  const [label, setLabel] = useState<{
    texture: THREE.CanvasTexture;
    aspect: number;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    let texture: THREE.CanvasTexture | undefined;
    void loadVioletFont().catch(() => undefined).then(() => {
      if (cancelled) return;
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");
      if (!context) return;
      const upper = text.toUpperCase();
      const pixels = THREE.MathUtils.clamp(fontSize, 6, 96);
      context.font = `${fontWeight} ${pixels}px ${fontFamily}`;
      // Pad scales with font size and leaves room for the drop-shadow halo.
      const padX = Math.max(10, pixels * 0.5);
      const padY = Math.max(8, pixels * 0.3);
      const width = Math.ceil(context.measureText(upper).width + padX * 2);
      const height = Math.ceil(pixels * 1.2 + padY * 2);
      const resolution = 4;
      canvas.width = width * resolution;
      canvas.height = height * resolution;
      context.scale(resolution, resolution);
      context.clearRect(0, 0, width, height);
      context.font = `${fontWeight} ${pixels}px ${fontFamily}`;
      context.textAlign = "center";
      const metrics = context.measureText(upper);
      const baseline =
        height / 2 +
        (metrics.actualBoundingBoxAscent - metrics.actualBoundingBoxDescent) / 2;
      // Soft dark halo so the text reads against the bright emissive glass.
      // Two passes: a wide low-opacity blur, then a tighter inner shadow —
      // creates depth without a visible rectangular box.
      context.shadowColor = "rgba(0, 0, 0, 0.55)";
      context.shadowBlur = pixels * 0.3;
      context.fillStyle = "rgba(0,0,0,0)";
      context.fillText(upper, width / 2, baseline);
      // Actual glyph — crisp, no shadow.
      context.shadowColor = "transparent";
      context.shadowBlur = 0;
      context.fillStyle = color;
      context.fillText(upper, width / 2, baseline);
      texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.minFilter = THREE.LinearFilter;
      texture.generateMipmaps = false;
      setLabel({ texture, aspect: width / height });
    });
    return () => {
      cancelled = true;
      texture?.dispose();
    };
  }, [text, fontFamily, fontWeight, fontSize, color]);

  return label;
}

/** Billboarded sprite label — always faces the camera. Floating header above
 * each pavilion. */
function PavilionLabel({
  def,
  position,
  worldHeight,
}: {
  def: PavilionDef;
  position: [number, number, number];
  worldHeight: number;
}) {
  const resolvedTextColor =
    def.textColor && def.textColor.trim() ? def.textColor : deepTint(def.color);
  const label = useLabelTexture({
    text: def.label,
    fontFamily: def.fontFamily,
    fontWeight: def.fontWeight,
    fontSize: def.fontSize,
    color: resolvedTextColor,
  });
  if (!label) return null;
  return (
    <sprite
      position={position}
      scale={[worldHeight * label.aspect, worldHeight, 1]}
      renderOrder={1000}
      frustumCulled={false}
    >
      <spriteMaterial
        map={label.texture}
        transparent
        depthTest={false}
        depthWrite={false}
        toneMapped={false}
      />
    </sprite>
  );
}

/** Flat label plane flush against one vertical face of a pavilion slab. */
function PavilionFaceLabel({
  def,
  position,
  rotationY,
  worldHeight,
}: {
  def: PavilionDef;
  position: [number, number, number];
  rotationY: number;
  worldHeight: number;
}) {
  const resolvedTextColor =
    def.textColor && def.textColor.trim() ? def.textColor : deepTint(def.color);
  const label = useLabelTexture({
    text: def.label,
    fontFamily: def.fontFamily,
    fontWeight: def.fontWeight,
    fontSize: def.fontSize,
    color: resolvedTextColor,
  });
  if (!label) return null;
  const width = worldHeight * label.aspect;
  return (
    <mesh position={position} rotation={[0, rotationY, 0]} renderOrder={500}>
      <planeGeometry args={[width, worldHeight]} />
      <meshBasicMaterial
        map={label.texture}
        transparent
        depthTest
        depthWrite={false}
        toneMapped={false}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}

type SlabRect = {
  centerX: number;
  centerZ: number;
  width: number;
  depth: number;
};

/** Three capability pavilions arranged as a top-view 2+1 grid on the plaza:
 * back row holds two slabs, front row is a single wide slab. Front = +Z.
 *
 * Each slab is a translucent emissive glass block with brightly glowing
 * edges, labelled on all four vertical faces + a floating billboard tag. */
export function PavilionsLayer({
  layerY,
  planeSize,
  gutter,
  rowSplit,
  backSplit,
  height,
  labelGap,
  pavilions,
}: {
  layerY: number;
  planeSize: number;
  gutter: number;
  rowSplit: number;
  backSplit: number;
  height: number;
  labelGap: number;
  pavilions: readonly PavilionDef[];
}) {
  const slabHeight = planeSize * (height / 100);
  const labelPad = planeSize * (labelGap / 100);
  const noiseTexture = useMemo(() => buildNoiseTexture(), []);
  useEffect(() => () => noiseTexture?.dispose(), [noiseTexture]);

  const rects: SlabRect[] = useMemo(() => {
    const half = planeSize / 2;
    const g = planeSize * (gutter / 100);
    const usableDepth = Math.max(0, planeSize - g);
    const backDepth = usableDepth * (rowSplit / 100);
    const frontDepth = usableDepth - backDepth;
    const usableBackWidth = Math.max(0, planeSize - g);
    const backLeftWidth = usableBackWidth * (backSplit / 100);
    const backRightWidth = usableBackWidth - backLeftWidth;
    const backCenterZ = -half + backDepth / 2;
    const frontCenterZ = half - frontDepth / 2;
    return [
      {
        centerX: -half + backLeftWidth / 2,
        centerZ: backCenterZ,
        width: backLeftWidth,
        depth: backDepth,
      },
      {
        centerX: half - backRightWidth / 2,
        centerZ: backCenterZ,
        width: backRightWidth,
        depth: backDepth,
      },
      {
        centerX: 0,
        centerZ: frontCenterZ,
        width: planeSize,
        depth: frontDepth,
      },
    ];
  }, [planeSize, gutter, rowSplit, backSplit]);

  const slabGeos = useMemo(
    () =>
      rects.map((r) => {
        const box = new THREE.BoxGeometry(r.width, slabHeight, r.depth);
        const edges = new THREE.EdgesGeometry(box);
        // Inner "circuitry" box — ~70% of the outer slab, edges extracted so
        // we render just the wireframe. Visible through the transmissive
        // glass as embedded structural detail.
        const innerBox = new THREE.BoxGeometry(
          r.width * 0.7,
          slabHeight * 0.7,
          r.depth * 0.7,
        );
        const innerEdges = new THREE.EdgesGeometry(innerBox);
        innerBox.dispose();
        return { box, edges, innerEdges };
      }),
    [rects, slabHeight],
  );
  useEffect(
    () => () => {
      for (const g of slabGeos) {
        g.box.dispose();
        g.edges.dispose();
        g.innerEdges.dispose();
      }
    },
    [slabGeos],
  );

  return (
    <group position={[0, layerY, 0]}>
      {pavilions.map((def, i) => {
        const r = rects[i];
        if (!r || r.width <= 0 || r.depth <= 0) return null;
        const geos = slabGeos[i];
        const faceLabelHeight =
          Math.min(r.width, r.depth, slabHeight) * (def.fontSize / 100);
        const floatLabelHeight = faceLabelHeight * 0.75;
        const nudge = 0.012;
        // Map per-slab sliders to material coefficients. Values are tuned so
        // the body stays glassy and the EDGES carry the neon via HDR colors
        // picked up by Bloom — not the whole slab glowing like a bulb.
        //   glow       → mild interior emissive (0.05..0.55) + edge HDR mult
        //   reflection → clearcoat + env map intensity
        //   noise      → roughness + roughnessMap mix
        const glowFrac = THREE.MathUtils.clamp(def.glow / 100, 0, 1);
        const reflFrac = THREE.MathUtils.clamp(def.reflection / 100, 0, 1);
        const noiseFrac = THREE.MathUtils.clamp(def.noise / 100, 0, 1);
        const emissiveIntensity = 0.05 + glowFrac * 0.5;
        const clearcoat = 0.3 + reflFrac * 0.7;
        const clearcoatRoughness = 0.3 - reflFrac * 0.28;
        const envMapIntensity = 0.4 + reflFrac * 1.6;
        const roughness = 0.08 + noiseFrac * 0.52;
        // Mild HDR lift on edges so Bloom still catches them without
        // over-driving the channels past 1.0 (which clips to white and kills
        // the tint). Keep the multiplier modest; bloom amplifies anyway.
        const edgeColor = new THREE.Color(def.color).multiplyScalar(
          0.9 + glowFrac * 0.6,
        );
        // Inner circuitry color — electric-cyan accent for every slab,
        // slightly tinted by the slab's own hue so the three stay distinct.
        const circuitColor = new THREE.Color("#42dfff")
          .lerp(new THREE.Color(def.color), 0.25)
          .multiplyScalar(1.8 + glowFrac * 1.6);
        return (
          <group key={def.id}>
            <mesh
              position={[r.centerX, slabHeight / 2, r.centerZ]}
              geometry={geos.box}
            >
              <meshPhysicalMaterial
                color={def.color}
                emissive={def.color}
                emissiveIntensity={emissiveIntensity}
                roughness={roughness}
                roughnessMap={noiseFrac > 0 ? noiseTexture : null}
                metalness={0}
                transmission={0.85}
                thickness={Math.min(r.width, r.depth, slabHeight) * 0.8}
                ior={1.4}
                attenuationColor={def.color}
                attenuationDistance={1.5}
                clearcoat={clearcoat}
                clearcoatRoughness={clearcoatRoughness}
                envMapIntensity={envMapIntensity}
                transparent
                opacity={0.9}
              />
            </mesh>
            <lineSegments
              position={[r.centerX, slabHeight / 2, r.centerZ]}
              geometry={geos.edges}
              renderOrder={450}
            >
              <lineBasicMaterial
                color={edgeColor}
                transparent
                opacity={0.95}
                toneMapped={false}
                depthWrite={false}
              />
            </lineSegments>
            {/* Inner circuitry wireframe — visible through the glass as
             * embedded structural detail. Rendered behind the outer edges. */}
            <lineSegments
              position={[r.centerX, slabHeight / 2, r.centerZ]}
              geometry={geos.innerEdges}
              renderOrder={420}
            >
              <lineBasicMaterial
                color={circuitColor}
                transparent
                opacity={0.75}
                toneMapped={false}
                depthWrite={false}
              />
            </lineSegments>
            <PavilionFaceLabel
              def={def}
              position={[r.centerX, slabHeight / 2, r.centerZ + r.depth / 2 + nudge]}
              rotationY={0}
              worldHeight={faceLabelHeight}
            />
            <PavilionFaceLabel
              def={def}
              position={[r.centerX, slabHeight / 2, r.centerZ - r.depth / 2 - nudge]}
              rotationY={Math.PI}
              worldHeight={faceLabelHeight}
            />
            <PavilionFaceLabel
              def={def}
              position={[r.centerX + r.width / 2 + nudge, slabHeight / 2, r.centerZ]}
              rotationY={Math.PI / 2}
              worldHeight={faceLabelHeight}
            />
            <PavilionFaceLabel
              def={def}
              position={[r.centerX - r.width / 2 - nudge, slabHeight / 2, r.centerZ]}
              rotationY={-Math.PI / 2}
              worldHeight={faceLabelHeight}
            />
          </group>
        );
      })}
    </group>
  );
}
