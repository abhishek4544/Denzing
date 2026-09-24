"use client";

import { Pipette } from "lucide-react";
import { FieldRow } from "./field-row";

type ColorFieldProps = {
  label: string;
  color: string;
  opacity: number;
  onColorChange: (hex: string) => void;
  onOpacityChange: (v: number) => void;
  /** Show the eyedropper button. On by default. */
  showPipette?: boolean;
  stacked?: boolean;
};

export function ColorField({
  label,
  color,
  opacity,
  onColorChange,
  onOpacityChange,
  showPipette = true,
  stacked = false,
}: ColorFieldProps) {
  return (
    <FieldRow label={label} stacked={stacked}>
      <div className="flex gap-[4px] items-center">
        {/* Swatch + hex — bordered container, flex-1 */}
        <div className="flex-1 min-w-0 flex items-center h-[28px] rounded-[7px] border border-[#f2f2f3] overflow-hidden">
          <label className="relative h-full w-[22px] shrink-0 cursor-pointer">
            <div className="w-full h-full" style={{ backgroundColor: color }} />
            <input
              type="color"
              value={color}
              onChange={(e) => onColorChange(e.target.value)}
              className="absolute inset-0 opacity-0 cursor-pointer"
              aria-label={`${label} color`}
            />
          </label>
          <input
            type="text"
            value={color}
            onChange={(e) => onColorChange(e.target.value)}
            className="flex-1 min-w-0 h-full px-2 bg-transparent text-[10px] font-medium leading-[1.1] text-foreground outline-none lowercase"
          />
        </div>
        {/* Opacity pill */}
        <div className="flex items-center h-[28px] rounded-[7px] border border-[#f2f2f3] pl-1.5 pr-1 shrink-0">
          <input
            type="number"
            min={0}
            max={100}
            value={opacity}
            onChange={(e) => onOpacityChange(Number(e.target.value))}
            className="w-[22px] bg-transparent outline-none text-right text-[10px] font-medium leading-[1.1] text-foreground tabular-nums appearance-none [-moz-appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            aria-label={`${label} opacity`}
          />
          <span className="text-[10px] font-medium text-foreground ml-0.5">
            %
          </span>
        </div>
        {showPipette ? (
          <button
            type="button"
            className="h-[28px] w-[26px] flex items-center justify-center rounded-[7px] shrink-0 text-foreground hover:bg-accent transition-colors"
            aria-label="Pick color from screen"
          >
            <Pipette className="w-[14px] h-[14px]" strokeWidth={1.75} />
          </button>
        ) : null}
      </div>
    </FieldRow>
  );
}
