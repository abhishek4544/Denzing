import {
  defaultSecurityGridSettings,
  type SecurityGridSettings,
} from "../security-grid-3d/defaults";
import presetDefault from "./preset-default.json";

/**
 * Lab = Security Grid scene rotated about the camera's view axis so the
 * cube/wires/floor read horizontally (hourglass orientation for the
 * Autonomous Agents concept) rather than vertically.
 */
export type AutonomousAgentsLabSettings = SecurityGridSettings & {
  sceneRotationDegrees: number;
  leftOffset: number;
  rightOffset: number;
  topOffset: number;
  bottomOffset: number;
  rightLabelsEnabled: boolean;
  rightLabels: string[];
  rightLabelsFontSize: number;
  rightLabelsColor: string;
  rightLabelsOffsetX: number;
  rightLabelsSpacingY: number;
  centerLabelEnabled: boolean;
  centerLabelText: string;
  centerLabelFontSize: number;
  centerLabelColor: string;
  centerLabelOffsetY: number;
};

const presetSettings = (presetDefault as { settings: Partial<AutonomousAgentsLabSettings> })
  .settings;

export const defaultLabSettings: AutonomousAgentsLabSettings = {
  ...defaultSecurityGridSettings,
  sceneRotationDegrees: 90,
  leftOffset: 0,
  rightOffset: 0,
  topOffset: 0,
  bottomOffset: 0,
  rightLabelsEnabled: true,
  rightLabels: ["REORDER", "HOLD PRICE", "FLAG SUPPLIER", "NOTIFY BUYER"],
  rightLabelsFontSize: 22,
  rightLabelsColor: "#ffffff",
  rightLabelsOffsetX: 300,
  rightLabelsSpacingY: 130,
  centerLabelEnabled: true,
  centerLabelText: "Decide",
  centerLabelFontSize: 40,
  centerLabelColor: "#ffffff",
  centerLabelOffsetY: 500,
  ...presetSettings,
} as AutonomousAgentsLabSettings;
