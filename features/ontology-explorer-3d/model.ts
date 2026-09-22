import {
  revenueEdges,
  revenueNodes,
  type OntologyEdge,
  type OntologyNode,
} from "./fixture";

export type ModelNode = OntologyNode & {
  /** Editable 2D-canvas position, independent from the fixed 3D position. */
  position2d: [number, number];
};

export type ModelEdge = OntologyEdge & {
  /** Optional user-authored label shown in the 2D view. */
  customLabel?: string;
};

export type ModelState = {
  nodes: Record<string, ModelNode>;
  edges: Record<string, ModelEdge>;
  /** Preserved insertion order so rendering is deterministic. */
  nodeOrder: string[];
  edgeOrder: string[];
};

export type ModelAction =
  | { type: "moveNode2d"; id: string; position: [number, number] }
  | { type: "addEdge"; edge: ModelEdge }
  | { type: "labelEdge"; id: string; label: string }
  | { type: "removeEdge"; id: string }
  | { type: "reset" };

/** Per-node 2D layout for the reference fixture. Screen space, center = (0,0). */
const KNOWN_POSITION_2D: Record<string, [number, number]> = {
  "et-customer": [-260, 260],
  "et-order": [-40, 260],
  "et-product": [180, 260],
  "c-001": [-380, 400],
  "c-002": [-300, 400],
  "c-003": [-220, 400],
  "o-001": [-100, 400],
  "o-002": [-20, 400],
  "o-003": [60, 400],
  "o-004": [140, 400],
  "m-revenue": [0, 60],
  "m-count": [-180, 60],
  "m-avg": [180, 60],
  "r-paid": [60, -100],
  "k-cancel": [240, -100],
  "a-analyst": [-20, -240],
  "out-report": [60, -380],
};

function derivePosition2d(node: OntologyNode): [number, number] {
  if (node.id in KNOWN_POSITION_2D) return KNOWN_POSITION_2D[node.id];
  // Fallback projection from the 3D layered layout.
  return [node.position[0] * 40, -node.position[1] * 40];
}

export function initialModelState(): ModelState {
  const nodes: Record<string, ModelNode> = {};
  const nodeOrder: string[] = [];
  for (const n of revenueNodes) {
    nodes[n.id] = { ...n, position2d: derivePosition2d(n) };
    nodeOrder.push(n.id);
  }
  const edges: Record<string, ModelEdge> = {};
  const edgeOrder: string[] = [];
  for (const e of revenueEdges) {
    edges[e.id] = { ...e };
    edgeOrder.push(e.id);
  }
  return { nodes, edges, nodeOrder, edgeOrder };
}

export function modelReducer(state: ModelState, action: ModelAction): ModelState {
  switch (action.type) {
    case "moveNode2d": {
      const node = state.nodes[action.id];
      if (!node) return state;
      return {
        ...state,
        nodes: {
          ...state.nodes,
          [action.id]: { ...node, position2d: action.position },
        },
      };
    }
    case "addEdge": {
      if (state.edges[action.edge.id]) return state;
      return {
        ...state,
        edges: { ...state.edges, [action.edge.id]: action.edge },
        edgeOrder: [...state.edgeOrder, action.edge.id],
      };
    }
    case "labelEdge": {
      const edge = state.edges[action.id];
      if (!edge) return state;
      return {
        ...state,
        edges: {
          ...state.edges,
          [action.id]: { ...edge, customLabel: action.label },
        },
      };
    }
    case "removeEdge": {
      if (!state.edges[action.id]) return state;
      const nextEdges = { ...state.edges };
      delete nextEdges[action.id];
      return {
        ...state,
        edges: nextEdges,
        edgeOrder: state.edgeOrder.filter((id) => id !== action.id),
      };
    }
    case "reset":
      return initialModelState();
    default:
      return state;
  }
}
