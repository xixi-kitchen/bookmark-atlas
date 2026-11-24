import type { BookmarkAdapter, BookmarkTree } from '../types';
import type { CaptureOrigin } from './provenance';
import { normalizeCaptureUrl } from '../../capture/captureQueue';
import { canInsert, canMutate, descendants, folderPath, operationDependsOn, validateNativePlan } from './tree';
import { NativeOrganizationError, type NativeJournal, type NativePathChange, type NativeNodeState, type NativeOperation, type NativeOrganizationPlan, type NativeStep } from './types';
export type OrganizationRuntime = {
    adapter: BookmarkAdapter;
    removeEmptyFolder(id: string): Promise<void>;
    load(): Promise<NativeJournal[]>;
    save(records: NativeJournal[]): Promise<void>;
    now(): number;
    captureOrigins?(): Promise<CaptureOrigin[]>;
    afterChange?(ids: string[], tree: BookmarkTree, changes: NativePathChange[], restoring: boolean, origins?: CaptureOrigin[]): Promise<void>;
};
function state(tree: BookmarkTree, id: string): NativeNodeState | undefined {
    const node = tree.nodes[id];
    if (!node)
        return undefined;
    return {
        id: node.id, title: node.title, parentId: node.parentId, index: node.index, url: node.url,
        childIds: Object.values(tree.nodes).filter(child => child.parentId === id).sort((a, b) => (a.index ?? 0) - (b.index ?? 0)).map(child => child.id),
        folderPath: folderPath(tree, node.url ? node.parentId ?? '' : node.id),
    };
}
function equals(left?: NativeNodeState, right?: NativeNodeState): boolean {
    return Boolean(left && right && left.id === right.id && left.title === right.title && left.url === right.url
        && left.parentId === right.parentId && left.index === right.index
        && JSON.stringify(left.childIds) === JSON.stringify(right.childIds));
}
function project(tree: BookmarkTree, before: NativeNodeState | undefined, after: NativeNodeState | undefined) {
    if (before && (!after || before.parentId !== after.parentId)) {
        delete tree.nodes[before.id];
        for (const node of Object.values(tree.nodes)) {
            if (node.parentId === before.parentId && (node.index ?? 0) > (before.index ?? 0))
                node.index = (node.index ?? 0) - 1;
        }
    }
    if (after) {
        if (!before || before.parentId !== after.parentId) {
            for (const node of Object.values(tree.nodes)) {
                if (node.id !== after.id && node.parentId === after.parentId && (node.index ?? 0) >= (after.index ?? 0))
                    node.index = (node.index ?? 0) + 1;
            }
        }
        tree.nodes[after.id] = { ...tree.nodes[after.id], ...after };
    }
}
function expectedTree(record: NativeJournal): BookmarkTree {
    const tree = structuredClone(record.plan.baseline);
    for (const step of record.steps) {
        const applied = step.status === 'done' || step.status === 'running' && step.restoring || step.status === 'conflict' && ['changed_after', 'restore_unconfirmed'].includes(step.error ?? '');
        if (!applied)
            continue;
        project(tree, step.before, step.after);
    }
    for (const [oldId, newId] of Object.entries(record.restoredIdMap ?? {})) {
        const original = tree.nodes[oldId];
        if (!original)
            continue;
        delete tree.nodes[oldId];
        tree.nodes[newId] = { ...original, id: newId };
        for (const node of Object.values(tree.nodes))
            if (node.parentId === oldId)
                node.parentId = newId;
    }
    return tree;
}
function resolve(record: NativeJournal, id: string): string {
    const mapped = record.idMap[id] ?? id;
    return record.restoredIdMap?.[mapped] ?? mapped;
}
function assertTarget(tree: BookmarkTree, id: string) {
    if (!canInsert(tree, tree.nodes[id]))
        throw new NativeOrganizationError('target_unavailable');
}
function assertCurrent(record: NativeJournal, step: NativeStep, tree: BookmarkTree) {
    const operation = step.operation;
    const id = resolve(record, operation.id);
    const expected = expectedTree(record);
    const excluded = new Set(record.plan.excludedIds.flatMap(excludedId => descendants(tree, excludedId)));
    if (excluded.has(id) || descendants(tree, id).some(childId => excluded.has(childId)))
        throw new NativeOrganizationError('excluded');
    const verifyTarget = (parentId: string) => {
        assertTarget(tree, parentId);
        if (excluded.has(parentId) || folderPath(expected, parentId) !== folderPath(tree, parentId))
            throw new NativeOrganizationError('changed');
    };
    if (operation.type === 'create-folder') {
        verifyTarget(resolve(record, operation.parentId));
        return;
    }
    const current = tree.nodes[id];
    if (!canMutate(tree, current) || !equals(state(expected, id), state(tree, id)))
        throw new NativeOrganizationError('changed');
    if (!current.url) {
        for (const childId of descendants(expected, id)) {
            if (!equals(state(expected, childId), state(tree, childId)))
                throw new NativeOrganizationError('changed');
        }
    }
    if (operation.type === 'move') {
        const parentId = resolve(record, operation.parentId);
        verifyTarget(parentId);
        if (descendants(tree, id).includes(parentId))
            throw new NativeOrganizationError('cycle');
    }
    if (operation.type === 'remove-empty-folder' && state(tree, id)!.childIds.length)
        throw new NativeOrganizationError('not_empty');
}
function completedAfterUncertainWrite(record: NativeJournal, step: NativeStep, tree: BookmarkTree): NativeNodeState | undefined | false {
    const operation = step.operation;
    if (operation.type === 'create-folder')
        return false;
    const current = state(tree, resolve(record, operation.id));
    if (operation.type === 'remove-empty-folder')
        return current ? false : undefined;
    if (!current || !step.before)
        return false;
    const wanted = { ...step.before };
    if (operation.type === 'rename-folder')
        wanted.title = operation.title;
    if (operation.type === 'move') {
        wanted.parentId = resolve(record, operation.parentId);
        // The destination index was durably recorded before calling Chrome.
        wanted.index = step.after?.index;
    }
    return equals(wanted, current) ? current : false;
}
function canonicalPlan(plan: NativeOrganizationPlan): NativeOrganizationPlan {
    const result = structuredClone(plan);
    for (const node of Object.values(result.baseline.nodes))
        delete node.children;
    return result;
}
function stableJSON(value: unknown): string {
    return JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item)
        ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
}
export function createOrganizationExecutor(runtime: OrganizationRuntime) {
    let pending: Promise<unknown> = Promise.resolve();
    const serial = <T>(run: () => Promise<T>): Promise<T> => {
        const result = pending.then(run);
        pending = result.catch(() => { });
        return result;
    };
    const load = async (id: string) => {
        const records = await runtime.load();
        const record = records.find(item => item.id === id);
        if (!record)
            throw new NativeOrganizationError('record_missing');
        return { records, record };
    };
    const save = async (records: NativeJournal[], record: NativeJournal) => {
        record.updatedAt = runtime.now();
        await runtime.save(records);
    };
    async function finish(records: NativeJournal[], record: NativeJournal, restoring = false) {
        const tree = await runtime.adapter.getTree();
        const reference = restoring ? record.restoreBaseline ?? record.plan.baseline : record.plan.baseline;
        const successful = record.steps.filter(step => step.status === (restoring ? 'restored' : 'done'));
        const sourceIdentityCounts=new Map<string,number>();
        const identity=(url:string,title:string,path:string)=>JSON.stringify([normalizeCaptureUrl(url),title,path]);
        for(const node of Object.values(reference.nodes)) {
            if(!node.url) continue;
            try {
                const key=identity(node.url,node.title,folderPath(reference,node.parentId ?? ''));
                sourceIdentityCounts.set(key,(sourceIdentityCounts.get(key) ?? 0)+1);
            } catch { /* Unparseable bookmark URLs are never eligible for URL fallback. */ }
        }
        const affected = new Set(successful.flatMap(step => [step.operation.id, ...descendants(reference, step.operation.id), ...descendants(record.plan.baseline, step.operation.id)]));
        record.pathChanges = Object.values(reference.nodes).flatMap(node => {
            if (!affected.has(node.id))
                return [];
            const current = tree.nodes[resolve(record, node.id)];
            if (!node.url || !current?.url || node.url !== current.url)
                return [];
            const beforePath = folderPath(reference, node.parentId ?? '');
            const afterPath = folderPath(tree, current.parentId ?? '');
            let beforeIdentityUnique=false;
            try {beforeIdentityUnique=sourceIdentityCounts.get(identity(node.url,node.title,beforePath))===1;} catch { /* Keep ambiguous. */ }
            return beforePath === afterPath ? [] : [{ bookmarkId: current.id, url: current.url, title: current.title, beforePath, afterPath, beforeIdentityUnique }];
        });
        const unresolved = record.steps.some(step => ['failed', 'conflict', 'running'].includes(step.status));
        const uncertain = record.steps.some(step => step.status === 'running');
        record.status = unresolved ? (uncertain || restoring ? 'needs-review' : 'partial') : restoring ? 'restored' : 'completed';
        if (runtime.afterChange)
            await runtime.afterChange(record.steps.filter(step => ['done', 'restored'].includes(step.status)).flatMap(step => descendants(tree, resolve(record, step.operation.id))), tree, record.pathChanges, restoring, record.originSnapshot);
        await save(records, record);
        return structuredClone(record);
    }
    async function run(id: string) {
        const { records, record } = await load(id);
        if (record.status === 'completed' || record.status === 'restored')
            return structuredClone(record);
        if (record.status === 'restoring')
            throw new NativeOrganizationError('restore_in_progress');
        record.status = 'running';
        const failedIds = new Set<string>();
        for (const step of record.steps) {
            if (step.status === 'done' || step.status === 'restored')
                continue;
            if (step.status === 'conflict') {
                failedIds.add(step.operation.id);
                continue;
            }
            if (operationDependsOn(step.operation, failedIds)) {
                step.status = 'conflict';
                step.error = 'dependency';
                failedIds.add(step.operation.id);
                await save(records, record);
                continue;
            }
            const tree = await runtime.adapter.getTree();
            if (step.status === 'running') {
                const confirmed = completedAfterUncertainWrite(record, step, tree);
                if (confirmed !== false) {
                    step.after = confirmed;
                    step.status = 'done';
                    await save(records, record);
                    continue;
                }
                if (step.operation.type === 'create-folder' || !equals(step.before, state(tree, resolve(record, step.operation.id)))) {
                    step.error = 'unconfirmed';
                    failedIds.add(step.operation.id);
                    await save(records, record);
                    continue;
                }
            }
            try {
                assertCurrent(record, step, tree);
            }
            catch {
                step.status = 'conflict';
                step.error = 'changed';
                failedIds.add(step.operation.id);
                await save(records, record);
                continue;
            }
            const operation = step.operation;
            const sourceId = resolve(record, operation.id);
            step.before = operation.type === 'create-folder' ? undefined : state(tree, sourceId);
            step.status = 'running';
            delete step.error;
            if (operation.type === 'rename-folder')
                step.after = { ...step.before!, title: operation.title };
            if (operation.type === 'create-folder') {
                const parentId = resolve(record, operation.parentId);
                const index = Object.values(tree.nodes).filter(node => node.parentId === parentId).length;
                step.after = { id: operation.id, parentId, index, title: operation.title, childIds: [], folderPath: folderPath(tree, parentId) + ' / ' + operation.title };
            }
            if (operation.type === 'move') {
                const parentId = resolve(record, operation.parentId);
                const index = Object.values(tree.nodes).filter(node => node.parentId === parentId && node.id !== sourceId).length;
                step.after = { ...step.before!, parentId, index };
            }
            await save(records, record);
            try {
                if (operation.type === 'create-folder') {
                    const node = await runtime.adapter.create({ parentId: resolve(record, operation.parentId), title: operation.title });
                    record.idMap[operation.id] = node.id;
                    step.after = { ...step.after!, id: node.id };
                }
                else if (operation.type === 'move')
                    await runtime.adapter.move(sourceId, { parentId: resolve(record, operation.parentId) });
                else if (operation.type === 'rename-folder')
                    await runtime.adapter.update(sourceId, { title: operation.title });
                else
                    await runtime.removeEmptyFolder(sourceId);
            }
            catch {
                // The browser may have committed even when the callback failed. Resolve on resume.
                step.error = 'unconfirmed';
                failedIds.add(operation.id);
                await save(records, record);
                continue;
            }
            const current = await runtime.adapter.getTree();
            const observed = state(current, resolve(record, operation.id));
            const confirmed = operation.type === 'remove-empty-folder' ? !observed : equals(step.after, observed);
            if (!confirmed) {
                step.status = 'conflict';
                step.error = 'changed_after_apply';
                failedIds.add(operation.id);
                await save(records, record);
                continue;
            }
            // Keep the intended result so recovery can never adopt a concurrent user's edit.
            step.status = 'done';
            await save(records, record);
        }
        return finish(records, record);
    }
    async function restore(id: string) {
        const { records, record } = await load(id);
        if (record.status === 'restored')
            return structuredClone(record);
        if (record.steps.some(step => step.status === 'running' && !step.restoring))
            throw new NativeOrganizationError('unconfirmed');
        record.status = 'restoring';
        record.restoredIdMap ??= {};
        record.restoreBaseline ??= await runtime.adapter.getTree();
        await save(records, record);
        for (const step of [...record.steps].reverse()) {
            const restorationConflict = step.status === 'conflict' && ['changed_after', 'restore_unconfirmed'].includes(step.error ?? '');
            if (step.status === 'pending' || step.status === 'restored' || step.status === 'failed' || (step.status === 'conflict' && !restorationConflict))
                continue;
            const operation = step.operation;
            const tree = await runtime.adapter.getTree();
            const current = state(tree, resolve(record, operation.id));
            const expected = state(expectedTree(record), resolve(record, operation.id));
            if (step.restoring) {
                // A folder recreated without a persisted ID is intentionally ambiguous.
                if (operation.type === 'remove-empty-folder') {
                    step.status = 'conflict';
                    step.error = 'restore_unconfirmed';
                    await save(records, record);
                    continue;
                }
                const before = step.before && { ...step.before, id: resolve(record, step.before.id), parentId: step.before.parentId ? resolve(record, step.before.parentId) : undefined };
                if ((operation.type === 'create-folder' && !current) || equals(before, current)) {
                    step.status = 'restored';
                    step.restoring = false;
                    await save(records, record);
                    continue;
                }
                step.status = 'conflict';
                step.error = 'restore_unconfirmed';
                await save(records, record);
                continue;
            }
            const canRestore = operation.type === 'remove-empty-folder' ? !current : equals(expected, current);
            if (!canRestore || (operation.type === 'create-folder' && current!.childIds.length)) {
                step.status = 'conflict';
                step.error = 'changed_after';
                await save(records, record);
                continue;
            }
            step.restoring = true;
            step.status = 'running';
            await save(records, record);
            try {
                if (operation.type === 'create-folder')
                    await runtime.removeEmptyFolder(resolve(record, operation.id));
                else if (operation.type === 'remove-empty-folder') {
                    if (!step.before?.parentId)
                        throw new NativeOrganizationError('parent_missing');
                    assertTarget(tree, resolve(record, step.before.parentId));
                    const node = await runtime.adapter.create({ parentId: resolve(record, step.before.parentId), index: step.before.index, title: step.before.title });
                    record.restoredIdMap[step.before.id] = node.id;
                }
                else if (operation.type === 'rename-folder')
                    await runtime.adapter.update(resolve(record, operation.id), { title: step.before!.title });
                else {
                    const parentId = resolve(record, step.before!.parentId!);
                    assertTarget(tree, parentId);
                    await runtime.adapter.move(resolve(record, operation.id), { parentId, index: step.before!.index });
                }
            }
            catch {
                step.error = 'restore_unconfirmed';
                await save(records, record);
                continue;
            }
            const afterRestore = state(await runtime.adapter.getTree(), resolve(record, operation.id));
            const desired = step.before && { ...step.before, id: resolve(record, step.before.id), parentId: step.before.parentId ? resolve(record, step.before.parentId) : undefined };
            const restored = operation.type === 'create-folder' ? !afterRestore : equals(desired, afterRestore);
            if (!restored) {
                step.status = 'conflict';
                step.error = 'restore_changed_after_apply';
                await save(records, record);
                continue;
            }
            step.status = 'restored';
            step.restoring = false;
            await save(records, record);
        }
        return finish(records, record, true);
    }
    return {
        start: (plan: NativeOrganizationPlan) => serial(async () => {
            const approved = canonicalPlan(validateNativePlan(plan));
            const records = await runtime.load();
            const existing = records.find(record => record.id === approved.id);
            if (existing) {
                if (stableJSON(canonicalPlan(existing.plan)) !== stableJSON(approved))
                    throw new NativeOrganizationError('plan_collision');
                return run(existing.id);
            }
            const at = runtime.now();
            const record: NativeJournal = { id: approved.id, plan: approved, createdAt: at, updatedAt: at, status: 'running', steps: approved.operations.map(operation => ({ operation, status: 'pending' })), idMap: {}, pathChanges: [], ...(runtime.captureOrigins ? { originSnapshot: await runtime.captureOrigins() } : {}) };
            await runtime.save([...records, record]);
            return run(record.id);
        }),
        resume: (id: string) => serial(() => run(id)),
        restore: (id: string) => serial(() => restore(id)),
        acknowledge: (id: string, key: string) => serial(async () => {
            const { records, record } = await load(id);
            const step = record.steps.find(item => item.operation.key === key);
            if (!step || step.status !== 'running')
                throw new NativeOrganizationError('invalid_review');
            step.status = 'conflict';
            step.error = 'reviewed_unconfirmed';
            step.restoring = false;
            record.status = 'needs-review';
            await save(records, record);
            return structuredClone(record);
        }),
    };
}
