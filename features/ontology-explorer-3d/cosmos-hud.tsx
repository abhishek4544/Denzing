"use client";

import { useEffect, useState } from "react";

/** Restrained tech HUD for the Cosmos 3D (layered) view — corner brackets,
 *  live coordinate readouts, scanline, grain. */
export function CosmosHud({
  nodeCount,
  edgeCount,
  viewMode,
}: {
  nodeCount: number;
  edgeCount: number;
  viewMode: string;
}) {
  const [clock, setClock] = useState(0);
  const [coord, setCoord] = useState<[number, number, number]>([0, 0, 0]);

  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const tick = () => {
      const t = (performance.now() - start) / 1000;
      setClock(t);
      setCoord([
        Math.sin(t * 0.11) * 6.28,
        Math.cos(t * 0.09) * 4.41,
        Math.sin(t * 0.14 + 1.57) * 5.02,
      ]);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const c = (n: number) => n.toFixed(2).padStart(6, " ");
  const uptime = formatUptime(clock);

  return (
    <div
      className="pointer-events-none absolute inset-0"
      aria-hidden="true"
      style={{
        fontFamily:
          "var(--font-geist-mono), ui-monospace, Menlo, Monaco, monospace",
      }}
    >
      <Bracket className="top-2 left-2" corner="tl" />
      <Bracket className="top-2 right-2" corner="tr" />
      <Bracket className="bottom-2 left-2" corner="bl" />
      <Bracket className="bottom-2 right-2" corner="br" />

      <div className="absolute top-3 left-5 text-white/55" style={hudTextStyle}>
        <div>◇ POTATOO / ONTOLOGY · {viewMode}</div>
        <div className="text-white/35 mt-0.5">
          FIXTURE · REVENUE · SNAPSHOT V1
        </div>
      </div>

      <div className="absolute top-3 right-5 text-white/55 text-right" style={hudTextStyle}>
        <div>
          N{String(nodeCount).padStart(3, "0")} · L
          {String(edgeCount).padStart(3, "0")} · Z05
        </div>
        <div className="text-white/35 mt-0.5">UPTIME {uptime}</div>
      </div>

      <div
        className="absolute bottom-3 left-5 text-white/55 tabular-nums"
        style={hudTextStyle}
      >
        <div>
          Δ X{c(coord[0])}&nbsp;&nbsp;Y{c(coord[1])}&nbsp;&nbsp;Z{c(coord[2])}
        </div>
        <div className="text-white/35 mt-0.5">
          λ = {(clock * 0.1).toFixed(2)}&nbsp;&nbsp;θ = {((clock * 6) % 360).toFixed(1)}°
        </div>
      </div>

      <div
        className="absolute bottom-3 right-5 text-white/55 text-right"
        style={hudTextStyle}
      >
        <div>
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400/80 mr-1.5 align-middle animate-pulse" />
          PIPELINE · ONLINE
        </div>
        <div className="text-white/35 mt-0.5">R3F · WEBGL2 · ACES</div>
      </div>

      <div
        className="absolute top-8 left-1/2 -translate-x-1/2 text-white/25"
        style={{ ...hudTextStyle, fontSize: "9px", letterSpacing: "0.35em" }}
      >
        · · · · TARGETING · · · ·
      </div>

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
              "linear-gradient(to right, transparent 0%, rgba(255,255,255,0.18) 50%, transparent 100%)",
            boxShadow: "0 0 12px rgba(255,255,255,0.08)",
          }}
        />
      </div>

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

const hudTextStyle: React.CSSProperties = {
  fontSize: "10px",
  fontWeight: 500,
  letterSpacing: "0.16em",
  textTransform: "uppercase",
  lineHeight: 1.35,
};

function formatUptime(seconds: number) {
  const s = Math.floor(seconds);
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}

function Bracket({
  className,
  corner,
}: {
  className: string;
  corner: "tl" | "tr" | "bl" | "br";
}) {
  const size = 22;
  const stroke = 1;
  const color = "rgba(255,255,255,0.45)";

  const style1: React.CSSProperties = {
    width: size,
    height: stroke,
    background: color,
    position: "absolute",
  };
  const style2: React.CSSProperties = {
    width: stroke,
    height: size,
    background: color,
    position: "absolute",
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
