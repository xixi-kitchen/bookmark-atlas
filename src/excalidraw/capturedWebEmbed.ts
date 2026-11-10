import { convertToExcalidrawElements, getCommonBounds } from '@excalidraw/excalidraw';
import type { ExcalidrawElement, ExcalidrawEmbeddableElement } from '@excalidraw/excalidraw/element/types';
import { isEmbeddableCaptureUrl, normalizeEmbedCaptureUrl, type EmbedCaptureIntent } from '../capture/embedCaptureQueue';
import { getBookmarkElementData } from './bookmarkElements';
import { resolveWebEmbedUrl } from './WebEmbed';

export type CapturedWebEmbedChange = {
  elements: readonly ExcalidrawElement[];
  target: ExcalidrawElement | null;
  changed: boolean;
  outcome: 'added' | 'existing' | 'cancelled' | 'needs-review';
};

/** Request identity and the journaled target take precedence over URL reuse. */
export function buildCapturedWebEmbedChange(
  elements: readonly ExcalidrawElement[], intent: EmbedCaptureIntent,
): CapturedWebEmbedChange {
  if (!/^[\w-]{1,100}$/.test(intent.id) || intent.kind !== 'embed' || !isEmbeddableCaptureUrl(intent.url)) {
    throw new Error('invalid_embed_capture');
  }
  const unchanged = (target: ExcalidrawElement | null, outcome: CapturedWebEmbedChange['outcome']): CapturedWebEmbedChange => ({ elements, target, changed: false, outcome });
  const matches = (element: ExcalidrawElement) => element.type === 'embeddable'
    && !getBookmarkElementData(element) && isEmbeddableCaptureUrl(element.link)
    && normalizeEmbedCaptureUrl(element.link) === normalizeEmbedCaptureUrl(intent.url);
  const owns = (element: ExcalidrawElement) => element.customData?.bookmarkAtlas?.kind === 'web-embed'
    && element.customData.bookmarkAtlas.requestId === intent.id;

  if (intent.phase === 'planned') {
    const target = elements.find((element) => element.id === intent.target?.elementId);
    if (!target || !matches(target) || (intent.target?.mode === 'create' && !owns(target))) return unchanged(null, 'needs-review');
    return unchanged(target, target.isDeleted ? 'cancelled' : intent.target?.mode === 'create' ? 'added' : 'existing');
  }
  if (intent.phase !== 'ready') return unchanged(null, 'needs-review');
  const id = `embed-capture-${intent.id}`;
  const prior = elements.find((element) => element.id === id);
  if (prior) return matches(prior) && owns(prior)
    ? unchanged(prior, prior.isDeleted ? 'cancelled' : 'existing') : unchanged(null, 'needs-review');
  const existing = elements.find((element) => !element.isDeleted && matches(element));
  if (existing) return unchanged(existing, 'existing');

  const visible = elements.filter((element) => !element.isDeleted);
  const bounds = visible.length ? getCommonBounds(visible) : [0, 0, -64, 0];
  const resolved = new URL(resolveWebEmbedUrl(intent.url));
  const video = (resolved.hostname === 'www.youtube.com' && resolved.pathname.startsWith('/embed'))
    || (resolved.hostname === 'player.bilibili.com' && resolved.pathname === '/player.html')
    || (resolved.hostname === 'player.vimeo.com' && resolved.pathname.startsWith('/video/'));
  const [rectangle] = convertToExcalidrawElements([{
    type: 'rectangle', id, x: bounds[2]! + 64, y: bounds[1]!, width: 960, height: video ? 540 : 640,
    backgroundColor: '#ffffff', strokeColor: '#1b1b1f', fillStyle: 'solid', strokeWidth: 2,
    roughness: 0, roundness: { type: 3 }, link: intent.url,
    customData: { bookmarkAtlas: { kind: 'web-embed', requestId: intent.id, title: intent.title, url: intent.url } },
  }], { regenerateIds: false });
  const target = { ...rectangle, type: 'embeddable', frameId: null } as ExcalidrawEmbeddableElement;
  return { elements: [...elements, target], target, changed: true, outcome: 'added' };
}
