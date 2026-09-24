export type ToolDefinition = {
  id: string;
  label: string;
  description: string;
  href: string;
};

/**
 * The single source of truth for tools available in Potatoo Tool.
 * Add a definition here and a matching route implementation to introduce a
 * future tool without changing the shared layout.
 */
export const tools: readonly ToolDefinition[] = [
  {
    id: "ontology-explorer-3d",
    label: "Ontology Explorer 3D",
    description:
      "Hyper-realistic 3D node-link view of the Revenue ontology fixture.",
    href: "/tools/ontology-explorer-3d",
  },
  {
    id: "mesh-strata-3d",
    label: "Mesh Strata 3D",
    description:
      "Stacked wireframe wave layers with a crimson core in a gold cube frame.",
    href: "/tools/mesh-strata-3d",
  },
];

export const defaultTool = tools[0];

export function getTool(id: string) {
  return tools.find((tool) => tool.id === id);
}
