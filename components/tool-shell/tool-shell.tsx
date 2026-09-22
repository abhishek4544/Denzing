"use client";

import { Topbar, type ToolOption } from "./topbar";

type ToolShellProps = {
  /** Shown in the tool switcher (top-left). */
  toolLabel?: string;
  /** Tool registry used by the top-left selector. */
  tools?: readonly ToolOption[];
  activeToolId?: string;
  onToolSwitcherClick?: () => void;
  onExport?: () => void;
  exportLabel?: string;
  /** Rendered next to the topbar buttons with a 40px gap (e.g. SizeControls). */
  topbarExtras?: React.ReactNode;
  children: React.ReactNode;
};

/**
 * The shell places a global 8px padding around the viewport.
 * Children stack over that padded stage: CanvasArea (absolute inset-0)
 * fills the padded viewport; ControlsPanel floats on the top-right.
 * The Topbar (Thirdfactor thumbnail + Export as) plus optional topbarExtras
 * (e.g. SizeControls) float on top-left in one row.
 */
export function ToolShell({
  toolLabel,
  tools,
  activeToolId,
  onToolSwitcherClick,
  onExport,
  exportLabel,
  topbarExtras,
  children,
}: ToolShellProps) {
  return (
    <div className="fixed inset-0 bg-background overflow-hidden">
      <div className="absolute inset-2">
        {children}
        {/* Top-left row: [tool selector + export] + [size controls] */}
        <div className="absolute top-0 left-0 z-20 flex items-center gap-10">
          <Topbar
            toolLabel={toolLabel}
            tools={tools}
            activeToolId={activeToolId}
            onToolSwitcherClick={onToolSwitcherClick}
            onExport={onExport}
            exportLabel={exportLabel}
          />
          {topbarExtras}
        </div>
      </div>
    </div>
  );
}

export { Topbar } from "./topbar";
export { CanvasArea } from "./canvas-area";
export { ControlsPanel } from "./controls-panel";
