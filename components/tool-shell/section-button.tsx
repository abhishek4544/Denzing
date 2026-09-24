"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

type SectionButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement>;

export function SectionButton({
  className,
  children,
  ...props
}: SectionButtonProps) {
  return (
    <button
      type="button"
      {...props}
      className={cn(
        "w-full h-[28px] rounded-[7px] potatoo-field text-[10px] font-medium text-foreground",
        "hover:bg-accent transition-colors",
        "focus-visible:outline-none",
        className,
      )}
    >
      {children}
    </button>
  );
}
