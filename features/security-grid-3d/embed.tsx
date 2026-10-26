"use client";

import { lazy, Suspense, useEffect, useRef, useState, type CSSProperties } from "react";
import type { SecurityGrid3DViewerProps } from "./viewer";

const Viewer = lazy(() => import("./viewer"));

/** Load the WebGL bundle only as the illustration approaches the viewport. */
export function SecurityGrid3DEmbed({
  style,
  ...props
}: SecurityGrid3DViewerProps & { style?: CSSProperties }) {
  const host = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setReady(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" },
    );
    if (host.current) observer.observe(host.current);
    return () => observer.disconnect();
  }, []);
  return (
    <div
      ref={host}
      role="img"
      aria-label="Animated Security Grid 3D"
      style={{
        width: "100%",
        height: "100%",
        background: props.settings?.backgroundColor ?? "#091f0f",
        ...style,
      }}
    >
      {ready && (
        <Suspense fallback={null}>
          <Viewer {...props} />
        </Suspense>
      )}
    </div>
  );
}
