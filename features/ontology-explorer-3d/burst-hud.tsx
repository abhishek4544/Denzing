"use client";

import { useEffect, useState } from "react";

/** Minimal HUD for the burst view — corner brackets, subtle scanline, grain.
 *  No decorative text; the ontology labels do all the talking. */
export function BurstHud() {
  const [clock, setClock] = useState(0);

  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const tick = () => {
      setClock((performance.now() - start) / 1000);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div
      className="pointer-events-none absolute inset-0 overflow-hidden"
      aria-hidden="true"
    >
      <Bracket className="top-2 left-2" corner="tl" />
      <Bracket className="top-2 right-2" corner="tr" />
      <Bracket className="bottom-2 left-2" corner="bl" />
      <Bracket className="bottom-2 right-2" corner="br" />

      {/* Slow scanline */}
      <div
        className="absolute inset-0 overflow-hidden"
        style={{
          maskImage:
            "linear-gradient(to bottom, transparent 0%, black 20%, black 80%, transparent 100%)",
        }}
      >
        <div
          className="absolute left-0 right-0 h-[1px]"
          style={{
            top: `${((clock * 6) % 105) - 5}%`,
            background:
              "linear-gradient(to right, transparent 0%, rgba(255,255,255,0.16) 50%, transparent 100%)",
            boxShadow: "0 0 12px rgba(255,255,255,0.06)",
          }}
        />
      </div>

      {/* Subtle grain */}
      <div
        className="absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            "radial-gradient(rgba(255,255,255,0.6) 0.5px, transparent 0.6px)",
          backgroundSize: "3px 3px",
          mixBlendMode: "screen",
        }}
      />
    </div>
  );
}

const ACCENT = "#ff6a1a";

function Bracket({
  className,
  corner,
}: {
  className: string;
  corner: "tl" | "tr" | "bl" | "br";
}) {
  const size = 22;
  const stroke = 1;
  const color = ACCENT;

  const style1: React.CSSProperties = {
    width: size,
    height: stroke,
    background: color,
    position: "absolute",
    opacity: 0.6,
  };
  const style2: React.CSSProperties = {
    width: stroke,
    height: size,
    background: color,
    position: "absolute",
    opacity: 0.6,
  };

  if (corner === "tl") {
    style1.top = 0;
    style1.left = 0;
    style2.top = 0;
    style2.left = 0;
  } else if (corner === "tr") {
    style1.top = 0;
    style1.right = 0;
    style2.top = 0;
    style2.right = 0;
  } else if (corner === "bl") {
    style1.bottom = 0;
    style1.left = 0;
    style2.bottom = 0;
    style2.left = 0;
  } else {
    style1.bottom = 0;
    style1.right = 0;
    style2.bottom = 0;
    style2.right = 0;
  }

  return (
    <div className={`absolute ${className}`} style={{ width: size, height: size }}>
      <div style={style1} />
      <div style={style2} />
    </div>
  );
}
