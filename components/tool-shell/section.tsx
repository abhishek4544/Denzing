"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

type SectionProps = {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
};

export function Section({ title, defaultOpen = true, children }: SectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bg-card">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between px-3.5 py-[18px] bg-card border-b border-border hover:bg-accent/40 transition-colors"
      >
        <span className="text-[14px] font-semibold text-foreground tracking-[-0.14px]">
          {title}
        </span>
        {open ? (
          <ChevronDown className="w-[16px] h-[16px] text-foreground" strokeWidth={1.75} />
        ) : (
          <ChevronRight className="w-[16px] h-[16px] text-foreground" strokeWidth={1.75} />
        )}
      </button>
      {open ? (
        <div className="px-[7px] py-3.5 flex flex-col gap-[6px] border-b border-border">{children}</div>
      ) : null}
    </div>
  );
}
