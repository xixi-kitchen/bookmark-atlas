import { convertToExcalidrawElements, getCommonBounds, newElementWith } from '@excalidraw/excalidraw';
import type { ExcalidrawElement, ExcalidrawFrameElement } from '@excalidraw/excalidraw/element/types';
import { getSelectedBookmarkIds, setBookmarkDescription, setBookmarkPresentation } from '../excalidraw/bookmarkCommands';
import { getBookmarkGridColumns } from '../excalidraw/bookmarkDisplay';
import { AIError, validateOrganizationPlan, type OrganizationPlan } from './plan';

const CARD_GAP = 24;
const FRAME_PADDING = 24;
const GROUP_GAP = 96;

/** Build an isolated scene proposal; storage, sync and undo remain owned by the caller. */
export function buildAIOrganizationPreview(
  elements: readonly ExcalidrawElement[],
  selectedIds: readonly string[],
  plan: OrganizationPlan,
  requestId: string,
): { elements: ExcalidrawElement[]; ids: string[] } {
  const validated = validateOrganizationPlan(plan, selectedIds);
  const editableIds = new Set(getSelectedBookmarkIds(elements, Object.fromEntries(selectedIds.map((id) => [id, true]))));
  const plannedIds = validated.groups.flatMap((group) => group.items.map((item) => item.id));
  if (!requestId.trim() || plannedIds.some((id) => !editableIds.has(id))) throw new AIError('invalid_plan');

  const existingIds = new Set(elements.map((element) => element.id));
  const frameIds = validated.groups.map((_, index) => `${requestId}-group-${index + 1}`);
  if (frameIds.some((id) => existingIds.has(id))) throw new AIError('invalid_plan');

  let styled = elements as ExcalidrawElement[];
  for (const group of validated.groups) {
    for (const item of group.items) {
      if (item.presentation !== undefined) styled = setBookmarkPresentation(styled, [item.id], item.presentation);
      if (item.description !== undefined) styled = setBookmarkDescription(styled, [item.id], item.description);
    }
  }
  const styledById = new Map(styled.map((element) => [element.id, element]));
  const groups = validated.groups.map((group) => {
    const cards = group.items.map((item) => styledById.get(item.id)!);
    const cardBounds = cards.map((card) => getCommonBounds([card]));
    const cardWidth = Math.max(...cardBounds.map((bound) => bound[2] - bound[0]));
    const cardHeight = Math.max(...cardBounds.map((bound) => bound[3] - bound[1]));
    const columns = getBookmarkGridColumns(cards.length, cardWidth, cardHeight, CARD_GAP);
    const rows = Math.ceil(cards.length / columns);
    return {
      title: group.title,
      cards,
      cardBounds,
      cardWidth,
      cardHeight,
      columns,
      width: FRAME_PADDING * 2 + columns * cardWidth + (columns - 1) * CARD_GAP,
      height: FRAME_PADDING * 2 + rows * cardHeight + (rows - 1) * CARD_GAP,
    };
  });

  const visible = elements.filter((element) => !element.isDeleted);
  const allBounds = getCommonBounds(visible);
  const selectedBounds = getCommonBounds(elements.filter((element) => editableIds.has(element.id)));
  const originX = allBounds[2] + GROUP_GAP;
  const originY = selectedBounds[1];
  const cellWidth = Math.max(...groups.map((group) => group.width));
  const cellHeight = Math.max(...groups.map((group) => group.height));
  const groupColumns = getBookmarkGridColumns(groups.length, cellWidth, cellHeight, GROUP_GAP);
  const frames: ExcalidrawFrameElement[] = [];
  const replacements = new Map<string, ExcalidrawElement>();

  groups.forEach((group, index) => {
    const frameId = frameIds[index]!;
    const x = originX + (index % groupColumns) * (cellWidth + GROUP_GAP);
    const y = originY + Math.floor(index / groupColumns) * (cellHeight + GROUP_GAP);
    frames.push(createOrganizationFrame(frameId, group.title, x, y, group.width, group.height));
    group.cards.forEach((card, cardIndex) => {
      const bounds = group.cardBounds[cardIndex]!;
      const cardX = x + FRAME_PADDING + (cardIndex % group.columns) * (group.cardWidth + CARD_GAP);
      const cardY = y + FRAME_PADDING + Math.floor(cardIndex / group.columns) * (group.cardHeight + CARD_GAP);
      replacements.set(card.id, newElementWith(card, {
        x: cardX + card.x - bounds[0],
        y: cardY + card.y - bounds[1],
        frameId,
      }));
    });
  });

  // Frame elements precede their children while all pre-existing scene order is retained.
  return {
    elements: [...frames, ...elements.map((element) => replacements.get(element.id) ?? element)],
    ids: [...frameIds, ...plannedIds],
  };
}

function createOrganizationFrame(
  id: string,
  title: string,
  x: number,
  y: number,
  width: number,
  height: number,
): ExcalidrawFrameElement {
  const [base] = convertToExcalidrawElements([{
    type: 'rectangle', id, x, y, width, height,
    backgroundColor: 'transparent', strokeColor: '#868e96',
    strokeWidth: 1, strokeStyle: 'dashed', roughness: 0,
  }], { regenerateIds: false });
  return { ...base, type: 'frame', name: title } as ExcalidrawFrameElement;
}
