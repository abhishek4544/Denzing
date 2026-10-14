"use client";
/* eslint-disable react-hooks/immutability -- Three.js sprite transforms are updated each frame. */

import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

let violetFont: Promise<FontFace> | undefined;
export function loadVioletFont() {
  violetFont ??= new FontFace("Violet Sans", "url(/fonts/VioletSans-Regular.woff2)").load().then((font) => {
    document.fonts.add(font);
    return font;
  }).catch((error) => { violetFont = undefined; throw error; });
  return violetFont;
}

/** A screen-facing tag anchored to the layer's rightmost projected edge.
 * Rendered inside WebGL so image exports include the same labels. */
export function LayerNameLabel({ name, layerY, planeSize, fontSize, referenceHeight }:  {
  referenceHeight?: number;
  name: string;
  fontSize: number;
  layerY: number;
  planeSize: number;
}) {
  const sprite = useRef<THREE.Sprite>(null);
  const [label, setLabel] = useState<{ texture: THREE.CanvasTexture; width: number; height: number } | null>(null);
  const scratch = useMemo(() => ({ point: new THREE.Vector3(), anchor: new THREE.Vector3(), pixel: new THREE.Vector3() }), []);

  useEffect(() => {
    let cancelled = false;
    let texture: THREE.CanvasTexture | undefined;
    // Keep labels available with a fallback if the font request fails.
    void loadVioletFont().catch(() => undefined).then(() => {
      if (cancelled) return;
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");
      if (!context) return;
      const text = name.toUpperCase();
      const pixels = THREE.MathUtils.clamp(fontSize, 7, 32);
      context.font = `400 ${pixels}px "Violet Sans"`;
      const width = Math.ceil(context.measureText(text).width + 12);
      const height = pixels * 0.85 + 8; // Original line-height ratio and padding.
      const resolution = 4;
      canvas.width = width * resolution;
      canvas.height = Math.ceil(height * resolution);
      context.scale(resolution, resolution);
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, width, height);
      context.font = `400 ${pixels}px "Violet Sans"`;
      context.fillStyle = "#2B2B2B";
      context.textAlign = "center";
      const metrics = context.measureText(text);
      const baseline = height / 2 + (metrics.actualBoundingBoxAscent - metrics.actualBoundingBoxDescent) / 2;
      context.fillText(text, width / 2, baseline);
      texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.minFilter = THREE.LinearFilter;
      texture.generateMipmaps = false;
      setLabel({ texture, width, height });
    });
    return () => { cancelled = true; texture?.dispose(); };
  }, [name, fontSize]);

  useFrame(({ camera, size }) => {
    const tag = sprite.current;
    if (!tag || !label || size.width === 0 || size.height === 0) return;
    const { point, anchor, pixel } = scratch;
    const scale = referenceHeight && referenceHeight > 0 ? size.height / referenceHeight : 1;
    const labelWidth = label.width * scale, labelHeight = label.height * scale;
    const half = planeSize / 2;
    let right = -Infinity;
    for (const x of [-half, half]) {
      for (const z of [-half, half]) {
        point.set(x, layerY, z).project(camera);
        if (point.x > right) { right = point.x; anchor.copy(point); }
      }
    }
    tag.visible = anchor.z >= -1 && anchor.z <= 1;
    // Keep tags inside the canvas when the user zooms close to an edge.
    anchor.x = THREE.MathUtils.clamp(anchor.x + 16 * scale / size.width,
      -1 + 16 * scale / size.width, 1 - (labelWidth + 8 * scale) * 2 / size.width);
    anchor.y = THREE.MathUtils.clamp(anchor.y,
      -1 + (labelHeight + 8 * scale) / size.height, 1 - (labelHeight + 8 * scale) / size.height);
    pixel.copy(anchor);
    pixel.x += 2 / size.width;
    pixel.unproject(camera);
    anchor.unproject(camera);
    const worldPerPixel = pixel.distanceTo(anchor);
    tag.position.copy(anchor);
    tag.scale.set(labelWidth * worldPerPixel, labelHeight * worldPerPixel, 1);
  });

  return label ? (
    <sprite ref={sprite} center={[0, 0.5]} renderOrder={1000} frustumCulled={false}>
      <spriteMaterial map={label.texture} transparent depthTest={false} depthWrite={false} toneMapped={false} />
    </sprite>
  ) : null;
}
