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
    id: "mesh-strata-3d",
    label: "Mesh Strata 3D",
    description:
      "Stacked wireframe wave layers with a crimson core in a gold cube frame.",
    href: "/tools/mesh-strata-3d",
  },
  {
    id: "security-grid-3d",
    label: "Security Grid 3D",
    description:
      "Security-themed visualizer: subdivided cube above a binary data floor, connected by wires.",
    href: "/tools/security-grid-3d",
  },
  {
    id: "autonomous-agents-3d",
    label: "Autonomous Agents 3D",
    description:
      "Autonomous agents workspace; starts from the Mesh Strata 3D template and will diverge over time.",
    href: "/tools/autonomous-agents-3d",
  },
  {
    id: "autonomous-agents-3d-lab",
    label: "Autonomous Agents Lab",
    description:
      "Flat convergence → decision → fanout diagram for Denzing autonomous agents; experimental sibling of Autonomous Agents 3D.",
    href: "/tools/autonomous-agents-3d-lab",
  },
  {
    id: "agentic-architecture",
    label: "Agentic Architecture",
    description:
      "Vertical exploded-isometric diagram: People, Platforms, Systems — three stacked wireframe modules with a red agentic infrastructure core.",
    href: "/tools/agentic-architecture",
  },
];

export const defaultTool = tools[0];

export function getTool(id: string) {
  return tools.find((tool) => tool.id === id);
}
