"use client";

import { Plus } from "lucide-react";

type LayersPanelProps = {
  title?: string;
  onAdd?: () => void;
  canAdd?: boolean;
  children: React.ReactNode;
};

/**
 * Left-side floating panel that mirrors ControlsPanel's visual language but
 * sits below the top-left toolbar. Used to host layer management (list,
 * drag-reorder, add) so the right inspector stays focused on tool settings.
 */
export function LayersPanel({
  title = "Layers",
  onAdd,
  canAdd = true,
  children,
}: LayersPanelProps) {
  return (
    <aside className="absolute top-14 left-0 bottom-0 w-[260px] flex flex-col z-10">
      <div className="flex-1 min-h-0 rounded-[10px] bg-card border border-border flex flex-col overflow-hidden">
        <header className="flex items-center justify-between bg-[#f9f9f9] border-b border-border px-3.5 py-3">
          <div className="text-[14px] font-semibold text-foreground tracking-[-0.14px] uppercase">
            {title}
          </div>
          {canAdd && onAdd ? (
            <button
              type="button"
              onClick={onAdd}
              className="flex items-center gap-1 h-[21px] px-2 rounded-[5px] text-[10px] font-medium text-foreground hover:bg-accent transition-colors"
              aria-label="Add layer"
            >
              <Plus className="w-3 h-3" strokeWidth={1.75} />
              <span>Add</span>
            </button>
          ) : null}
        </header>
        <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar py-1">
          {children}
        </div>
      </div>
    </aside>
  );
}
