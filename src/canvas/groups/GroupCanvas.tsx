import { memo, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent, type FocusEvent, type MouseEvent } from 'react';
import {
  Background,
  BackgroundVariant,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  SelectionMode,
  useNodesState,
  useReactFlow,
  type Node,
  type NodeProps,
  type Viewport,
} from '@xyflow/react';
import { Focus, Folder, LocateFixed, MoreHorizontal, Network, RotateCcw, ZoomIn, ZoomOut } from 'lucide-react';
import type { BookmarkNode } from '../../bookmarks/types';
import { BookmarkCard } from '../../components/BookmarkCard';
import { BOOKMARK_DRAG_MIME, isFolder } from '../../components/views/viewTypes';
import type { CanvasLayout, CardSize, Point } from '../../types/ui';
import { loadCanvasLayout, saveCanvasPositions, saveCanvasViewport } from '../layoutStorage';

type Props = {
  roots: BookmarkNode[];
  cardSize: CardSize;
  selectedId?: string;
  onSelect?: (node: BookmarkNode) => void;
  onEdit: (node: BookmarkNode) => void;
  onDelete: (node: BookmarkNode) => void;
  onMove: (id: string, parentId: string, index?: number) => Promise<void> | void;
};

type MeasuredFolder = {
  folder: BookmarkNode;
  measurement: GroupMeasurement;
};

type GroupMeasurement = {
  width: number;
  height: number;
  bookmarkColumns: number;
  bookmarkRows: number;
  folderRows: MeasuredFolder[][];
};

type GroupData = {
  title: string;
  items: BookmarkNode[];
  group: BookmarkNode | null;
  measurement: GroupMeasurement;
  cardSize: CardSize;
  selectedId?: string;
  onSelect?: (node: BookmarkNode) => void;
  onEdit: (node: BookmarkNode) => void;
  onDelete: (node: BookmarkNode) => void;
  onMove: (id: string, parentId: string, index?: number) => void;
};

type GroupFlowNode = Node<GroupData, 'group'>;

const ZOOM_PRESETS = [0.1, 0.25, 0.5, 1] as const;
const TILE_SIZE: Record<CardSize, number> = { sm: 116, md: 148, lg: 180 };
const GROUP_HEADER_HEIGHT = 54;
const GROUP_PADDING = 12;
const GROUP_GAP = 10;
const GROUP_BORDER = 2;
const MIN_GROUP_CONTENT_WIDTH = 180;
const TOP_LEVEL_GAP = 80;

function GroupNodeComponent({ data, selected }: NodeProps) {
  const groupData = data as GroupData;
  const { title, items, group, measurement, cardSize, selectedId, onSelect, onEdit, onDelete, onMove } = groupData;

  const handleGroupDrop = (event: DragEvent<HTMLElement>) => {
    if (!group || group.readonlyReason === 'root' || group.readonlyReason === 'managed') return;
    const draggedId = event.dataTransfer.getData(BOOKMARK_DRAG_MIME);
    if (!draggedId || draggedId === group.id) return;
    event.preventDefault();
    event.stopPropagation();
    onMove(draggedId, group.id);
  };

  return (
    <section
      className={`group-node ${selected ? 'is-selected' : ''}`}
      style={{ width: measurement.width, height: measurement.height }}
      aria-label={`${title} 分组`}
      onDragOver={(event) => group && event.preventDefault()}
      onDrop={handleGroupDrop}
    >
      <header className="group-node__header">
        <div>
          <strong>{title || '未命名文件夹'}</strong>
          <span>
            {countNodes(items)} 项 · {measurement.bookmarkColumns ? `${measurement.bookmarkColumns} 列满铺` : '递归满铺'}
          </span>
        </div>
        <Folder size={18} aria-hidden="true" />
      </header>
      <div className="group-node__body nodrag">
        <GroupContents
          items={items}
          measurement={measurement}
          cardSize={cardSize}
          depth={0}
          selectedId={selectedId}
          onSelect={onSelect}
          onEdit={onEdit}
          onDelete={onDelete}
          onMove={onMove}
        />
      </div>
    </section>
  );
}

const GroupNode = memo(GroupNodeComponent);
const nodeTypes = { group: GroupNode };

function GroupContents({
  items,
  measurement,
  cardSize,
  depth,
  selectedId,
  onSelect,
  onEdit,
  onDelete,
  onMove,
}: {
  items: BookmarkNode[];
  measurement: GroupMeasurement;
  cardSize: CardSize;
  depth: number;
  selectedId?: string;
  onSelect?: (node: BookmarkNode) => void;
  onEdit: (node: BookmarkNode) => void;
  onDelete: (node: BookmarkNode) => void;
  onMove: (id: string, parentId: string, index?: number) => void;
}) {
  const bookmarks = items.filter((node) => !isFolder(node));
  const tileSize = TILE_SIZE[cardSize];

  return (
    <div className="group-contents">
      {bookmarks.length > 0 && (
        <div
          className="nested-bookmark-grid"
          role="list"
          aria-label="书签满铺网格"
          style={{
            '--bookmark-columns': measurement.bookmarkColumns,
            '--bookmark-tile-size': `${tileSize}px`,
          } as CSSProperties}
        >
          {bookmarks.map((node) => (
            <BookmarkCard
              key={node.id}
              node={node}
              cardSize={cardSize}
              className="bookmark-card--mosaic"
              selected={selectedId === node.id}
              onSelect={onSelect}
              onEdit={onEdit}
              onDelete={onDelete}
              onMove={onMove}
            />
          ))}
        </div>
      )}

      {measurement.folderRows.length > 0 && (
        <div className="nested-group-rows" aria-label="子文件夹分组">
          {measurement.folderRows.map((row, rowIndex) => (
            <div className="nested-group-row" key={`row-${rowIndex}`}>
              {row.map(({ folder, measurement: childMeasurement }) => (
                <NestedFolder
                  key={folder.id}
                  folder={folder}
                  measurement={childMeasurement}
                  cardSize={cardSize}
                  depth={depth + 1}
                  selectedId={selectedId}
                  onSelect={onSelect}
                  onEdit={onEdit}
                  onDelete={onDelete}
                  onMove={onMove}
                />
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function NestedFolder({
  folder,
  measurement,
  cardSize,
  depth,
  selectedId,
  onSelect,
  onEdit,
  onDelete,
  onMove,
}: {
  folder: BookmarkNode;
  measurement: GroupMeasurement;
  cardSize: CardSize;
  depth: number;
  selectedId?: string;
  onSelect?: (node: BookmarkNode) => void;
  onEdit: (node: BookmarkNode) => void;
  onDelete: (node: BookmarkNode) => void;
  onMove: (id: string, parentId: string, index?: number) => void;
}) {
  const children = folder.children ?? [];

  const beginFolderDrag = (event: DragEvent<HTMLElement>) => {
    if (folder.readonly) return;
    event.stopPropagation();
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData(BOOKMARK_DRAG_MIME, folder.id);
  };

  const handleDrop = (event: DragEvent<HTMLElement>) => {
    const draggedId = event.dataTransfer.getData(BOOKMARK_DRAG_MIME);
    if (!draggedId || draggedId === folder.id || folder.readonlyReason === 'managed') return;
    event.preventDefault();
    event.stopPropagation();
    onMove(draggedId, folder.id);
  };

  return (
    <section
      className={`nested-folder ${selectedId === folder.id ? 'is-selected' : ''}`}
      data-depth={depth}
      style={{ width: measurement.width, height: measurement.height }}
      aria-label={`${folder.title || '未命名文件夹'} 文件夹分组`}
      onDragOver={(event) => event.preventDefault()}
      onDrop={handleDrop}
    >
      <header className="nested-folder__header">
        <button
          type="button"
          className="nested-folder__identity"
          aria-label={`文件夹：${folder.title || '未命名文件夹'}`}
          draggable={!folder.readonly}
          onDragStart={beginFolderDrag}
          onClick={() => onSelect?.(folder)}
          onDoubleClick={() => !folder.readonly && onEdit(folder)}
          title={folder.title || '未命名文件夹'}
        >
          <Folder size={16} aria-hidden="true" />
          <span>{folder.title || '未命名文件夹'}</span>
          <small>{countNodes(children)} 项</small>
        </button>
        {!folder.readonly && <FolderActions folder={folder} onEdit={onEdit} onDelete={onDelete} />}
      </header>
      <div className="nested-folder__content">
        <GroupContents
          items={children}
          measurement={measurement}
          cardSize={cardSize}
          depth={depth}
          selectedId={selectedId}
          onSelect={onSelect}
          onEdit={onEdit}
          onDelete={onDelete}
          onMove={onMove}
        />
      </div>
    </section>
  );
}

function FolderActions({
  folder,
  onEdit,
  onDelete,
}: {
  folder: BookmarkNode;
  onEdit: (node: BookmarkNode) => void;
  onDelete: (node: BookmarkNode) => void;
}) {
  const [open, setOpen] = useState(false);

  const run = (event: MouseEvent, action: (node: BookmarkNode) => void) => {
    event.stopPropagation();
    setOpen(false);
    action(folder);
  };

  return (
    <div
      className={`nested-folder__actions nodrag ${open ? 'is-open' : ''}`}
      onBlur={(event: FocusEvent<HTMLDivElement>) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      <button
        type="button"
        aria-label={`${folder.title || '未命名文件夹'} 的操作`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(event) => {
          event.stopPropagation();
          setOpen((value) => !value);
        }}
      >
        <MoreHorizontal size={16} />
      </button>
      {open && (
        <div className="nested-folder__menu" role="menu">
          <button type="button" role="menuitem" onClick={(event) => run(event, onEdit)}>编辑</button>
          <button type="button" role="menuitem" className="is-danger" onClick={(event) => run(event, onDelete)}>删除</button>
        </div>
      )}
    </div>
  );
}

function GroupCanvasInner({ roots, cardSize, selectedId, onSelect, onEdit, onDelete, onMove }: Props) {
  const instance = useReactFlow<GroupFlowNode>();
  const positionsRef = useRef<Record<string, Point>>({});
  const viewportSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initializedRef = useRef(false);
  const [savedLayout, setSavedLayout] = useState<CanvasLayout | null>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState<GroupFlowNode>([]);

  const move = useCallback((id: string, parentId: string, index?: number) => void onMove(id, parentId, index), [onMove]);

  useEffect(() => {
    let active = true;
    void loadCanvasLayout().then((saved) => active && setSavedLayout(saved));
    return () => {
      active = false;
    };
  }, []);

  const flowNodes = useMemo(
    () => buildGroupNodes(roots, positionsRef.current, { cardSize, selectedId, onSelect, onEdit, onDelete, onMove: move }),
    [cardSize, move, onDelete, onEdit, onSelect, roots, selectedId],
  );

  useEffect(() => {
    if (!savedLayout) return;
    const firstRender = !initializedRef.current;
    if (firstRender) positionsRef.current = savedLayout.positions;
    setNodes((current) => {
      const currentPositions = Object.fromEntries(current.map((node) => [node.id, node.position]));
      const next = flowNodes.map((node) => ({
        ...node,
        position: firstRender ? node.position : currentPositions[node.id] ?? node.position,
      }));
      if (firstRender) positionsRef.current = Object.fromEntries(next.map((node) => [node.id, node.position]));
      return next;
    });
    if (firstRender) {
      initializedRef.current = true;
      queueMicrotask(() => {
        if (savedLayout.viewport) void instance.setViewport(savedLayout.viewport, { duration: 0 });
        else void instance.fitView({ padding: '60px', duration: 280 });
      });
    }
  }, [flowNodes, instance, savedLayout, setNodes]);

  const persistPositions = useCallback((nextNodes: GroupFlowNode[]) => {
    positionsRef.current = Object.fromEntries(nextNodes.map((node) => [node.id, node.position]));
    void saveCanvasPositions(positionsRef.current);
  }, []);

  const relayout = useCallback(() => {
    const automatic = calculateTopLevelPositions(nodes.map((node) => node.data.measurement));
    const next = nodes.map((node, index) => ({ ...node, position: automatic[index]! }));
    setNodes(next);
    persistPositions(next);
    queueMicrotask(() => void instance.fitView({ padding: '60px', duration: 360 }));
  }, [instance, nodes, persistPositions, setNodes]);

  const saveViewport = useCallback((viewport: Viewport) => {
    if (viewportSaveRef.current) clearTimeout(viewportSaveRef.current);
    viewportSaveRef.current = setTimeout(() => void saveCanvasViewport(viewport), 240);
  }, []);

  return (
    <section className="group-canvas" aria-label="书签分组画布">
      <ReactFlow<GroupFlowNode>
        nodes={nodes}
        edges={[]}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onNodeDragStop={() => persistPositions(instance.getNodes())}
        onMoveEnd={(_, viewport) => saveViewport(viewport)}
        minZoom={0.05}
        maxZoom={1.4}
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
          nodeColor="var(--accent)"
          maskColor="color-mix(in srgb, var(--paper) 78%, transparent)"
          className="canvas-minimap"
        />
        <div className="group-canvas-controls" role="toolbar" aria-label="分组画布缩放">
          <button onClick={() => void instance.zoomOut({ duration: 180 })} aria-label="缩小"><ZoomOut size={15} /></button>
          {ZOOM_PRESETS.map((zoom) => (
            <button key={zoom} onClick={() => void instance.zoomTo(zoom, { duration: 220 })}>{zoom * 100}%</button>
          ))}
          <button onClick={() => void instance.zoomIn({ duration: 180 })} aria-label="放大"><ZoomIn size={15} /></button>
          <span className="toolbar-divider" />
          <button onClick={() => void instance.fitView({ padding: '60px', duration: 320 })} title="适应全部"><Focus size={15} /></button>
          <button onClick={() => void instance.fitView({ nodes: nodes.filter((node) => node.selected), padding: '80px', duration: 320 })} title="适应选中"><LocateFixed size={15} /></button>
          <button onClick={relayout} title="重新排布"><Network size={15} /></button>
          <button onClick={() => void instance.setCenter(0, 0, { zoom: 0.25, duration: 320 })} title="回到根目录"><RotateCcw size={15} /></button>
        </div>
      </ReactFlow>
    </section>
  );
}

export function GroupCanvas(props: Props) {
  return (
    <ReactFlowProvider>
      <GroupCanvasInner {...props} />
    </ReactFlowProvider>
  );
}

function buildGroupNodes(
  roots: BookmarkNode[],
  positions: Record<string, Point>,
  handlers: Omit<GroupData, 'title' | 'items' | 'group' | 'measurement'>,
): GroupFlowNode[] {
  const loose = roots.filter((node) => !isFolder(node));
  const folders = roots.filter(isFolder);
  const groups: Array<{ id: string; title: string; items: BookmarkNode[]; group: BookmarkNode | null }> = [
    ...(loose.length ? [{ id: 'group:top-level', title: '顶层书签', items: loose, group: null }] : []),
    ...folders.map((folder) => ({ id: folder.id, title: folder.title, items: folder.children ?? [], group: folder })),
  ];
  const measuredGroups = groups.map((group) => ({ ...group, measurement: measureGroup(group.items, handlers.cardSize) }));
  const automaticPositions = calculateTopLevelPositions(measuredGroups.map((group) => group.measurement));

  return measuredGroups.map((group, index) => ({
    id: group.id,
    type: 'group',
    position: positions[group.id] ?? automaticPositions[index]!,
    data: { ...group, ...handlers },
    width: group.measurement.width,
    height: group.measurement.height,
    style: { width: group.measurement.width, height: group.measurement.height },
    draggable: true,
    selectable: true,
  }));
}

export function measureGroup(items: BookmarkNode[], cardSize: CardSize): GroupMeasurement {
  const bookmarks = items.filter((node) => !isFolder(node));
  const folders = items.filter(isFolder);
  const tileSize = TILE_SIZE[cardSize];
  const bookmarkColumns = balancedColumns(bookmarks.length);
  const bookmarkRows = bookmarkColumns ? Math.ceil(bookmarks.length / bookmarkColumns) : 0;
  const bookmarkWidth = bookmarkColumns
    ? bookmarkColumns * tileSize + (bookmarkColumns - 1) * GROUP_GAP
    : 0;
  const bookmarkHeight = bookmarkRows
    ? bookmarkRows * tileSize + (bookmarkRows - 1) * GROUP_GAP
    : 0;
  const measuredFolders = folders.map((folder) => ({
    folder,
    measurement: measureGroup(folder.children ?? [], cardSize),
  }));
  const folderRows = packFolderRows(measuredFolders);
  const folderWidth = folderRows.reduce(
    (maximum, row) => Math.max(maximum, rowWidth(row)),
    0,
  );
  const folderHeight = folderRows.reduce(
    (total, row, index) => total + rowHeight(row) + (index ? GROUP_GAP : 0),
    0,
  );
  const contentWidth = Math.max(MIN_GROUP_CONTENT_WIDTH, bookmarkWidth, folderWidth);
  const sectionGap = bookmarkHeight > 0 && folderHeight > 0 ? GROUP_GAP : 0;
  const contentHeight = bookmarkHeight + sectionGap + folderHeight;

  return {
    width: contentWidth + GROUP_PADDING * 2 + GROUP_BORDER,
    height: GROUP_HEADER_HEIGHT + contentHeight + GROUP_PADDING * 2 + GROUP_BORDER,
    bookmarkColumns,
    bookmarkRows,
    folderRows,
  };
}

function balancedColumns(count: number): number {
  if (count <= 0) return 0;
  return Math.ceil(Math.sqrt(count));
}

function packFolderRows(folders: MeasuredFolder[]): MeasuredFolder[][] {
  if (folders.length === 0) return [];
  const totalArea = folders.reduce(
    (area, item) => area + (item.measurement.width + GROUP_GAP) * (item.measurement.height + GROUP_GAP),
    0,
  );
  const widest = Math.max(...folders.map((item) => item.measurement.width));
  const targetWidth = Math.max(widest, Math.sqrt(totalArea));
  const rows: MeasuredFolder[][] = [];
  let current: MeasuredFolder[] = [];

  for (const item of folders) {
    const nextWidth = rowWidth(current) + (current.length ? GROUP_GAP : 0) + item.measurement.width;
    if (current.length > 0 && nextWidth > targetWidth) {
      rows.push(current);
      current = [item];
    } else {
      current.push(item);
    }
  }
  if (current.length > 0) rows.push(current);
  return rows;
}

function rowWidth(row: MeasuredFolder[]): number {
  return row.reduce((width, item, index) => width + item.measurement.width + (index ? GROUP_GAP : 0), 0);
}

function rowHeight(row: MeasuredFolder[]): number {
  return row.reduce((height, item) => Math.max(height, item.measurement.height), 0);
}

function calculateTopLevelPositions(measurements: GroupMeasurement[]): Point[] {
  if (measurements.length === 0) return [];
  const totalArea = measurements.reduce((area, item) => area + item.width * item.height, 0);
  const widest = Math.max(...measurements.map((item) => item.width));
  const targetWidth = Math.max(widest, Math.sqrt(totalArea) * 1.25);
  const positions: Point[] = [];
  let x = 0;
  let y = 0;
  let rowHeightValue = 0;

  for (const measurement of measurements) {
    if (x > 0 && x + measurement.width > targetWidth) {
      x = 0;
      y += rowHeightValue + TOP_LEVEL_GAP;
      rowHeightValue = 0;
    }
    positions.push({ x, y });
    x += measurement.width + TOP_LEVEL_GAP;
    rowHeightValue = Math.max(rowHeightValue, measurement.height);
  }

  return positions;
}

function countNodes(nodes: BookmarkNode[]): number {
  return nodes.reduce((sum, node) => sum + 1 + countNodes(node.children ?? []), 0);
}
