"use client";

type FieldRowProps = {
  label: string;
  children: React.ReactNode;
  stacked?: boolean;
};

export function FieldRow({ label, children, stacked = false }: FieldRowProps) {
  if (stacked) {
    return (
      <div className="pl-3.5 pr-[7px] flex flex-col gap-2">
        <span className="text-[10px] font-medium text-muted-foreground tracking-[-0.1px]">
          {label}
        </span>
        <div>{children}</div>
      </div>
    );
  }
  return (
    <div className="flex items-center justify-between pl-3.5 pr-[7px] min-h-[28px]">
      <span
        className="text-[10px] font-medium text-muted-foreground tracking-[-0.1px] truncate min-w-0 pr-2"
        title={label}
      >
        {label}
      </span>
      <div className="w-[178px] shrink-0">{children}</div>
    </div>
  );
}
