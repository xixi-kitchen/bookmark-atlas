export type ViewMode = 'grid' | 'canvas';
export type CardSize = 'sm' | 'md' | 'lg';

export type Point = { x: number; y: number };

export type CanvasLayout = {
  positions: Record<string, Point>;
  viewport?: { x: number; y: number; zoom: number };
};
