"use client";

import { useState } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { FieldRow } from "@/components/tool-shell";

export function CustomAspectDialog({ width, height, onApply, onClose }: {
  width: number; height: number; onApply: (width: number, height: number) => void; onClose: () => void;
}) {
  const [w, setW] = useState(String(width));
  const [h, setH] = useState(String(height));
  const [error, setError] = useState("");
  return <Dialog.Root open onOpenChange={(open) => { if (!open) onClose(); }}>
    <Dialog.Portal>
      <Dialog.Backdrop className="fixed inset-0 z-40 bg-black/20" />
      <Dialog.Popup className="fixed left-1/2 top-1/2 z-50 w-[360px] max-w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 rounded-[10px] border border-border bg-card p-4 text-foreground">
        <Dialog.Title className="text-[12px] font-medium">Custom aspect ratio</Dialog.Title>
        <Dialog.Description className="my-3 text-[10px] text-muted-foreground">Enter proportions, such as 16 × 10 or 1920 × 1200. Export resolution is selected separately.</Dialog.Description>
        <form onSubmit={(event) => {
          event.preventDefault();
          const a = Number(w), b = Number(h);
          if (![a, b].every((value) => Number.isFinite(value) && value > 0 && value <= 10000) || a / b < 0.05 || a / b > 20) {
            setError("Use values above 0 and up to 10,000, with a ratio between 1:20 and 20:1."); return;
          }
          onApply(a, b);
        }} className="space-y-2">
          {([['Width', w, setW], ['Height', h, setH]] as const).map(([label, value, setValue]) => <FieldRow key={label} label={label}>
            <input aria-label={`Custom ratio ${label.toLowerCase()}`} type="number" min="0.001" max="10000" step="any" required value={value}
              onChange={(event) => { setValue(event.target.value); setError(""); }}
              className="h-[28px] w-full rounded-[7px] bg-muted px-3.5 text-[10px] outline-none focus:ring-2 focus:ring-ring/40" />
          </FieldRow>)}
          {error && <p role="alert" className="text-[10px] text-destructive">{error}</p>}
          <div className="flex justify-end gap-2 pt-3">
            <Dialog.Close className="h-[28px] rounded-[7px] bg-muted px-3 text-[10px]">Cancel</Dialog.Close>
            <button type="submit" className="h-[28px] rounded-[7px] bg-foreground px-3 text-[10px] text-background">Apply ratio</button>
          </div>
        </form>
      </Dialog.Popup>
    </Dialog.Portal>
  </Dialog.Root>;
}
