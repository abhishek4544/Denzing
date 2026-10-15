"use client";

import { SecurityGridScene } from "../security-grid-3d/scene";
import type { AutonomousAgentsLabSettings } from "./defaults";

export function AutonomousAgentsLabScene({
  settings,
}: {
  settings: AutonomousAgentsLabSettings;
}) {
  const rad = (settings.sceneRotationDegrees * Math.PI) / 180;
  return (
    <group rotation={[0, 0, rad]}>
      <SecurityGridScene settings={settings} />
    </group>
  );
}
