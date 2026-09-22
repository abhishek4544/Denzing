"use client";

import { ChevronDown } from "lucide-react";

type SizeControlsProps = {
  width: number;
  height: number;
  onWidthChange: (v: number) => void;
  onHeightChange: (v: number) => void;
  orientationLabel?: string;
  onOrientationClick?: () => void;
  unit?: string;
};

/**
 * Top-row size controls matching Figma 385:405.
 * Outer muted-grey pill containing labeled W/H input pills + separate orientation button.
 */
export function SizeControls({
  width,
  height,
  onWidthChange,
  onHeightChange,
  orientationLabel = "Custom",
  onOrientationClick,
  unit = "px",
}: SizeControlsProps) {
  return (
    <div className="flex items-center gap-6 p-[6px] rounded-[8px] bg-white border border-[#e6e6e6]">
      <div className="flex items-center gap-[5px]">
        <DimensionField
          label="W"
          value={width}
          onChange={onWidthChange}
          unit={unit}
        />
        <DimensionField
          label="H"
          value={height}
          onChange={onHeightChange}
          unit={unit}
        />
      </div>
      <button
        type="button"
        onClick={onOrientationClick}
        className="flex items-center gap-2 px-3 py-2 rounded-[8px] bg-white text-[12px] font-medium text-[#101010] leading-none tracking-[-0.12px] hover:bg-white/70 transition-colors"
      >
        <span>{orientationLabel}</span>
        <ChevronDown className="w-[10px] h-[10px]" strokeWidth={2} />
      </button>
    </div>
  );
}

function DimensionField({
  label,
  value,
  onChange,
  unit,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  unit: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="p-1 text-[12px] font-semibold text-black tracking-[-0.12px]">
        {label}
      </span>
      <div className="flex items-center h-[30px] px-[10px] rounded-[6px] bg-[#f2f2f7] border border-[#f2f2f3]">
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          aria-label={`${label} in ${unit}`}
          className="w-[32px] mr-1 bg-transparent outline-none text-right text-[12px] font-medium text-black leading-[1.1] tabular-nums appearance-none [-moz-appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
        <span className="text-[12px] font-medium text-black leading-[1.1]">
          {unit}
        </span>
      </div>
    </div>
  );
}
