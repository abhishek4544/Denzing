import {
  defaultSecurityGridSettings,
  type SecurityGridSettings,
} from "../security-grid-3d/defaults";

/**
 * Lab = Security Grid scene rotated about the camera's view axis so the
 * cube/wires/floor read horizontally (hourglass orientation for the
 * Autonomous Agents concept) rather than vertically.
 */
export type AutonomousAgentsLabSettings = SecurityGridSettings & {
  sceneRotationDegrees: number;
};

export const defaultLabSettings: AutonomousAgentsLabSettings = {
  ...defaultSecurityGridSettings,
  sceneRotationDegrees: 90,
  autoRotate: false,
};
