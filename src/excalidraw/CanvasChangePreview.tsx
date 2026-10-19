import { sceneCoordsToViewportCoords } from '@excalidraw/excalidraw';
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types';
import type { AppState } from '@excalidraw/excalidraw/types';
import { t } from '../i18n';
import { getBookmarkElementData } from './bookmarkElements';
import type { OrganizationPlan } from '../ai/plan';

export function CanvasChangePreview({ elements, appState, onApply, onCancel, busy = false, aiPlan }: {
  elements: readonly ExcalidrawElement[];
  appState: AppState;
  onApply: () => void;
  onCancel: () => void;
  busy?: boolean;
  aiPlan?: OrganizationPlan;
}) {
  return (
    <>
      <svg className="atlas-change-preview" aria-hidden="true">
        {elements.filter((element) => !element.isDeleted).map((element) => {
          const point = sceneCoordsToViewportCoords({ sceneX: element.x, sceneY: element.y }, appState);
          const width = element.width * appState.zoom.value;
          const height = element.height * appState.zoom.value;
          const data = getBookmarkElementData(element);
          const label = element.type === 'frame' || element.type === 'magicframe' ? element.name : data?.title;
          return <g key={element.id} transform={`rotate(${element.angle * 180 / Math.PI},${point.x + width / 2},${point.y + height / 2})`}>
            <rect x={point.x} y={point.y} width={width} height={height} rx={6} />
            {label && width > 70 && <text x={point.x + 8} y={point.y + 17}>
              {Array.from(label).slice(0, Math.max(4, Math.floor(width / 8) - 2)).join('')}
            </text>}
          </g>;
        })}
      </svg>
      <aside className="atlas-preview-actions" role="dialog" aria-label={t('canvasChangePreview')}>
        <span>{t('canvasChangePreviewHint')}</span>
        {aiPlan && <details className="atlas-ai-review" open>
          <summary>{t('aiReviewPlan')}</summary>
          <div>{aiPlan.groups.map((group, index) => <section key={index}>
            <h3>{group.title}</h3>
            <ul>{group.items.map((item) => {
              const data = elements.find((element) => element.id === item.id);
              const bookmark = data && getBookmarkElementData(data);
              return <li key={item.id}><strong>{bookmark?.title || t('unnamedBookmark')}</strong>
                {item.presentation && <span>{t(item.presentation === 'icon' ? 'bookmarkDisplayIcon' : item.presentation === 'compact' ? 'bookmarkDisplayCompact' : 'bookmarkDisplayDetailed')}</span>}
                {item.description !== undefined && <p>{t('bookmarkDescription')}: {item.description || t('aiEmptyDescription')}</p>}
              </li>;
            })}</ul>
          </section>)}</div>
        </details>}
        <button className="secondary-button" type="button" disabled={busy} onClick={onCancel}>{t('cancel')}</button>
        <button className="primary-button" type="button" disabled={busy} onClick={onApply}>{busy ? t('saving') : t('applyChanges')}</button>
      </aside>
    </>
  );
}
