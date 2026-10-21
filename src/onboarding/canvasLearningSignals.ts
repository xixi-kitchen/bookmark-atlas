import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types';
import { getBookmarkElementData } from '../excalidraw/bookmarkElements';
import type { LearningEvent } from './learningEvents';

type Position = { x: number; y: number };

/** Session-local evidence. Call persisted only after the scene save succeeds. */
export function createCanvasLearningSignals(emit: (event: LearningEvent) => void) {
  const pendingImportIds = new Set<string>();
  let pendingCommit: { event: LearningEvent; scene: string } | null = null;
  let pendingMoveScene: string | null = null;
  let pointerPositions: Map<string, Position> | null = null;

  return {
    queueImport(ids: readonly string[]) {
      for (const id of ids) pendingImportIds.add(id);
    },

    queueCommit(event: LearningEvent, expectedElements: readonly ExcalidrawElement[]) {
      if (event.type !== 'layout-applied' && event.type !== 'ai-applied') return;
      pendingCommit = {
        event: event.count === undefined ? { type: event.type } : { type: event.type, count: event.count },
        scene: structuralScene(expectedElements),
      };
    },

    persisted(elements: readonly ExcalidrawElement[]) {
      if (pendingImportIds.size > 0) {
        const liveIds = new Set(elements.filter(isLiveBookmark).map((element) => element.id));
        if ([...pendingImportIds].every((id) => liveIds.has(id))) {
          const count = pendingImportIds.size;
          pendingImportIds.clear();
          emit({ type: 'bookmark-added', count });
        }
      }
      if (pendingCommit && structuralScene(elements) === pendingCommit.scene) {
        const event = pendingCommit.event;
        pendingCommit = null;
        emit(event);
      }
      if (pendingMoveScene !== null && structuralScene(elements) === pendingMoveScene) {
        pendingMoveScene = null;
        emit({ type: 'bookmark-moved' });
      }
    },

    pointerDown(elements: readonly ExcalidrawElement[]) {
      pointerPositions = new Map(elements.filter(isLiveBookmark).map(({ id, x, y }) => [id, { x, y }]));
    },

    pointerUp(elements: readonly ExcalidrawElement[], selectedCount: number) {
      const positions = pointerPositions;
      pointerPositions = null;
      if (!positions) return;
      const moved = elements.some((element) => {
        const original = positions.get(element.id);
        return original && isLiveBookmark(element) && (original.x !== element.x || original.y !== element.y);
      });
      if (moved) pendingMoveScene = structuralScene(elements);
      if (Number.isSafeInteger(selectedCount) && selectedCount >= 2) {
        emit({ type: 'bookmarks-selected', count: selectedCount });
      }
    },

    cancelPointer() {
      pointerPositions = null;
      pendingMoveScene = null;
    },
  };
}

function isLiveBookmark(element: ExcalidrawElement): boolean {
  return !element.isDeleted && element.type === 'embeddable' && Boolean(getBookmarkElementData(element));
}

function structuralScene(elements: readonly ExcalidrawElement[]): string {
  const structures = elements.map(({ version: _version, versionNonce: _nonce, updated: _updated, index: _index, ...structure }) => structure);
  return JSON.stringify(canonicalValue(structures));
}

/** Object property insertion order is not part of the durable scene contract. */
function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right))
      .map(([key, field]) => [key, canonicalValue(field)]));
  }
  return value;
}
