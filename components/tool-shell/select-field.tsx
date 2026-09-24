"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FieldRow } from "./field-row";

type Option<Value extends string> = {
  readonly value: Value;
  readonly label: string;
};

type SelectFieldProps<Value extends string> = {
  label: string;
  value: Value;
  options: readonly Option<Value>[];
  placeholder?: string;
  onChange: (v: Value) => void;
  /** Optional preview-on-hover: fires when the user's pointer enters/leaves
   *  a menu option (null on leave / dropdown close). */
  onOptionHover?: (v: Value | null) => void;
};

export function SelectField<Value extends string>({
  label,
  value,
  options,
  placeholder,
  onChange,
  onOptionHover,
}: SelectFieldProps<Value>) {
  return (
    <FieldRow label={label}>
      <Select
        value={value}
        onValueChange={(nextValue) => {
          if (nextValue !== null) onChange(nextValue as Value);
        }}
        onOpenChange={(open) => {
          if (!open) onOptionHover?.(null);
        }}
      >
        <SelectTrigger
          aria-label={label}
          className="!bg-muted !border-transparent !h-[28px] !w-full !rounded-[7px] !px-3.5 !py-0 !text-[10px] !font-medium !text-foreground !leading-[1.1] shadow-none"
          data-slot="select-trigger"
        >
          <SelectValue placeholder={placeholder}>{options.find((option) => option.value === value)?.label ?? placeholder ?? value}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem
              key={o.value}
              value={o.value}
              className="text-[10px]"
              onPointerEnter={
                onOptionHover ? () => onOptionHover(o.value) : undefined
              }
              onPointerLeave={
                onOptionHover ? () => onOptionHover(null) : undefined
              }
            >
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </FieldRow>
  );
}
