"use client";

import { RotateCcw } from "lucide-react";

type ControlsPanelProps = {
  title: string;
  icon?: React.ReactNode;
  onReset?: () => void;
  children: React.ReactNode;
};

export function ControlsPanel({
  title,
  icon,
  onReset,
  children,
}: ControlsPanelProps) {
  return (
    <aside className="absolute top-0 right-0 bottom-0 w-[336px] flex flex-col z-10">
      <div className="flex-1 min-h-0 rounded-[10px] bg-card border border-border flex flex-col overflow-hidden">
        {/* Panel header (grey) */}
        <header className="flex items-center justify-between bg-[#f9f9f9] border-b border-border px-3.5 py-4">
          <div className="flex items-center gap-2 min-w-0">
            {icon ? (
              <div className="w-[42px] h-6 flex items-center justify-center shrink-0 text-foreground">
                {icon}
              </div>
            ) : null}
            <div className="min-w-0 flex flex-col gap-[4px]">
              <div className="text-[22px] leading-none font-bold text-foreground uppercase tracking-[-0.22px] truncate">
                {title}
              </div>
              <div className="text-[11px] font-medium text-muted-foreground tracking-[-0.1px] truncate">
                by Abhishek Thapa
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onReset}
            className="flex items-center gap-1.5 shrink-0 text-foreground hover:opacity-70 transition-opacity"
          >
            <RotateCcw className="w-[16px] h-[16px]" strokeWidth={1.75} />
            <span className="text-[14px] font-medium tracking-[-0.14px]">
              Reset
            </span>
          </button>
        </header>

        <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar">
          {children}
        </div>
      </div>
    </aside>
  );
}
