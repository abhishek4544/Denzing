"use client";
/* eslint-disable react-hooks/immutability -- Three.js sprite transforms update each frame. */

import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

/** Screen-facing pill anchored to a world position, drawn inside WebGL so
 *  the exported video/PNG contain the same layer labels. */
export function LayerNameLabel({
  name,
  worldPosition,
  fontSize = 14,
  scale: onScreenScale = 1,
}: {
  name: string;
  worldPosition: [number, number, number];
  fontSize?: number;
  /** On-screen size multiplier applied to the rendered pill (default 1×). */
  scale?: number;
}) {
  const sprite = useRef<THREE.Sprite>(null);
  const label = useMemo(() => {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) return null;
    const text = name.toUpperCase();
    const pixels = THREE.MathUtils.clamp(fontSize, 7, 40);
    const fontStack =
      '800 ' +
      pixels +
      'px ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif';
    context.font = fontStack;
    const paddingX = Math.round(pixels * 0.75);
    const paddingY = Math.round(pixels * 0.45);
    const width = Math.ceil(context.measureText(text).width + paddingX * 2);
    const height = Math.ceil(pixels * 1.1 + paddingY * 2);
    // Backing-store resolution follows on-screen size × device pixel ratio so
    // the sprite renders ~1:1 with device pixels even when Label Scale is
    // cranked up. Capped so extreme scales don't allocate huge textures.
    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    const resolution = Math.min(
      24,
      Math.max(6, Math.ceil(onScreenScale * dpr * 1.5)),
    );
    canvas.width = Math.round(width * resolution);
    canvas.height = Math.round(height * resolution);
    context.scale(resolution, resolution);
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.font = fontStack;
    context.fillStyle = "#111111";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(text, width / 2, height / 2);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    // Pure linear filtering with a device-pixel-sized backing store keeps text
    // crisp; mipmaps only soften the result at these sizes.
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    return { texture, width, height };
  }, [name, fontSize, onScreenScale]);

  useEffect(() => () => label?.texture.dispose(), [label]);

  const scratch = useMemo(
    () => ({
      point: new THREE.Vector3(),
      anchor: new THREE.Vector3(),
      pixel: new THREE.Vector3(),
    }),
    [],
  );

  useFrame(({ camera, size }) => {
    const tag = sprite.current;
    if (!tag || !label || size.width === 0 || size.height === 0) return;
    const { point, anchor, pixel } = scratch;
    const labelWidth = label.width * onScreenScale;
    const labelHeight = label.height * onScreenScale;
    point.set(worldPosition[0], worldPosition[1], worldPosition[2]).project(camera);
    anchor.copy(point);
    tag.visible = anchor.z >= -1 && anchor.z <= 1;
    // Keep the pill inside the canvas even at extreme zoom.
    anchor.x = THREE.MathUtils.clamp(
      anchor.x,
      -1 + labelWidth / size.width,
      1 - labelWidth / size.width,
    );
    anchor.y = THREE.MathUtils.clamp(
      anchor.y,
      -1 + labelHeight / size.height,
      1 - labelHeight / size.height,
    );
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
      <spriteMaterial
        map={label.texture}
        transparent
        depthTest={false}
        depthWrite={false}
        toneMapped={false}
      />
    </sprite>
  ) : null;
}
