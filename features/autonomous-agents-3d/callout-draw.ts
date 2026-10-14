import * as THREE from "three";
import type { StrataSettings } from "./defaults";
import {
  BADGES,
  BASELINE_CAMERA_DISTANCE,
  badgePosition,
  computeStrataAnchors,
  readLineGeometry,
  type CalloutId,
} from "./callout-overlay";

/** Draws the Mesh Strata callout overlay (badges + connector lines) on a 2D
 * canvas context. Used by image/video exports to bake the overlay into the
 * exported frame, since the overlay normally lives as HTML on top of the
 * WebGL canvas and is invisible to canvas captures. */
export function drawCalloutsOnCanvas(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  settings: StrataSettings,
  camera: THREE.Camera,
): void {
  if (!settings.showCallouts) return;

  const cameraWithPos = camera as THREE.Camera & { position: THREE.Vector3 };
  const distance = cameraWithPos.position.length();
  // Camera-driven scale (0.55–2.2) — matches the live `--callout-scale`.
  // Used for geometry expressed in overlay-percentage units: how far the
  // vertical trunk sits from the badge, drop length, bend padding, etc.
  const scale = THREE.MathUtils.clamp(
    BASELINE_CAMERA_DISTANCE / Math.max(distance, 0.001),
    0.55,
    2.2,
  );
  // Figma design frame is 896×706 CSS pixels. Badge chip + stroke widths
  // are specified in those pixel units; multiply by the current canvas-to-
  // reference ratio so badges stay visually the same size relative to the
  // stack whether rendered at preview (~700 px) or export (1920×1080).
  const pixelScale = Math.min(width / 896, height / 706) * scale;

  // Project each callout's layer edge to overlay-% coords. Same corner-pick
  // logic as CalloutAnchorTracker.
  const specs = computeStrataAnchors(settings);
  const anchorPct: Record<CalloutId, { x: number; y: number }> = {
    aiAnalytics: { x: 0, y: 0 },
    autonomousAgents: { x: 0, y: 0 },
    yourOwnAi: { x: 0, y: 0 },
  };
  const scratch = new THREE.Vector3();
  (Object.keys(specs) as CalloutId[]).forEach((id) => {
    const spec = specs[id];
    const h = spec.half;
    let bestNdcX = spec.pick === "left" ? Infinity : -Infinity;
    let bestNdcY = -Infinity;
    let bx = 0;
    let by = 0;
    for (const cx of [-h, h]) {
      for (const cz of [-h, h]) {
        scratch.set(cx, spec.layerY, cz).project(camera);
        if (spec.pick === "left") {
          if (scratch.x < bestNdcX) {
            bestNdcX = scratch.x;
            bx = scratch.x;
            by = scratch.y;
          }
        } else if (spec.pick === "right") {
          if (scratch.x > bestNdcX) {
            bestNdcX = scratch.x;
            bx = scratch.x;
            by = scratch.y;
          }
        } else {
          if (scratch.y > bestNdcY) {
            bestNdcY = scratch.y;
            bx = scratch.x;
            by = scratch.y;
          }
        }
      }
    }
    anchorPct[id] = {
      x: (bx * 0.5 + 0.5) * 100,
      y: (-by * 0.5 + 0.5) * 100,
    };
  });

  const toPxX = (pct: number) => (pct / 100) * width;
  const toPxY = (pct: number) => (pct / 100) * height;

  // Draw dashed connector lines beneath the badges.
  for (const b of BADGES) {
    const pos = badgePosition(settings, b.id);
    const geom = readLineGeometry(settings, b.id);
    const sx = pos.left + 1.3 * scale;
    const sy = pos.top + 3.4 * scale;
    const anchor = anchorPct[b.id];
    let points: Array<[number, number]>;
    if (b.bendDirection === "none") {
      const dropY = sy + geom.down * scale;
      points = [
        [sx, sy],
        [sx, dropY],
      ];
    } else {
      const dirSign = b.bendDirection === "right" ? 1 : -1;
      const trunkX = geom.trunkX;
      const dropY = sy + geom.down * scale;
      const padding = geom.bend * scale;
      let bendEndX = anchor.x + dirSign * padding;
      bendEndX =
        dirSign > 0 ? Math.max(trunkX, bendEndX) : Math.min(trunkX, bendEndX);
      points = [
        [sx, sy],
        [trunkX, sy],
        [trunkX, dropY],
        [bendEndX, dropY],
      ];
    }
    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.85)";
    ctx.lineWidth = 1.2 * pixelScale;
    ctx.lineCap = "round";
    ctx.setLineDash([4 * pixelScale, 4 * pixelScale]);
    ctx.beginPath();
    const [sx0, sy0] = points[0];
    ctx.moveTo(toPxX(sx0), toPxY(sy0));
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(toPxX(points[i][0]), toPxY(points[i][1]));
    }
    ctx.stroke();
    ctx.restore();
  }

  // Draw badges (icon tile + text pill) on top of the lines.
  for (const b of BADGES) {
    const pos = badgePosition(settings, b.id);
    const chipScale = pixelScale;
    const iconSize = 24 * chipScale;
    const padX = 8.571 * chipScale;
    const padY = 5.143 * chipScale;
    const fontSize = 13.714 * chipScale;
    const font = `400 ${fontSize.toFixed(2)}px "Violet Sans", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;

    ctx.save();
    ctx.font = font;
    ctx.textBaseline = "middle";
    const textWidth = ctx.measureText(b.label).width;
    const chipWidth = iconSize + padX * 2 + textWidth;
    const chipHeight = Math.max(iconSize, fontSize + padY * 2);

    const x = toPxX(pos.left);
    const y = toPxY(pos.top);

    // Chip background.
    ctx.fillStyle = b.background;
    ctx.fillRect(x, y, chipWidth, chipHeight);
    // Icon tile.
    ctx.fillStyle = b.iconBackground;
    ctx.fillRect(x, y, iconSize, chipHeight);
    // Centered dot inside the icon tile.
    ctx.fillStyle = b.iconDotColor;
    ctx.beginPath();
    ctx.arc(
      x + iconSize / 2,
      y + chipHeight / 2,
      5.15 * chipScale,
      0,
      Math.PI * 2,
    );
    ctx.fill();
    // Label text.
    ctx.fillStyle = b.textColor;
    ctx.fillText(b.label, x + iconSize + padX, y + chipHeight / 2);
    ctx.restore();
  }
}
