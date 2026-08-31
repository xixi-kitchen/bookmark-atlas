import type { CanvasLayout, Point } from '../types/ui';

const KEY = 'bookmark-atlas:canvas-layout:v1';

const fallback: CanvasLayout = { positions: {} };

export async function loadCanvasLayout(): Promise<CanvasLayout> {
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    const result = await chrome.storage.local.get(KEY);
    return (result[KEY] as CanvasLayout | undefined) ?? fallback;
  }
  const value = globalThis.localStorage?.getItem(KEY);
  return value ? (JSON.parse(value) as CanvasLayout) : fallback;
}

export async function saveCanvasPositions(positions: Record<string, Point>): Promise<void> {
  const current = await loadCanvasLayout();
  const value = { ...current, positions };
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    await chrome.storage.local.set({ [KEY]: value });
  } else {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(value));
  }
}

export async function saveCanvasViewport(viewport: CanvasLayout['viewport']): Promise<void> {
  const current = await loadCanvasLayout();
  const value = { ...current, viewport };
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    await chrome.storage.local.set({ [KEY]: value });
  } else {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(value));
  }
}

export async function remapCanvasLayoutIds(idMap: Record<string, string>): Promise<void> {
  const current = await loadCanvasLayout();
  const positions = { ...current.positions };
  for (const [oldId, newId] of Object.entries(idMap)) {
    if (!positions[oldId]) continue;
    positions[newId] = positions[oldId];
    delete positions[oldId];
  }
  await saveCanvasPositions(positions);
}
