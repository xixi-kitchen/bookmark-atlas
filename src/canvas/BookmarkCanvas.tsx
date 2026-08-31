import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Background,
  BackgroundVariant,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  SelectionMode,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Edge,
  type Node,
  type Viewport,
} from '@xyflow/react';
import { Focus, LocateFixed, Network, RotateCcw, ZoomIn, ZoomOut } from 'lucide-react';
import type { BookmarkNode } from '../bookmarks/types';
import type { CanvasLayout, CardSize, Point } from '../types/ui';
import { BookmarkCanvasNode, type CanvasNodeData } from './BookmarkCanvasNode';
import { autoLayout } from './layout';
import { loadCanvasLayout, saveCanvasPositions, saveCanvasViewport } from './layoutStorage';

type Props = {
  roots: BookmarkNode[];
  cardSize: CardSize;
  onEdit: (node: BookmarkNode) => void;
  onDelete: (node: BookmarkNode) => void;
  onMove: (id: string, parentId: string, index?: number) => Promise<void> | void;
};

type BookmarkFlowNode = Node<CanvasNodeData, 'bookmark'>;

const nodeTypes = { bookmark: BookmarkCanvasNode };
const ZOOM_PRESETS = [0.25, 0.5, 0.75, 1] as const;

function toFlow(
  roots: BookmarkNode[],
  positions: Record<string, Point>,
  handlers: Pick<CanvasNodeData, 'onEdit' | 'onDelete' | 'onStructureMove'>,
) {
  const nodes: BookmarkFlowNode[] = [];
  const edges: Edge[] = [];

  const visit = (node: BookmarkNode, depth: number) => {
    if (node.parentId) {
      edges.push({
        id: `${node.parentId}:${node.id}`,
        source: node.parentId,
        target: node.id,
        className: 'bookmark-edge',
      });
    }
    nodes.push({
      id: node.id,
      type: 'bookmark',
      position: positions[node.id] ?? { x: depth * 310, y: nodes.length * 108 },
      data: { bookmark: node, ...handlers },
      selectable: true,
      draggable: !node.readonly,
    });
    for (const child of node.children ?? []) visit(child, depth + 1);
  };

  for (const root of roots) visit(root, 0);
  const ids = new Set(nodes.map((node) => node.id));
  return { nodes, edges: edges.filter((edge) => ids.has(edge.source) && ids.has(edge.target)) };
}

function BookmarkCanvasInner({ roots, cardSize, onEdit, onDelete, onMove }: Props) {
  const instance = useReactFlow<BookmarkFlowNode, Edge>();
  const positionsRef = useRef<Record<string, Point>>({});
  const initializedRef = useRef(false);
  const viewportSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [savedLayout, setSavedLayout] = useState<CanvasLayout | null>(null);
  const structureMove = useCallback(
    (id: string, parentId: string, index?: number) => void onMove(id, parentId, index),
    [onMove],
  );
  const handlers = useMemo(
    () => ({ onEdit, onDelete, onStructureMove: structureMove }),
    [onDelete, onEdit, structureMove],
  );
  const [nodes, setNodes, onNodesChange] = useNodesState<BookmarkFlowNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  useEffect(() => {
    let active = true;
    void loadCanvasLayout().then((saved) => active && setSavedLayout(saved));
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!savedLayout) return;
    const firstRender = !initializedRef.current;
    if (firstRender) positionsRef.current = savedLayout.positions;
    const flow = toFlow(roots, positionsRef.current, handlers);
    setNodes((current) => {
      if (firstRender) {
        const hasSavedPositions = flow.nodes.some((node) => Boolean(savedLayout.positions[node.id]));
        const initialNodes = hasSavedPositions ? flow.nodes : autoLayout(flow.nodes, flow.edges, cardSize);
        positionsRef.current = Object.fromEntries(initialNodes.map((node) => [node.id, node.position]));
        return initialNodes;
      }
      const currentPositions = Object.fromEntries(current.map((node) => [node.id, node.position]));
      return flow.nodes.map((node) => ({ ...node, position: currentPositions[node.id] ?? node.position }));
    });
    setEdges(flow.edges);
    if (firstRender) {
      initializedRef.current = true;
      queueMicrotask(() => {
        if (savedLayout.viewport) void instance.setViewport(savedLayout.viewport, { duration: 0 });
        else void instance.fitView({ padding: '80px', duration: 280 });
      });
    }
  }, [cardSize, handlers, instance, roots, savedLayout, setEdges, setNodes]);

  const persistPositions = useCallback(
    (nextNodes: BookmarkFlowNode[]) => {
      positionsRef.current = Object.fromEntries(nextNodes.map((node) => [node.id, node.position]));
      void saveCanvasPositions(positionsRef.current);
    },
    [],
  );

  const relayout = useCallback(() => {
    const next = autoLayout(nodes, edges, cardSize);
    setNodes(next);
    persistPositions(next);
    queueMicrotask(() => void instance.fitView({ padding: '80px', duration: 420 }));
  }, [cardSize, edges, instance, nodes, persistPositions, setNodes]);

  const saveViewport = useCallback((viewport: Viewport) => {
    if (viewportSaveRef.current) clearTimeout(viewportSaveRef.current);
    viewportSaveRef.current = setTimeout(() => void saveCanvasViewport(viewport), 240);
  }, []);

  return (
    <section className="canvas-view" aria-label="书签层级画布">
      <ReactFlow<BookmarkFlowNode, Edge>
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeDragStop={() => persistPositions(instance.getNodes())}
        onMoveEnd={(_, viewport) => saveViewport(viewport)}
        minZoom={0.15}
        maxZoom={1.8}
        panOnScroll
        selectionOnDrag
        selectionMode={SelectionMode.Partial}
        onlyRenderVisibleElements
        nodesConnectable={false}
        fitView
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={1} className="canvas-background" />
        <MiniMap
          pannable
          zoomable
          nodeStrokeWidth={2}
          nodeColor={(node) => ((node.data as CanvasNodeData).bookmark.url ? 'var(--accent)' : 'var(--ink)')}
          maskColor="color-mix(in srgb, var(--paper) 78%, transparent)"
          className="canvas-minimap"
        />
        <div className="canvas-controls" role="toolbar" aria-label="画布缩放">
          <button onClick={() => void instance.zoomOut({ duration: 180 })} aria-label="缩小"><ZoomOut size={15} /></button>
          {ZOOM_PRESETS.map((zoom) => (
            <button key={zoom} onClick={() => void instance.zoomTo(zoom, { duration: 220 })}>{zoom * 100}%</button>
          ))}
          <button onClick={() => void instance.zoomIn({ duration: 180 })} aria-label="放大"><ZoomIn size={15} /></button>
          <span className="toolbar-divider" />
          <button onClick={() => void instance.fitView({ padding: '80px', duration: 320 })} title="适应全部"><Focus size={15} /></button>
          <button onClick={() => void instance.fitView({ nodes: nodes.filter((node) => node.selected), padding: '100px', duration: 320 })} title="适应选中"><LocateFixed size={15} /></button>
          <button onClick={relayout} title="重新排布"><Network size={15} /></button>
          <button onClick={() => void instance.setCenter(0, 0, { zoom: 0.5, duration: 320 })} title="回到根目录"><RotateCcw size={15} /></button>
        </div>
      </ReactFlow>
    </section>
  );
}

export function BookmarkCanvas(props: Props) {
  return (
    <ReactFlowProvider>
      <BookmarkCanvasInner {...props} />
    </ReactFlowProvider>
  );
}
