"use client";

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import type { LayerUniforms } from "./scene";

/** Bake static box transforms once; animate every box in the vertex shader.
 * All boxes share one color, so transparent fragments use the same blend color. */
export function FoundationBatch({ positions, heightFactors, width, maxHeight,
  layerY, layerIndex, size, bob, color, fillOpacity, edgeOpacity, sharedUniforms }: {
  positions: [number, number, number][];
  heightFactors?: number[];
  width: number;
  maxHeight: number;
  layerY: number;
  layerIndex: number;
  size: number;
  bob: number;
  color: string;
  fillOpacity: number;
  edgeOpacity: number;
  sharedUniforms: LayerUniforms;
}) {
  const geometries = useMemo(() => {
    const box = new THREE.BoxGeometry(1, 1, 1);
    const faces = box.toNonIndexed();
    const edges = new THREE.EdgesGeometry(box);
    const build = (source: THREE.BufferGeometry) => {
      const vertices = source.getAttribute("position");
      const xyz = new Float32Array(positions.length * vertices.count * 3);
      const anchors = new Float32Array(positions.length * vertices.count * 4);
      positions.forEach(([x, y, z], i) => {
        const height = Math.max(0.02, maxHeight * (heightFactors?.[i] ?? 0.5));
        for (let v = 0; v < vertices.count; v++) {
          const index = i * vertices.count + v;
          xyz.set([x + vertices.getX(v) * width,
            y + (vertices.getY(v) + 0.5) * height,
            z + vertices.getZ(v) * width], index * 3);
          anchors.set([x, y, z, i * 0.73 + layerIndex * 1.31], index * 4);
        }
      });
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.BufferAttribute(xyz, 3));
      geometry.setAttribute("aFoundationAnchor", new THREE.BufferAttribute(anchors, 4));
      return geometry;
    };
    const result = { faces: build(faces), edges: build(edges) };
    box.dispose(); faces.dispose(); edges.dispose();
    return result;
  }, [positions, heightFactors, width, maxHeight, layerIndex]);
  useEffect(() => () => {
    geometries.faces.dispose(); geometries.edges.dispose();
  }, [geometries]);

  const materials = useMemo(() => {
    const fill = new THREE.MeshBasicMaterial({ color, transparent: true,
      opacity: fillOpacity, depthWrite: false, toneMapped: false });
    const edge = new THREE.LineBasicMaterial({ color, transparent: true,
      opacity: edgeOpacity, depthWrite: false, toneMapped: false });
    for (const material of [fill, edge]) {
      material.onBeforeCompile = (shader) => {
        Object.assign(shader.uniforms, {
          uFoundationTime: sharedUniforms.uTime,
          uFoundationCursor: sharedUniforms.uCursor,
          uFoundationActive: sharedUniforms.uActive,
          uFoundationRadius: sharedUniforms.uRadius,
          uFoundationReach: sharedUniforms.uVerticalReach,
          uFoundationStrength: sharedUniforms.uStrength,
          uFoundationLayerY: { value: layerY },
          uFoundationBob: { value: (bob / 100) * size * 0.6 },
        });
        shader.vertexShader = `attribute vec4 aFoundationAnchor;
          uniform float uFoundationTime, uFoundationActive, uFoundationRadius;
          uniform float uFoundationReach, uFoundationStrength, uFoundationLayerY, uFoundationBob;
          uniform vec3 uFoundationCursor;\n` + shader.vertexShader;
        shader.vertexShader = shader.vertexShader.replace("#include <begin_vertex>", `
          #include <begin_vertex>
          vec3 delta = aFoundationAnchor.xyz - uFoundationCursor;
          delta.y += uFoundationLayerY;
          float bump = exp(-dot(delta.xz, delta.xz) / (uFoundationRadius * uFoundationRadius)
            - delta.y * delta.y / (uFoundationReach * uFoundationReach))
            * uFoundationStrength * uFoundationActive;
          transformed.y += bump + sin(uFoundationTime * 0.9 + aFoundationAnchor.w) * uFoundationBob;
        `);
      };
      material.customProgramCacheKey = () => "foundation-batch-v1";
    }
    return { fill, edge };
  }, [color, fillOpacity, edgeOpacity, layerY, bob, size, sharedUniforms]);
  useEffect(() => () => { materials.fill.dispose(); materials.edge.dispose(); }, [materials]);

  return <group position={[0, layerY, 0]}>
    <mesh geometry={geometries.faces} material={materials.fill} frustumCulled={false} />
    <lineSegments geometry={geometries.edges} material={materials.edge} frustumCulled={false} />
  </group>;
}
