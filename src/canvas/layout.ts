import dagre from '@dagrejs/dagre';
import type { Edge, Node } from '@xyflow/react';

const SIZE = {
  sm: { width: 180, height: 72 },
  md: { width: 230, height: 92 },
  lg: { width: 292, height: 116 },
} as const;

export function autoLayout<T extends Node>(
  nodes: T[],
  edges: Edge[],
  cardSize: keyof typeof SIZE,
  direction: 'LR' | 'TB' = 'LR',
): T[] {
  const graph = new dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
  const dimensions = SIZE[cardSize];
  graph.setGraph({ rankdir: direction, nodesep: 42, ranksep: 110, marginx: 80, marginy: 80 });

  for (const node of nodes) graph.setNode(node.id, { ...dimensions });
  for (const edge of edges) graph.setEdge(edge.source, edge.target);
  dagre.layout(graph);

  return nodes.map((node) => {
    const point = graph.node(node.id) as { x: number; y: number };
    return {
      ...node,
      position: {
        x: point.x - dimensions.width / 2,
        y: point.y - dimensions.height / 2,
      },
    };
  });
}
