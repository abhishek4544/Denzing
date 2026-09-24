"use client";

import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export type ToolOption = {
  id: string;
  label: string;
  description?: string;
  href: string;
};

type TopbarProps = {
  toolLabel?: string;
  tools?: readonly ToolOption[];
  activeToolId?: string;
  onToolSwitcherClick?: () => void;
  onExport?: () => void;
  exportLabel?: string;
  actions?: React.ReactNode;
};

export function Topbar({
  toolLabel = "Untitled tool",
  tools = [],
  activeToolId,
  onToolSwitcherClick,
  onExport,
  exportLabel = "Export as",
  actions,
}: TopbarProps) {
  const [isToolMenuOpen, setIsToolMenuOpen] = useState(false);
  const toolMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function closeOnOutsidePointer(event: PointerEvent) {
      if (!toolMenuRef.current?.contains(event.target as Node)) {
        setIsToolMenuOpen(false);
      }
    }

    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, []);

  return (
    <header className="flex items-center gap-2 bg-transparent">
      <div ref={toolMenuRef} className="relative">
        <button
          type="button"
          onClick={() => {
            setIsToolMenuOpen((open) => !open);
            onToolSwitcherClick?.();
          }}
          className="flex items-center gap-3 p-3 rounded-[8px] bg-[#f9f9f9] border border-border hover:bg-accent transition-colors text-[14px] font-medium text-foreground leading-none"
          aria-label="Switch tool"
          aria-expanded={isToolMenuOpen}
          aria-haspopup="menu"
        >
          <span>{toolLabel}</span>
          <ChevronDown
            className={`w-[14px] h-[14px] text-foreground transition-transform ${
              isToolMenuOpen ? "rotate-180" : ""
            }`}
            strokeWidth={1.75}
          />
        </button>
        {isToolMenuOpen ? (
          <div
            role="menu"
            aria-label="Available tools"
            className="absolute left-0 top-full z-30 mt-2 min-w-[232px] rounded-[8px] border border-border bg-card p-1"
          >
            {tools.map((tool) => {
              const active = tool.id === activeToolId;
              return (
                <Link
                  key={tool.id}
                  href={tool.href}
                  role="menuitem"
                  aria-current={active ? "page" : undefined}
                  onClick={() => setIsToolMenuOpen(false)}
                  className={`block rounded-[6px] px-3 py-2 text-[12px] font-medium transition-colors ${
                    active
                      ? "bg-muted text-foreground"
                      : "text-foreground hover:bg-accent"
                  }`}
                >
                  <span className="block">{tool.label}</span>
                  {tool.description ? (
                    <span className="mt-0.5 block text-[10px] font-medium text-muted-foreground">
                      {tool.description}
                    </span>
                  ) : null}
                </Link>
              );
            })}
          </div>
        ) : null}
      </div>
      <button
        type="button"
        onClick={onExport}
        className="flex items-center gap-2 p-3 rounded-[8px] bg-foreground text-background text-[14px] font-medium leading-none tracking-[-0.14px] hover:opacity-90 transition-opacity"
      >
        <span>{exportLabel}</span>
        <ChevronDown className="w-[14px] h-[14px]" strokeWidth={1.75} />
      </button>
      {actions}
    </header>
  );
}
