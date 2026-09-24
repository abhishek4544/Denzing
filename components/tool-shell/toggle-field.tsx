"use client";

import { FieldRow } from "./field-row";
import { useTick } from "@/lib/use-tick";

type ToggleFieldProps = {
  label: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  tick?: boolean;
};

export function ToggleField({
  label,
  checked,
  onCheckedChange,
  tick = true,
}: ToggleFieldProps) {
  const playTick = useTick(tick);
  return (
    <FieldRow label={label}>
      <div className="flex justify-end items-center pr-2 h-[28px]">
        <button
          type="button"
          role="switch"
          aria-checked={checked}
          onClick={() => {
            playTick();
            onCheckedChange(!checked);
          }}
          className={`relative h-[22px] w-[38px] rounded-full transition-colors ${
            checked ? "bg-foreground" : "bg-[#d1d1d6]"
          }`}
        >
          <span
            className={`absolute top-[2px] w-[18px] h-[18px] rounded-full bg-white shadow-[0_1px_2px_rgba(29,41,61,0.08)] transition-all ${
              checked ? "left-[18px]" : "left-[2px]"
            }`}
          />
        </button>
      </div>
    </FieldRow>
  );
}
