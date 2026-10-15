"use client";

import { useEffect, useRef, useState } from "react";
import type { AgenticArchitectureSettings } from "./defaults";

type Props = {
  settings: AgenticArchitectureSettings;
  svgRef?: React.RefObject<SVGSVGElement | null>;
};

const VIEW_W = 1200;
const VIEW_H = 1800;
const CX = VIEW_W / 2;

/** Isometric hex-prism silhouette ("flat-top" hexagon) used for every module.
 *  Returns a path string for the outer wireframe + diagonal edges hinting at
 *  the three visible faces. All units in viewBox space. */
function isoHex({
  cx,
  cy,
  width,
  depth,
  height,
}: {
  cx: number;
  cy: number;
  width: number;
  depth: number;
  height: number;
}): { outline: string; sides: string } {
  const halfW = width / 2;
  const halfD = depth / 2;
  const topY = cy - height / 2;
  const bottomY = cy + height / 2;
  // Flat-top hex: 6 points around the top rhombus + 6 around bottom.
  // Top rhombus (ceiling) viewed in isometric: left corner at (cx-halfW, topY),
  // top at (cx, topY-halfD), right at (cx+halfW, topY), bottom at (cx, topY+halfD).
  // Bottom rhombus shifted down by `height`.
  const topLeft = [cx - halfW, topY];
  const topTop = [cx, topY - halfD];
  const topRight = [cx + halfW, topY];
  const topBot = [cx, topY + halfD];
  const botLeft = [cx - halfW, bottomY];
  const botTop = [cx, bottomY - halfD];
  const botRight = [cx + halfW, bottomY];
  const botBot = [cx, bottomY + halfD];

  // Outer silhouette: left-top edge → top → right-top → right-bot → bottom → left-bot → back.
  const outline =
    `M ${topLeft[0]} ${topLeft[1]} ` +
    `L ${topTop[0]} ${topTop[1]} ` +
    `L ${topRight[0]} ${topRight[1]} ` +
    `L ${botRight[0]} ${botRight[1]} ` +
    `L ${botBot[0]} ${botBot[1]} ` +
    `L ${botLeft[0]} ${botLeft[1]} Z`;

  // Interior face hints: 3 verticals + top/bottom rhombus diagonals.
  const sides =
    // Verticals (3 visible edges)
    `M ${topLeft[0]} ${topLeft[1]} L ${botLeft[0]} ${botLeft[1]} ` +
    `M ${topBot[0]} ${topBot[1]} L ${botBot[0]} ${botBot[1]} ` +
    `M ${topRight[0]} ${topRight[1]} L ${botRight[0]} ${botRight[1]} ` +
    // Top rhombus diagonals (ceiling)
    `M ${topLeft[0]} ${topLeft[1]} L ${topBot[0]} ${topBot[1]} ` +
    `M ${topBot[0]} ${topBot[1]} L ${topRight[0]} ${topRight[1]} ` +
    // Bottom rhombus diagonals (floor)
    `M ${botLeft[0]} ${botLeft[1]} L ${botBot[0]} ${botBot[1]} ` +
    `M ${botBot[0]} ${botBot[1]} L ${botRight[0]} ${botRight[1]}`;

  return { outline, sides };
}

/** Returns a right-side bracket path: short horizontal → long vertical → short
 *  horizontal, with the label text to the right of the vertical bar. */
function sideBracket(cxEdge: number, yTop: number, yBot: number, tickLen = 14) {
  const x1 = cxEdge;
  const x2 = cxEdge + tickLen;
  return `M ${x1} ${yTop} L ${x2} ${yTop} L ${x2} ${yBot} L ${x1} ${yBot}`;
}

export function AgenticArchitectureScene({ settings, svgRef }: Props) {
  const localRef = useRef<SVGSVGElement | null>(null);
  const ref = svgRef ?? localRef;

  // Animation tick for the dashed orbit rotation.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const loop = (now: number) => {
      setTick((now - start) / 1000);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const stroke = settings.lineColor;
  const strokeOpacity = settings.lineOpacity / 100;
  const sw = settings.lineThickness;
  const accent = settings.accentColor;
  const accentOp = settings.accentOpacity / 100;
  const widthScale = settings.moduleWidthPct / 100;

  // Base module dimensions (viewBox units).
  const topW = 280 * widthScale;
  const topD = 90 * widthScale;
  const topH = 110;
  const centerW = 440 * widthScale;
  const centerD = 150 * widthScale;
  const centerH = 300;
  const bottomW = 380 * widthScale;
  const bottomD = 130 * widthScale;
  const bottomH = 220;

  // Vertical layout — top module sits near top third, bottom near bottom third.
  const topCy = 460;
  const gap = (settings.moduleGapPct / 100) * VIEW_H;
  const centerCy = topCy + topH / 2 + topD / 2 + gap + centerH / 2 + centerD / 2;
  const bottomCy = centerCy + centerH / 2 + centerD / 2 + gap + bottomH / 2 + bottomD / 2;

  const top = isoHex({ cx: CX, cy: topCy, width: topW, depth: topD, height: topH });
  const center = isoHex({ cx: CX, cy: centerCy, width: centerW, depth: centerD, height: centerH });
  const bottom = isoHex({ cx: CX, cy: bottomCy, width: bottomW, depth: bottomD, height: bottomH });

  // Dashed orbit around the center module — ellipse rotated slightly for
  // isometric feel, slowly spinning per orbitSpeed.
  const orbitRx = centerW * 0.7;
  const orbitRy = centerD * 1.1;
  const orbitAngle = (tick * (settings.orbitSpeed / 100) * 60) % 360;

  // Input flow lines curving in from top-left and top-right into the top module.
  const flowOp = settings.flowLineOpacity / 100;
  const flowLines: string[] = [];
  if (settings.flowLinesEnabled) {
    const n = Math.max(1, Math.floor(settings.flowLineCount));
    for (let i = 0; i < n; i += 1) {
      const spread = 24 + i * 18;
      // Left side input
      const leftStartX = -40;
      const leftStartY = -40;
      const leftEndX = CX - 30 + i * 10;
      const leftEndY = topCy - topH / 2 - 20;
      const leftC1X = CX * 0.3;
      const leftC1Y = -20;
      const leftC2X = CX - 60;
      const leftC2Y = topCy - 200 - spread;
      flowLines.push(
        `M ${leftStartX} ${leftStartY} C ${leftC1X} ${leftC1Y}, ${leftC2X} ${leftC2Y}, ${leftEndX} ${leftEndY}`,
      );
      // Right side input (mirror)
      const rightStartX = VIEW_W + 40;
      const rightEndX = CX + 30 - i * 10;
      const rightC1X = VIEW_W - CX * 0.3;
      const rightC2X = CX + 60;
      flowLines.push(
        `M ${rightStartX} ${leftStartY} C ${rightC1X} ${leftC1Y}, ${rightC2X} ${leftC2Y}, ${rightEndX} ${leftEndY}`,
      );
      // Output: bottom-left curve
      const outLeftEndX = -40;
      const outLeftEndY = VIEW_H + 40;
      const outLeftStartX = CX - 30 + i * 10;
      const outLeftStartY = bottomCy + bottomH / 2 + 20;
      const outLeftC1X = CX - 60;
      const outLeftC1Y = bottomCy + 200 + spread;
      const outLeftC2X = CX * 0.3;
      const outLeftC2Y = VIEW_H + 20;
      flowLines.push(
        `M ${outLeftStartX} ${outLeftStartY} C ${outLeftC1X} ${outLeftC1Y}, ${outLeftC2X} ${outLeftC2Y}, ${outLeftEndX} ${outLeftEndY}`,
      );
      // Output: bottom-right curve
      const outRightEndX = VIEW_W + 40;
      const outRightStartX = CX + 30 - i * 10;
      const outRightC1X = CX + 60;
      const outRightC2X = VIEW_W - CX * 0.3;
      flowLines.push(
        `M ${outRightStartX} ${outLeftStartY} C ${outRightC1X} ${outLeftC1Y}, ${outRightC2X} ${outLeftC2Y}, ${outRightEndX} ${outLeftEndY}`,
      );
    }
  }

  // Right-side brackets — one per module.
  const bracketX = CX + Math.max(centerW / 2 + 70, 320);
  const topBracketD = sideBracket(bracketX, topCy - topH / 2 - topD / 2, topCy + topH / 2 + topD / 2);
  const centerBracketD = sideBracket(bracketX, centerCy - centerH / 2 - centerD / 2, centerCy + centerH / 2 + centerD / 2);
  const bottomBracketD = sideBracket(bracketX, bottomCy - bottomH / 2 - bottomD / 2, bottomCy + bottomH / 2 + bottomD / 2);

  const mono = 'ui-monospace, SFMono-Regular, Menlo, "Courier New", monospace';
  const serif = 'Georgia, "Times New Roman", serif';

  return (
    <svg
      ref={ref}
      viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
      preserveAspectRatio="xMidYMid meet"
      className="h-full w-full"
      style={{ background: settings.backgroundColor, display: "block" }}
    >
      {/* Flow lines (behind everything) */}
      {flowLines.map((d, i) => (
        <path
          key={`flow-${i}`}
          d={d}
          fill="none"
          stroke={stroke}
          strokeWidth={sw * 0.75}
          opacity={flowOp}
        />
      ))}

      {/* Title + subtitle */}
      <g>
        <text
          x={CX}
          y={120}
          textAnchor="middle"
          fontFamily={mono}
          fontSize={settings.subtitleFontSize}
          letterSpacing="4"
          fill={settings.subtitleColor}
        >
          {settings.subtitleText}
        </text>
        <text
          x={CX}
          y={190}
          textAnchor="middle"
          fontFamily={serif}
          fontSize={settings.titleFontSize}
          fill={settings.titleColor}
        >
          {settings.titleText}
        </text>
      </g>

      {/* TOP MODULE */}
      <g opacity={strokeOpacity}>
        <path d={top.sides} fill="none" stroke={stroke} strokeWidth={sw * 0.8} />
        <path d={top.outline} fill="none" stroke={stroke} strokeWidth={sw} />
      </g>
      {/* Top module caption tag */}
      <g>
        <rect
          x={CX - 70}
          y={topCy + topH / 2 + topD / 2 + 8}
          width={140}
          height={22}
          fill="none"
          stroke={stroke}
          strokeWidth={sw * 0.6}
          opacity={strokeOpacity}
          rx={2}
        />
        <text
          x={CX}
          y={topCy + topH / 2 + topD / 2 + 24}
          textAnchor="middle"
          fontFamily={mono}
          fontSize={11}
          letterSpacing="2.5"
          fill={stroke}
          opacity={strokeOpacity}
        >
          {settings.moduleTopLabel}
        </text>
      </g>

      {/* Vertical connector top → center */}
      <line
        x1={CX}
        y1={topCy + topH / 2 + topD / 2 + 34}
        x2={CX}
        y2={centerCy - centerH / 2 - centerD / 2 - 4}
        stroke={stroke}
        strokeWidth={sw * 0.6}
        opacity={strokeOpacity}
      />

      {/* CENTER MODULE */}
      <g opacity={strokeOpacity}>
        <path d={center.sides} fill="none" stroke={stroke} strokeWidth={sw * 0.8} />
        <path d={center.outline} fill="none" stroke={stroke} strokeWidth={sw} />
        {/* Interior "display" rectangle on the front face */}
        <rect
          x={CX - centerW * 0.28}
          y={centerCy - centerH * 0.3}
          width={centerW * 0.56}
          height={centerH * 0.6}
          fill="none"
          stroke={stroke}
          strokeWidth={sw * 0.6}
        />
        {/* a few horizontal "code line" ticks inside the display */}
        {Array.from({ length: 6 }).map((_, i) => (
          <line
            key={`disp-${i}`}
            x1={CX - centerW * 0.24}
            y1={centerCy - centerH * 0.22 + i * 18}
            x2={CX - centerW * 0.08 - (i % 3) * 10}
            y2={centerCy - centerH * 0.22 + i * 18}
            stroke={stroke}
            strokeWidth={sw * 0.5}
          />
        ))}
      </g>
      {/* Red accent: orbit + highlight tag */}
      <g opacity={accentOp}>
        <ellipse
          cx={CX}
          cy={centerCy}
          rx={orbitRx}
          ry={orbitRy}
          fill="none"
          stroke={accent}
          strokeWidth={sw * 0.9}
          strokeDasharray="8 10"
          transform={`rotate(${orbitAngle} ${CX} ${centerCy})`}
        />
        <rect
          x={CX - 100}
          y={centerCy - centerH * 0.36 - 14}
          width={200}
          height={22}
          fill="none"
          stroke={accent}
          strokeWidth={sw * 0.8}
          rx={11}
        />
        <text
          x={CX}
          y={centerCy - centerH * 0.36 + 1}
          textAnchor="middle"
          fontFamily={mono}
          fontSize={11}
          letterSpacing="2.5"
          fill={accent}
        >
          {settings.moduleCenterLabel}
        </text>
        {/* Small triangle marker on orbit */}
        <polygon
          points={`${CX - 10},${centerCy - 6} ${CX + 10},${centerCy - 6} ${CX},${centerCy + 10}`}
          fill={accent}
        />
      </g>
      {/* Left/right micro-badges on center module */}
      <g opacity={strokeOpacity}>
        <rect x={CX - centerW * 0.52} y={centerCy - 10} width={28} height={20} rx={10} fill="none" stroke={stroke} strokeWidth={sw * 0.6} />
        <rect x={CX + centerW * 0.52 - 56} y={centerCy - 10} width={56} height={20} rx={10} fill="none" stroke={stroke} strokeWidth={sw * 0.6} />
        <text x={CX + centerW * 0.52 - 28} y={centerCy + 5} textAnchor="middle" fontFamily={mono} fontSize={10} fill={stroke} letterSpacing="0.5">
          4,000+
        </text>
      </g>

      {/* Vertical connector center → bottom */}
      <line
        x1={CX}
        y1={centerCy + centerH / 2 + centerD / 2 + 12}
        x2={CX}
        y2={bottomCy - bottomH / 2 - bottomD / 2 - 4}
        stroke={stroke}
        strokeWidth={sw * 0.6}
        opacity={strokeOpacity}
      />

      {/* BOTTOM MODULE */}
      <g opacity={strokeOpacity}>
        <path d={bottom.sides} fill="none" stroke={stroke} strokeWidth={sw * 0.8} />
        <path d={bottom.outline} fill="none" stroke={stroke} strokeWidth={sw} />
      </g>
      {/* Bottom module caption tag */}
      <g>
        <rect
          x={CX - 80}
          y={bottomCy - bottomH / 2 - bottomD / 2 - 32}
          width={160}
          height={22}
          fill="none"
          stroke={stroke}
          strokeWidth={sw * 0.6}
          opacity={strokeOpacity}
          rx={2}
        />
        <text
          x={CX}
          y={bottomCy - bottomH / 2 - bottomD / 2 - 16}
          textAnchor="middle"
          fontFamily={mono}
          fontSize={11}
          letterSpacing="2.5"
          fill={stroke}
          opacity={strokeOpacity}
        >
          {settings.moduleBottomLabel}
        </text>
      </g>
      {/* Binary flavor across the bottom module */}
      <text
        x={CX}
        y={bottomCy + 10}
        textAnchor="middle"
        fontFamily={mono}
        fontSize={11}
        fill={stroke}
        opacity={strokeOpacity * 0.6}
        letterSpacing="2"
      >
        01110011101010 00111010001 1010111101
      </text>

      {/* Right-side brackets with labels */}
      <g opacity={strokeOpacity}>
        <path d={topBracketD} fill="none" stroke={stroke} strokeWidth={sw * 0.6} />
        <text
          x={bracketX + 22}
          y={topCy + 4}
          fontFamily={mono}
          fontSize={10}
          letterSpacing="3"
          fill={stroke}
          transform={`rotate(-90 ${bracketX + 22} ${topCy + 4})`}
        >
          {settings.bracketLabelTop}
        </text>
        <path d={centerBracketD} fill="none" stroke={stroke} strokeWidth={sw * 0.6} />
        <text
          x={bracketX + 22}
          y={centerCy + 10}
          fontFamily={mono}
          fontSize={10}
          letterSpacing="3"
          fill={stroke}
          transform={`rotate(-90 ${bracketX + 22} ${centerCy + 10})`}
        >
          {settings.bracketLabelCenter}
        </text>
        <path d={bottomBracketD} fill="none" stroke={stroke} strokeWidth={sw * 0.6} />
        <text
          x={bracketX + 22}
          y={bottomCy + 10}
          fontFamily={mono}
          fontSize={10}
          letterSpacing="3"
          fill={stroke}
          transform={`rotate(-90 ${bracketX + 22} ${bottomCy + 10})`}
        >
          {settings.bracketLabelBottom}
        </text>
      </g>
    </svg>
  );
}
