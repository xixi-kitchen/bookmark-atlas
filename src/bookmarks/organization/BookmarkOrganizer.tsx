import { useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, Download, FolderTree, History, Sparkles, Trash2, X } from 'lucide-react';
import type { BookmarkTree } from '../types';
import { getUiLanguage } from '../../i18n';
import { loadLocalAISettings, requestAIOriginPermission, type LocalAISettings } from '../../ai/client';
import { aiErrorMessage } from '../../ai/errorMessage';
import { generateNativeOrganization, nativeFolderChoices, prepareNativeOrganization } from './ai';
import { acknowledgeOrganizationStep, adoptHistoricalBookmarks, executeOrganization, forgetOrganizationHistory, loadOrganizationHistory, restoreOrganization, resumeOrganization, subscribeOrganizationHistory } from './client';
import { loadCaptureOrigins, type CaptureOrigin } from './provenance';
import type { NativeJournal, NativeMode, NativeOperation, NativeOrganizationPlan } from './types';
import './Organization.css';

type Scope = 'pending' | 'all' | 'folder' | 'selected';
type Props = { tree: BookmarkTree; selectedIds?: string[]; initialFolderId?: string; onClose: () => void; onOpenAISettings: () => void; onOpenGuide?: () => void; onChanged?: () => void };

function descendants(tree: BookmarkTree, id: string): string[] {
  const found = new Set<string>();
  const pending = [id];
  while (pending.length) {
    const current = pending.pop()!;
    if (found.has(current) || !tree.nodes[current]) continue;
    found.add(current);
    pending.push(...(tree.nodes[current]!.childIds ?? []));
  }
  return [...found];
}

function pathFor(tree: BookmarkTree, id?: string): string {
  const names: string[] = [];
  const visited = new Set<string>();
  while (id && tree.nodes[id] && !visited.has(id)) {
    visited.add(id);
    const node = tree.nodes[id]!;
    if (node.title) names.unshift(node.title);
    id = node.parentId;
  }
  return names.join(' / ');
}

function chosenPlan(plan: NativeOrganizationPlan, keys: Set<string>): NativeOrganizationPlan {
  return {
    ...plan,
    operations: plan.operations.filter(operation => keys.has(operation.key)
      && (operation.type !== 'move' || operation.parentId !== plan.baseline.nodes[operation.id]?.parentId)),
  };
}

function missingDependency(plan: NativeOrganizationPlan, selected: Set<string>): boolean {
  return plan.operations.some(operation => selected.has(operation.key)
    && 'parentId' in operation && operation.parentId.startsWith('new:')
    && !plan.operations.some(parent => parent.type === 'create-folder'
      && parent.id === operation.parentId && selected.has(parent.key)));
}

export function BookmarkOrganizer({ tree, selectedIds = [], initialFolderId, onClose, onOpenAISettings, onOpenGuide, onChanged }: Props) {
  const zh = getUiLanguage() === 'zh-CN';
  const text = (en: string, chinese: string) => zh ? chinese : en;
  const [scope, setScope] = useState<Scope>('pending');
  const [folderId, setFolderId] = useState(initialFolderId ?? '');
  const [mode, setMode] = useState<NativeMode>('daily');
  const [step, setStep] = useState<'scope' | 'method' | 'review' | 'done'>('scope');
  const [method, setMethod] = useState<'ai' | 'manual'>('ai');
  const [organizationRootId, setOrganizationRootId] = useState(() => tree.orderedIds.find(id => tree.nodes[id]?.folderType === 'other' || id === '2') ?? '');
  const [excludedIds, setExcludedIds] = useState<string[]>([]);
  const [instruction, setInstruction] = useState('');
  const [cleanup, setCleanup] = useState(false);
  const [consent, setConsent] = useState(false);
  const [consentScope, setConsentScope] = useState('');
  const [manualTarget, setManualTarget] = useState('');
  const [origins, setOrigins] = useState<CaptureOrigin[]>([]);
  const [history, setHistory] = useState<NativeJournal[]>([]);
  const [historyVisible, setHistoryVisible] = useState(false);
  const [reviewingStep, setReviewingStep] = useState('');
  const [clearingRecord, setClearingRecord] = useState('');
  const [plan, setPlan] = useState<NativeOrganizationPlan | null>(null);
  const [previewKind, setPreviewKind] = useState<'all' | 'bookmarks' | 'folders'>('all');
  const [selected, setSelected] = useState(new Set<string>());
  const [settings, setSettings] = useState<LocalAISettings | null>(null);
  const [busy, setBusy] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const request = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const active = useRef(false);
  const dialog = useRef<HTMLElement>(null);
  const trigger = useRef(document.activeElement);

  async function refreshLocal() {
    const [records, captures] = await Promise.all([loadOrganizationHistory(), loadCaptureOrigins()]);
    if (mounted.current) { setHistory(records); setOrigins(captures); }
  }
  useEffect(() => {
    mounted.current = true;
    dialog.current?.focus();
    void refreshLocal().catch(() => { });
    void loadLocalAISettings().then(value => { if (mounted.current) setSettings(value); }).catch(() => { });
    const stop = subscribeOrganizationHistory(() => { void refreshLocal().catch(() => { }); });
    return () => {
      mounted.current = false;
      request.current?.abort();
      stop();
      if (trigger.current instanceof HTMLElement && trigger.current.isConnected) trigger.current.focus();
    };
  }, []);

  const excluded = useMemo(() => new Set(excludedIds.flatMap(id => descendants(tree, id))), [tree, excludedIds]);
  const folders = useMemo(() => nativeFolderChoices(tree, excludedIds), [tree, excludedIds]);
  const scopeIds = useMemo(() => {
    let ids: string[];
    if (scope === 'all') ids = tree.orderedIds;
    else if (scope === 'folder') ids = descendants(tree, folderId);
    else if (scope === 'selected') ids = selectedIds.flatMap(id => descendants(tree, id));
    else ids = origins.filter(origin => (origin.created || origin.adopted) && !origin.organized && tree.nodes[origin.bookmarkId]?.url === origin.url && tree.nodes[origin.bookmarkId]?.parentId === origin.parentId).map(origin => origin.bookmarkId);
    return [...new Set(ids)].filter(id => !excluded.has(id) && tree.nodes[id] && !tree.nodes[id]!.readonly && !tree.nodes[id]!.unmodifiable);
  }, [tree, scope, folderId, selectedIds.join(','), origins, excluded]);
  const bookmarks = scopeIds.map(id => tree.nodes[id]!).filter(node => node.url);
  const historical = tree.orderedIds.filter(id => {
    const node = tree.nodes[id];
    const parent = node?.parentId ? tree.nodes[node.parentId] : undefined;
    return node?.url && !node.readonly && parent?.title === 'Bookmark Atlas'
      && (tree.nodes[parent.parentId ?? '']?.folderType === 'other' || parent.parentId === '2')
      && !origins.some(origin => origin.bookmarkId === id && origin.url === node.url);
  });
  const preparation = useMemo(() => {
    if (!bookmarks.length) return { value: null, error: '' };
    try { return { value: prepareNativeOrganization({ tree, scopeIds, excludedIds, mode, organizationRootId: mode === 'advanced' ? organizationRootId : undefined, instruction: instruction.trim() || text('Organize these bookmarks by topic.', '按主题整理这些书签。') }), error: '' }; }
    catch { return { value: null, error: text('This scope is too large. Choose a smaller folder or exclude unrelated directories.', '当前范围过大，请选择较小的文件夹或排除无关目录。') }; }
  }, [tree, scopeIds.join(','), excludedIds.join(','), mode, instruction, zh, organizationRootId]);

  const prepared = preparation.value;
  const scopeFingerprint = JSON.stringify(prepared?.outgoing ?? null);
  const hasScopeConsent = consent && consentScope === scopeFingerprint;

  function invalidate() {
    request.current?.abort();
    setConsent(false); setPlan(null); setSelected(new Set()); setError(''); setProgress('');
  }
  function acceptPlan(value: NativeOrganizationPlan) {
    const operations = value.operations.filter(operation => operation.type !== 'move'
      || value.baseline.nodes[operation.id]?.parentId !== operation.parentId);
    setPreviewKind('all');
    setPlan({ ...value, operations });
    setSelected(new Set(operations.filter(operation => operation.confidence !== 'low'
      && operation.type !== 'remove-empty-folder').map(operation => operation.key)));
    setStep('review');
  }

  async function run(action: () => Promise<void>) {
    if (active.current) return;
    active.current = true; setBusy(true); setError('');
    try { await action(); }
    catch (cause) { if (mounted.current) setError(cause && typeof cause === 'object' && 'code' in cause && ['invalid_plan', 'changed', 'record_missing', 'unconfirmed', 'target_unavailable', 'invalid_history', 'unavailable'].includes(String(cause.code)) ? text('The bookmark state changed or this operation needs review. Check the history and generate a fresh preview.', '书签状态已变化或操作需要确认，请查看整理记录并重新生成预览。') : aiErrorMessage(cause)); }
    finally { active.current = false; if (mounted.current) setBusy(false); }
  }
  function previewManual() {
    if (!manualTarget || !bookmarks.length) return;
    acceptPlan({
      id: crypto.randomUUID(), mode, baseline: structuredClone(tree), scopeIds, excludedIds,
      operations: bookmarks.filter(node => node.parentId !== manualTarget).map(node => ({ key: crypto.randomUUID(), type: 'move' as const, id: node.id, parentId: manualTarget, reason: text('Your selected folder', '你选择的目标目录') }))
    });
  }
  async function generate() {
    if (!prepared || !hasScopeConsent || !settings?.apiKey) return;
    setGenerating(true);
    const permission = requestAIOriginPermission(settings);
    await run(async () => {
      if (!await permission) throw new Error('permission_required');
      const controller = new AbortController(); request.current = controller;
      const result = await generateNativeOrganization(settings, prepared, {
        signal: controller.signal, cleanupEmptyFolders: cleanup,
        onProgress: (done, total) => { if (mounted.current) setProgress(text(`Generating ${done} / ${total}`, `正在生成 ${done} / ${total}`)); },
      });
      if (mounted.current && !controller.signal.aborted) { acceptPlan(result); setProgress(''); }
    });
    if (mounted.current) setGenerating(false);
    request.current = null;
  }
  async function apply() {
    if (!plan || !selected.size || missingDependency(plan, selected) || !chosenPlan(plan, selected).operations.length) return;
    await run(async () => {
      const completed = await executeOrganization(chosenPlan(plan, selected));
      if (!mounted.current) return;
      onChanged?.();
      if (completed.status === 'completed') {
        onClose();
        return;
      }
      setPlan(null); setSelected(new Set()); setStep('done');
      setProgress(text(`Organization recorded (${statusName(completed.status)}).`, `整理已记录（${statusName(completed.status)}）。`));
      await refreshLocal();
    });
  }
  async function historyAction(id: string, restore: boolean) {
    await run(async () => {
      await (restore ? restoreOrganization(id) : resumeOrganization(id));
      if (mounted.current) { await refreshLocal(); onChanged?.(); }
    });
  }
  function exportRecord(record: NativeJournal) {
    const url = URL.createObjectURL(new Blob([JSON.stringify(record, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = `bookmark-atlas-organization-${record.id}.json`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const statusName = (status: NativeJournal['status']) => ({ running: text('Applying changes', '正在应用'), completed: text('Completed', '已完成'), partial: text('Partially completed', '部分完成'), restoring: text('Restoring', '正在恢复'), restored: text('Restored', '已恢复'), 'needs-review': text('Needs review', '待确认') })[status];
  const isBookmarkOperation = (operation: NativeOperation) => Boolean(plan?.baseline.nodes[operation.id]?.url);
  const visibleOperations = plan?.operations.filter(operation => previewKind === 'all'
    || (previewKind === 'bookmarks' ? isBookmarkOperation(operation) : !isBookmarkOperation(operation))) ?? [];
  const affectedBookmarks = (operation: NativeOperation) => {
    if (!plan || operation.type === 'create-folder' || plan.baseline.nodes[operation.id]?.url) return [];
    return descendants(plan.baseline, operation.id).map(id => plan.baseline.nodes[id]!).filter(node => node.url);
  };
  const operationName = (op: NativeOperation) => ({ move: text('Move', '移动'), 'create-folder': text('New folder', '新建目录'), 'rename-folder': text('Rename folder', '重命名目录'), 'remove-empty-folder': text('Remove empty folder', '清理空目录') })[op.type];
  const operationTarget = (op: NativeOperation) => {
    if (op.type === 'rename-folder') return op.title;
    if (op.type === 'remove-empty-folder') return text('Empty folder removal', '移除空目录');
    const created = plan?.operations.find(item => item.type === 'create-folder' && item.id === op.parentId);
    return created?.type === 'create-folder' ? created.title : pathFor(plan?.baseline ?? tree, op.parentId);
  };
  const close = () => { request.current?.abort(); onClose(); };

  const stages = ['scope', 'method', 'review'] as const;
  const stageIndex = step === 'done' ? 2 : stages.indexOf(step);
  const stageTitles = [text('Select scope', '选择范围'), text('Generate a plan', '生成方案'), text('Review and apply', '预览并应用')];
  const rootAvailable = folders.some(folder => folder.id === organizationRootId);
  const unassigned = plan && method === 'ai' ? [...new Set(plan.scopeIds.flatMap(id => descendants(plan.baseline, id)))]
    .map(id => plan.baseline.nodes[id]!).filter(node => node?.url && !node.readonly
      && !new Set(plan.excludedIds.flatMap(id => descendants(plan.baseline, id))).has(node.id)
      && !plan.operations.some(operation => operation.id === node.id
        || (operation.type !== 'create-folder' && !plan.baseline.nodes[operation.id]?.url
          && descendants(plan.baseline, operation.id).includes(node.id)))) : [];
  const bookmarkChanges = plan?.operations.filter(isBookmarkOperation).length ?? 0;
  const folderChanges = (plan?.operations.length ?? 0) - bookmarkChanges;
  const plannedFolders = plan?.operations.filter(operation => operation.type === 'create-folder') ?? [];

  function destinationPath(id: string, visited = new Set<string>()): string {
    if (visited.has(id)) return id;
    visited.add(id);
    const created = plan?.operations.find(operation => operation.type === 'create-folder' && operation.id === id);
    if (created?.type === 'create-folder') return `${destinationPath(created.parentId, visited)} / ${created.title}`;
    return pathFor(plan?.baseline ?? tree, id);
  }
  function assignUnplanned(id: string, parentId: string) {
    if (!plan || !parentId || plan.baseline.nodes[id]?.parentId === parentId) return;
    const operation: NativeOperation = { key: crypto.randomUUID(), type: 'move', id, parentId,
      reason: text('Your selected destination', '你选择的目标目录') };
    setPlan({ ...plan, operations: [...plan.operations, operation] });
    setSelected(keys => new Set([...keys, operation.key]));
  }
  function backTo(next: 'scope' | 'method') {
    if (busy) return;
    setStep(next); setError(''); setProgress('');
  }
  const historyContent = <div className="atlas-native-history">
    <h3>{text('Organization history', '整理记录')}</h3>
    <p className="atlas-native-hint">{text('Review completed changes, resume interrupted work, or restore its recorded positions.', '查看已执行的调整、继续中断的操作，或按记录恢复原位置。')}</p>
    {!history.length && <p>{text('No organization records on this device yet.', '本机暂无整理记录。')}</p>}
    {history.map(record => <article key={record.id}>
      <div>
        <strong>{new Date(record.createdAt).toLocaleString(zh ? 'zh-CN' : 'en')}</strong>
        <p>{statusName(record.status)} · {record.steps.filter(item => item.status === 'done' || item.status === 'restored').length} / {record.steps.length} {text('operations', '项操作')}</p>
        {record.steps.filter(item => ['conflict', 'failed', 'running'].includes(item.status)).map(item => <div key={item.operation.key} className="atlas-native-recovery-item">
          <strong>{record.plan.baseline.nodes[item.operation.id]?.title || (item.operation.type === 'create-folder' ? item.operation.title : item.operation.id)}</strong>
          <p>{text('Review this operation. Its original and planned positions are in the exported record.', '此项需要确认，可导出记录查看原位置和计划位置。')}</p>
          {item.status === 'running' && (reviewingStep !== `${record.id}:${item.operation.key}`
            ? <button type="button" className="secondary-button" disabled={busy} onClick={() => setReviewingStep(`${record.id}:${item.operation.key}`)}>{text('Review uncertain result', '检查未确认结果')}</button>
            : <div><p>{text('Check the bookmark tree first. Skip marks this step for manual handling and allows recovery of confirmed changes.', '先检查实际书签目录。跳过后此项留待手动处理，已确认的调整可继续恢复。')}</p>
              <button type="button" className="secondary-button" disabled={busy} onClick={() => void run(async () => { await acknowledgeOrganizationStep(record.id, item.operation.key); setReviewingStep(''); await refreshLocal(); })}>{text('I checked the tree; skip this step', '已检查目录，跳过此项')}</button>
              <button type="button" className="secondary-button" onClick={() => setReviewingStep('')}>{text('Cancel', '取消')}</button>
            </div>)}
        </div>)}
      </div>
      <div className="atlas-native-actions">
        {!['completed', 'restored'].includes(record.status) && <button type="button" className="secondary-button" disabled={busy} onClick={() => void historyAction(record.id, false)}>{text('Continue', '继续')}</button>}
        {record.status !== 'restored' && <button type="button" className="secondary-button" disabled={busy} onClick={() => void historyAction(record.id, true)}>{text('Restore', '恢复')}</button>}
        <button type="button" className="icon-button" aria-label={text('Export recovery record', '导出恢复记录')} onClick={() => exportRecord(record)}><Download size={17} /></button>
        {['completed', 'restored'].includes(record.status) && (clearingRecord !== record.id
          ? <button type="button" className="icon-button" disabled={busy} aria-label={text('Clear this history record', '清理此条历史')} onClick={() => setClearingRecord(record.id)}><Trash2 size={17} /></button>
          : <div><p>{text('Clearing removes this record and its recovery entry.', '清理将移除此条记录及对应恢复入口。')}</p>
            <button type="button" className="secondary-button" disabled={busy} onClick={() => void run(async () => { await forgetOrganizationHistory(record.id); setClearingRecord(''); await refreshLocal(); })}>{text('Confirm clearing', '确认清理')}</button>
            <button type="button" className="secondary-button" onClick={() => setClearingRecord('')}>{text('Cancel', '取消')}</button>
          </div>)}
      </div>
    </article>)}
  </div>;

  return <div className="modal-backdrop atlas-native-backdrop" onMouseDown={event => { if (event.target === event.currentTarget && !busy) close(); }}>
    <section className="atlas-native-organizer" role="dialog" aria-modal="true" aria-labelledby="native-organizer-title" ref={dialog} tabIndex={-1}
      onKeyDown={event => {
        if (event.key === 'Escape' && !busy) { event.stopPropagation(); close(); }
        if (event.key === 'Tab') {
          const controls = dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), select:not(:disabled), input:not(:disabled), textarea:not(:disabled), summary');
          const first = controls?.[0]; const last = controls?.[controls.length - 1];
          if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { event.preventDefault(); last?.focus(); }
          else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
        }
      }}>
      <header>
        <div><h2 id="native-organizer-title"><FolderTree size={21} />{text('Organize Chrome bookmarks', '整理 Chrome 书签')}</h2>
          <p>{text('Choose bookmarks, generate a plan, then review the changes.', '选好书签，生成方案，确认后再应用调整。')}</p></div>
        <div className="atlas-native-actions">
          {onOpenGuide && <button type="button" className="icon-button" disabled={busy}
            title={text('Bookmark organization guide', '书签整理引导')}
            aria-label={text('Bookmark organization guide', '书签整理引导')} onClick={onOpenGuide}>
            <BookOpen size={17} aria-hidden="true" />
          </button>}
          <button className="secondary-button" type="button" onClick={() => setHistoryVisible(value => !value)}><History size={15} />{historyVisible ? text('Back to organization', '返回整理') : text('Organization history', '整理记录')}</button>
          <button type="button" className="icon-button" onClick={close} aria-label={text('Close', '关闭')}><X size={20} /></button>
        </div>
      </header>
      {!historyVisible && <ol className="atlas-native-steps" aria-label={text('Organization steps', '整理步骤')}>
        {stages.map((stage, index) => <li key={stage} data-current={index === stageIndex} data-complete={index < stageIndex}>
          <button type="button" disabled={busy || index >= stageIndex || step === 'done'} aria-current={index === stageIndex ? 'step' : undefined}
            onClick={() => { if (stage === 'scope' || stage === 'method') backTo(stage); }}><span>{index + 1}</span>{stageTitles[index]}</button>
        </li>)}
      </ol>}
      <div className="atlas-native-body">
        {historyVisible ? historyContent : <>
          {step === 'scope' && <div className="atlas-native-stage atlas-native-scope-stage">
            <h3>{text('Choose what to organize', '选择要整理的书签')}</h3>
            <div className="atlas-native-fields">
              <label>{text('Scope', '整理范围')}<select value={scope} disabled={busy} onChange={event => { invalidate(); setScope(event.target.value as Scope); }}>
                <option value="pending">{text('Plugin captures to organize', '插件收藏待整理')}</option><option value="all">{text('All bookmarks', '全部书签')}</option><option value="folder">{text('Choose a folder', '指定文件夹')}</option><option value="selected">{text('Selected bookmarks', '当前选中项')}</option>
              </select></label>
              {scope === 'folder' && <label>{text('Source folder', '源文件夹')}<select value={folderId} disabled={busy} onChange={event => { invalidate(); setFolderId(event.target.value); }}>
                <option value="">{text('Choose…', '请选择…')}</option>{nativeFolderChoices(tree).map(folder => <option key={folder.id} value={folder.id}>{folder.path || folder.title}</option>)}
              </select></label>}
              <label>{text('Mode', '整理模式')}<select value={mode} disabled={busy} onChange={event => { invalidate(); setMode(event.target.value as NativeMode); }}>
                <option value="daily">{text('Use existing folders', '日常归类 · 使用已有目录')}</option><option value="advanced">{text('Restructure folders', '高级模式 · 重新规划目录')}</option>
              </select></label>
            </div>
            <p className="atlas-native-hint">{mode === 'daily'
              ? text('Move bookmarks into suitable folders you already have.', '把书签分配到合适的已有文件夹。')
              : text('Suggest topic folders and review the directory structure before creating or moving anything.', '按主题建议分类目录，创建和移动前先检查目录结构。')}</p>
            {mode === 'advanced' && <label className="atlas-native-root-field">{text('Create new categories under', '新分类创建到')}<select value={rootAvailable ? organizationRootId : ''} disabled={busy} onChange={event => { invalidate(); setOrganizationRootId(event.target.value); }}>
              <option value="">{text('Choose a parent folder', '选择分类目录的位置')}</option>{folders.map(folder => <option key={folder.id} value={folder.id}>{folder.path || folder.title}</option>)}
            </select><small>{text('New topic folders will appear here. Existing folder changes remain in the selected scope.', '新的主题文件夹将在这里创建，现有目录调整以所选范围为准。')}</small></label>}
            <details className="atlas-native-exclusions"><summary>{text('Exclude or lock folders', '排除或锁定目录')}</summary>
              <div className="atlas-native-folder-list">{nativeFolderChoices(tree).map(folder => <label key={folder.id}><input type="checkbox" disabled={busy} checked={excludedIds.includes(folder.id)} onChange={event => { invalidate(); setExcludedIds(ids => event.target.checked ? [...ids, folder.id] : ids.filter(id => id !== folder.id)); }} />{folder.path || folder.title}</label>)}</div>
            </details>
            <div className="atlas-native-scope-summary"><strong>{text(`${bookmarks.length} bookmarks selected`, `本次范围 ${bookmarks.length} 条书签`)}</strong>
              {bookmarks.length > 0 ? <ul>{bookmarks.slice(0, 6).map(node => <li key={node.id}><span>{node.title}</span><small>{pathFor(tree, node.parentId)}</small></li>)}</ul>
                : <p>{text('Add bookmarks with the toolbar popup, or choose another scope.', '可先通过扩展图标收藏网页，或选择其他整理范围。')}</p>}
              {bookmarks.length > 6 && <small>{text(`And ${bookmarks.length - 6} more`, `另有 ${bookmarks.length - 6} 条`)}</small>}
            </div>
            {scope === 'pending' && <p className="atlas-native-hint">{text('Capture history is local to this device. Bookmark changes follow Chrome sync.', '收藏来源记录保存在本机，原生书签调整遵循 Chrome 同步设置。')}</p>}
            {scope === 'pending' && historical.length > 0 && <button type="button" className="secondary-button" disabled={busy} onClick={() => void run(async () => { await adoptHistoricalBookmarks(historical); await refreshLocal(); })}>{text(`Include ${historical.length} older Bookmark Atlas bookmarks`, `确认纳入 ${historical.length} 条旧版文件夹书签`)}</button>}
          </div>}
          {step === 'method' && <div className="atlas-native-stage atlas-native-method-stage">
            <h3>{text('Choose how to organize', '选择整理方式')}</h3>
            <p className="atlas-native-hint">{text(`${bookmarks.length} bookmarks · ${mode === 'daily' ? 'existing folders' : 'directory planning'}`, `${bookmarks.length} 条书签 · ${mode === 'daily' ? '已有目录归类' : '目录重新规划'}`)}</p>
            <div className="atlas-native-methods" role="radiogroup" aria-label={text('Organization method', '整理方式')}>
              <label><input type="radio" name="native-method" value="ai" checked={method === 'ai'} disabled={busy} onChange={() => { setMethod('ai'); setError(''); }} /><span>{text('AI suggestions', 'AI 生成建议')}</span></label>
              <label><input type="radio" name="native-method" value="manual" checked={method === 'manual'} disabled={busy} onChange={() => { setMethod('manual'); setError(''); }} /><span>{text('Move manually', '手动指定目录')}</span></label>
            </div>
            {method === 'manual' ? <label>{text('Move selected bookmarks to', '将所选书签移至')}<select aria-label={text('Move selected bookmarks to', '将所选书签移至')} value={manualTarget} disabled={busy} onChange={event => setManualTarget(event.target.value)}>
              <option value="">{text('Choose a destination', '选择目标目录')}</option>{folders.map(folder => <option key={folder.id} value={folder.id}>{folder.path || folder.title}</option>)}
            </select><small>{text('All selected bookmarks will be previewed against this existing folder.', '预览将展示所选书签移动到这个已有文件夹后的结果。')}</small></label>
              : <>
                <label>{text('Organization instructions', '整理要求')}<textarea value={instruction} maxLength={2000} disabled={busy} onChange={event => { invalidate(); setInstruction(event.target.value); }} placeholder={text('For example, group by development, design, reading and videos.', '例如，按开发、设计、阅读、视频分类。')} /></label>
                {mode === 'advanced' && <p className="atlas-native-target-summary">{text('New categories under', '新分类创建到')} <strong>{pathFor(tree, organizationRootId)}</strong></p>}
                {mode === 'advanced' && <label className="atlas-native-check"><input type="checkbox" disabled={busy} checked={cleanup} onChange={event => { invalidate(); setCleanup(event.target.checked); }} />{text('Include empty source-folder cleanup in the preview', '在预览中列出合并后空源目录的清理建议')}</label>}
                <details><summary>{text('Review data sent to your AI service', '查看发送给 AI 的数据')}</summary><p>{text('Titles, domains, candidate folder names and hierarchy, and your instructions. Provider fees may apply.', '包含标题、域名、候选文件夹名称与层级，以及整理要求。服务商可能收费。')}</p><pre>{prepared ? JSON.stringify(prepared.outgoing, null, 2) : text('Choose a valid scope first.', '请先选择有效的整理范围。')}</pre></details>
                <label className="atlas-native-check"><input type="checkbox" checked={hasScopeConsent} disabled={busy || !prepared} onChange={event => { setConsent(event.target.checked); setConsentScope(event.target.checked ? scopeFingerprint : ''); }} />{text('Allow this displayed scope to be sent to my AI provider.', '允许将当前展示的范围发送给我配置的 AI 服务。')}</label>
                {!settings?.apiKey && <p className="atlas-native-config-hint">{text('Save a local AI configuration before generating suggestions.', '请先保存本机 AI 配置，再生成整理建议。')} <button type="button" className="secondary-button" disabled={busy} onClick={onOpenAISettings}>{text('AI settings', '打开 AI 设置')}</button></p>}
                {preparation.error && <p role="alert">{preparation.error}</p>}
              </>}
          </div>}
          {step === 'review' && plan && <div className="atlas-native-stage atlas-native-review-stage">
            <h3>{text('Review and apply', '检查调整方案')}</h3>
            <p className="atlas-native-result-summary">{text(`${bookmarkChanges} bookmark moves · ${folderChanges} folder changes · ${unassigned.length} unassigned`, `${bookmarkChanges} 条书签移动 · ${folderChanges} 项目录调整 · ${unassigned.length} 条未安排`)}</p>
            {plan.operations.length === 0 && <div className="atlas-native-empty-plan"><h4>{method === 'manual' ? text('Already in the selected folder', '所选书签已在目标目录中') : text('No changes generated', '本次未生成调整方案')}</h4><p>{method === 'manual' ? text('Choose another destination to preview a move.', '可以选择其他目标目录，再预览移动。') : text('The AI did not propose folder changes or bookmark moves. Edit the instructions to try again, or choose destinations for the unassigned bookmarks below.', 'AI 本次没有提出目录调整或书签移动。可以修改要求重新生成，或为下面未安排的书签手动选择目标。')}</p></div>}
            {missingDependency(plan, selected) && <p role="alert">{text('Select the required new folder before applying its dependent moves.', '请先勾选依赖的新建目录，再应用相关移动。')}</p>}
            {plan.operations.length > 0 && <>
              {plannedFolders.length > 0 && <div className="atlas-native-directory-preview"><h4>{text('Proposed categories', '建议的分类目录')}</h4><ul>{plannedFolders.map(operation => <li key={operation.key}>{destinationPath(operation.id)}</li>)}</ul></div>}
              <div className="atlas-native-preview-tabs" role="group" aria-label={text('Change types', '变更类型')}>{(['all', 'bookmarks', 'folders'] as const).map(kind => <button key={kind} type="button" className="secondary-button" aria-pressed={previewKind === kind} onClick={() => setPreviewKind(kind)}>{kind === 'all' ? text('All changes', '全部变更') : kind === 'bookmarks' ? text('Bookmarks', '书签') : text('Folders', '目录')} ({plan.operations.filter(operation => kind === 'all' || (kind === 'bookmarks' ? isBookmarkOperation(operation) : !isBookmarkOperation(operation))).length})</button>)}</div>
              <div className="atlas-native-preview">{visibleOperations.map(operation => <article key={operation.key} className="atlas-native-change">
                <label><input type="checkbox" checked={selected.has(operation.key)} disabled={busy} onChange={event => setSelected(keys => { const next = new Set(keys); if (event.target.checked) next.add(operation.key); else next.delete(operation.key); return next; })} /><strong>{operationName(operation)} · {plan.baseline.nodes[operation.id]?.title || (operation.type === 'create-folder' ? operation.title : operation.id)}</strong></label>
                <p className="atlas-native-path-change"><span>{pathFor(plan.baseline, plan.baseline.nodes[operation.id]?.parentId) || text('New category', '新分类')}</span><span aria-hidden="true">→</span><strong>{'parentId' in operation ? destinationPath(operation.parentId) : operationTarget(operation)}</strong></p>
                <small>{operation.reason}{operation.confidence === 'low' ? text(' · Review recommended', ' · 建议确认') : ''}</small>
                {affectedBookmarks(operation).length > 0 && <details className="atlas-native-affected"><summary>{text(`Affects ${affectedBookmarks(operation).length} bookmarks`, `影响 ${affectedBookmarks(operation).length} 条书签`)}</summary><ul>{affectedBookmarks(operation).map(node => <li key={node.id}><strong>{node.title}</strong><small>{pathFor(plan.baseline, node.parentId)}</small></li>)}</ul></details>}
                {'title' in operation && <label>{text('Folder name', '目录名称')}<input type="text" maxLength={200} disabled={busy} value={operation.title} onChange={event => { const title = event.target.value; setSelected(keys => new Set([...keys, operation.key])); setPlan(current => current && ({ ...current, operations: current.operations.map(item => item.key === operation.key ? { ...item, title } as NativeOperation : item) })); }} /></label>}
                {operation.type === 'move' && <label>{text('Destination', '目标目录')}<select value={operation.parentId} disabled={busy} onChange={event => { const parentId = event.target.value; setSelected(keys => new Set([...keys, operation.key])); setPlan(current => current && ({ ...current, operations: current.operations.map(item => item.key === operation.key ? { ...item, parentId } as NativeOperation : item) })); }}>
                  <option value={operation.parentId}>{destinationPath(operation.parentId)}</option>{folders.filter(folder => folder.id !== operation.parentId).map(folder => <option key={folder.id} value={folder.id}>{folder.path || folder.title}</option>)}{plannedFolders.filter(folder => folder.id !== operation.parentId).map(folder => <option key={folder.id} value={folder.id}>{destinationPath(folder.id)}</option>)}
                </select></label>}
              </article>)}</div>
            </>}
            {unassigned.length > 0 && <details className="atlas-native-unassigned" open={plan.operations.length === 0}>
              <summary>{text(`Unassigned bookmarks (${unassigned.length})`, `未安排的书签（${unassigned.length}）`)}</summary>
              <p className="atlas-native-hint">{text('Choose a destination for an item to add it to the change plan.', '为某条书签选择目标目录后，才会加入调整方案。')}</p>
              {unassigned.map(node => <div key={node.id} className="atlas-native-unassigned-row"><div><strong>{node.title}</strong><small>{text('Current folder', '当前目录')} · {pathFor(plan.baseline, node.parentId)}</small></div>
                <label><span className="sr-only">{text(`Destination for ${node.title}`, `${node.title} 的目标目录`)}</span><select value="" disabled={busy} onChange={event => assignUnplanned(node.id, event.target.value)}><option value="">{text('Choose a destination…', '选择目标目录…')}</option>{folders.filter(folder => folder.id !== node.parentId).map(folder => <option key={folder.id} value={folder.id}>{folder.path || folder.title}</option>)}{plannedFolders.map(folder => <option key={folder.id} value={folder.id}>{destinationPath(folder.id)}</option>)}</select></label>
              </div>)}
            </details>}
          </div>}
          {step === 'done' && <div className="atlas-native-stage atlas-native-done"><h3>{text('Organization recorded', '整理结果已保存')}</h3><p role="status">{progress}</p><p>{text('Review the bookmark tree or open organization history to inspect and restore changes.', '可以检查浏览器书签目录，或打开整理记录查看和恢复。')}</p><button type="button" className="secondary-button" onClick={() => { setHistoryVisible(true); setProgress(''); }}>{text('View organization history', '查看整理记录')}</button></div>}
        </>}
        {error && <p role="alert" className="atlas-native-error">{error}</p>}
        {busy && progress && <p role="status">{progress}</p>}
      </div>
      <footer>
        <div className="atlas-native-footer-note">{historyVisible ? text('History and recovery data stay on this device.', '整理记录和恢复数据保存在本机。') : step === 'review' ? text('Only the checked changes will be applied to Chrome bookmarks.', '仅将已勾选的调整应用到 Chrome 原生书签。') : text(`${bookmarks.length} bookmarks in scope`, `当前范围 ${bookmarks.length} 条书签`)}</div>
        <div className="atlas-native-actions">
          {historyVisible ? <button type="button" className="secondary-button" onClick={() => setHistoryVisible(false)}>{text('Back to organization', '返回整理')}</button> : <>
            {step === 'method' && <button type="button" className="secondary-button" disabled={busy} onClick={() => backTo('scope')}>{text('Back', '上一步')}</button>}
            {step === 'review' && <button type="button" className="secondary-button" disabled={busy} onClick={() => backTo('method')}>{text('Edit instructions or method', '修改要求或整理方式')}</button>}
            {step === 'scope' && <button type="button" className="primary-button" disabled={busy || !bookmarks.length || (mode === 'advanced' && !rootAvailable)} onClick={() => { setStep('method'); setError(''); }}>{text('Next: choose how to organize', '下一步 · 选择整理方式')}</button>}
            {step === 'method' && method === 'manual' && <button type="button" className="primary-button" disabled={busy || !manualTarget || !bookmarks.length} onClick={previewManual}>{text('Preview moves', '预览移动')}</button>}
            {step === 'method' && method === 'ai' && <button type="button" className="primary-button" disabled={busy || !hasScopeConsent || !prepared || !settings?.apiKey} onClick={() => void generate()}><Sparkles size={16} />{generating ? text('Generating suggestions…', '正在生成建议…') : text('Generate suggestions', '生成整理建议')}</button>}
            {generating && <button type="button" className="secondary-button" onClick={() => request.current?.abort()}>{text('Cancel generation', '取消生成')}</button>}
            {step === 'review' && <button type="button" className="primary-button" disabled={busy || !plan || !selected.size || (plan && (missingDependency(plan, selected) || !chosenPlan(plan, selected).operations.length))} onClick={() => void apply()}>{text(`Apply selected (${selected.size})`, `应用所选调整（${selected.size}）`)}</button>}
            {step === 'done' && <button type="button" className="primary-button" onClick={() => { setStep('scope'); setProgress(''); }}>{text('Organize another scope', '继续整理其他范围')}</button>}
          </>}
        </div>
      </footer>
    </section>
  </div>;
}
