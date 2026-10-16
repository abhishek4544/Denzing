"use client";

import { Billboard, Text } from "@react-three/drei";
import { SecurityGridScene } from "../security-grid-3d/scene";
import type { AutonomousAgentsLabSettings } from "./defaults";

export function AutonomousAgentsLabScene({
  settings,
}: {
  settings: AutonomousAgentsLabSettings;
}) {
  const rad = (settings.sceneRotationDegrees * Math.PI) / 180;
  const shiftX = (settings.rightOffset - settings.leftOffset) * 0.01;
  const shiftY = (settings.topOffset - settings.bottomOffset) * 0.01;

  // Mirror the cube's post-rotation position so the labels anchor to it,
  // not to the outer group origin. SecurityGridScene places the cube at
  // (cubeOffsetX*0.1, cubeHeightAbove*0.1, cubeOffsetZ*0.1); the inner group
  // then rotates it about Z, so we replay the same transform here.
  const cx = settings.cubeOffsetX * 0.1;
  const cy = settings.cubeHeightAbove * 0.1;
  const cosR = Math.cos(rad);
  const sinR = Math.sin(rad);
  const cubeX = cx * cosR - cy * sinR;
  const cubeY = cx * sinR + cy * cosR;

  const rightLabels = settings.rightLabels.filter((text) => text && text.trim());
  const n = rightLabels.length;
  const spacing = settings.rightLabelsSpacingY * 0.01;
  const originY = cubeY + ((n - 1) / 2) * spacing;

  return (
    <group position={[shiftX, shiftY, 0]}>
      <group rotation={[0, 0, rad]}>
        <SecurityGridScene settings={settings} />
      </group>

      {settings.rightLabelsEnabled && n > 0
        ? rightLabels.map((text, i) => (
            <Billboard
              key={`right-label-${i}`}
              position={[
                cubeX - settings.rightLabelsOffsetX * 0.01,
                originY - i * spacing,
                0,
              ]}
            >
              <Text
                fontSize={settings.rightLabelsFontSize * 0.01}
                color={settings.rightLabelsColor}
                anchorX="left"
                anchorY="middle"
              >
                {text}
              </Text>
            </Billboard>
          ))
        : null}

      {settings.centerLabelEnabled && settings.centerLabelText ? (
        <Billboard
          position={[cubeX, cubeY - settings.centerLabelOffsetY * 0.01, 0]}
        >
          <Text
            fontSize={settings.centerLabelFontSize * 0.01}
            color={settings.centerLabelColor}
            anchorX="center"
            anchorY="middle"
          >
            {settings.centerLabelText}
          </Text>
        </Billboard>
      ) : null}
    </group>
  );
}
