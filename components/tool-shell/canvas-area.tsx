"use client";

type CanvasAreaProps = {
  children: React.ReactNode;
};

/**
 * The absolutely-positioned canvas that fills the padded stage.
 * Preview-only — size controls now live in the topbar via SizeControls.
 */
export function CanvasArea({ children }: CanvasAreaProps) {
  return (
    <div className="absolute inset-0 flex items-center justify-center pt-20 pb-4 pl-4 pr-[356px] overflow-hidden">
      <div className="relative h-full w-full flex items-center justify-center min-h-0">
        {children}
      </div>
    </div>
  );
}
