"use client";

import { FieldRow } from "./field-row";

type TextFieldProps = {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  stacked?: boolean;
};

export function TextField({
  label,
  value,
  onChange,
  placeholder,
  stacked = false,
}: TextFieldProps) {
  return (
    <FieldRow label={label} stacked={stacked}>
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full h-[30px] rounded-[6px] bg-muted px-3.5 text-[11px] font-medium text-foreground leading-[1.1] outline-none focus:ring-2 focus:ring-ring/40"
      />
    </FieldRow>
  );
}
