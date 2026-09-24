import { Children, cloneElement, isValidElement, useState, type ReactNode } from "react";
import type { LayerConcept } from "./defaults";

const layerSections: Partial<Record<LayerConcept, readonly string[]>> = {
  sparkle: ["Sparkle"],
  agent: ["Agent", "Platforms"],
  box: ["Data Foundation (Box)"],
  cloud: ["Cloud"],
  terrain: ["Terrain"],
  uniform: ["Deformation"],
  data: ["Data Foundation (Box)"],
  ontology: ["Agent", "Platforms"],
};

/** Keep the actual DOM/tab order aligned with the stack, including after dragging layers. */
export function LayerOrderedControls({ concepts, children }: { concepts: readonly LayerConcept[]; children: ReactNode }) {
  const [openTitle, setOpenTitle] = useState<string | null>(null);
  const order = [...new Set([
    "Preset", "Stack", "Camera",
    ...concepts.flatMap((concept) => layerSections[concept] ?? []),
    // Retain unused types after the active layers so their settings remain accessible.
    "Sparkle", "Agent", "Platforms", "Data Foundation (Box)", "Cloud", "Terrain", "Deformation",
    "Interlayer Fanout", "Colors", "Frame", "Glass", "Blur", "Cursor", "Idle Motion", "Post FX",
  ])];
  const rank = (child: ReactNode) => {
    if (!isValidElement<{ title?: string }>(child)) return order.length;
    const index = order.indexOf(child.props.title ?? "");
    return index < 0 ? order.length : index;
  };
  return Children.toArray(children).sort((a, b) => rank(a) - rank(b)).map((child) => {
    if (!isValidElement<{ title: string; open?: boolean; onOpenChange?: (open: boolean) => void }>(child)) return child;
    return cloneElement(child, { open: openTitle === child.props.title,
      onOpenChange: (open) => setOpenTitle(open ? child.props.title : null) });
  });
}
