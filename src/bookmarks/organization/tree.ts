import type { BookmarkNode, BookmarkTree } from '../types';
import { NativeOrganizationError, type NativeOperation, type NativeOrganizationPlan } from './types';
export function descendants(tree: BookmarkTree, id: string): string[] {
    const result: string[] = [];
    const seen = new Set<string>();
    const visit = (current: string) => {
        if (seen.has(current) || !tree.nodes[current])
            return;
        seen.add(current);
        result.push(current);
        for (const child of Object.values(tree.nodes))
            if (child.parentId === current)
                visit(child.id);
    };
    visit(id);
    return result;
}
export function folderPath(tree: BookmarkTree, id: string): string {
    const parts: string[] = [];
    const visited = new Set<string>();
    let node = tree.nodes[id];
    while (node && !visited.has(node.id)) {
        visited.add(node.id);
        if (node.title)
            parts.unshift(node.title);
        node = node.parentId ? tree.nodes[node.parentId] : undefined;
    }
    return parts.join(' / ');
}
export function canInsertInto(tree: BookmarkTree, node: BookmarkNode | undefined): node is BookmarkNode {
    if (!node || node.url || node.unmodifiable || node.readonlyReason === 'managed' || node.readonlyReason === 'root')
        return false;
    if (node.readonly && node.readonlyReason !== 'system')
        return false;
    const seen = new Set<string>();
    let parent = node;
    while (parent.parentId && !seen.has(parent.id)) {
        seen.add(parent.id);
        const next = tree.nodes[parent.parentId];
        if (!next)
            return false;
        if (next.unmodifiable || next.readonlyReason === 'managed')
            return false;
        parent = next;
    }
    return true;
}
export function writableFolders(tree: BookmarkTree): BookmarkNode[] {
    return tree.orderedIds.map(id => tree.nodes[id]).filter((node): node is BookmarkNode => canInsertInto(tree, node));
}
export function canMutateNode(tree: BookmarkTree, node: BookmarkNode | undefined): node is BookmarkNode {
    return Boolean(node && !node.readonly && !node.unmodifiable && !node.folderType && node.parentId
        && tree.nodes[node.parentId] && canInsertInto(tree, tree.nodes[node.parentId]));
}
const text = (value: unknown, maximum: number) => typeof value === 'string' && value.length > 0 && value.length <= maximum && !/[\u0000-\u001f]/.test(value);
const idValue = (value: unknown) => text(value, 160) && !['__proto__', 'constructor', 'prototype'].includes(value as string);
export function validateNativePlan(input: NativeOrganizationPlan): NativeOrganizationPlan {
    const fail = (): never => { throw new NativeOrganizationError('invalid_plan'); };
    if (!input || !idValue(input.id) || !['daily', 'advanced'].includes(input.mode) || !input.baseline?.nodes
        || !Array.isArray(input.baseline.orderedIds) || !Array.isArray(input.baseline.rootIds)
        || !Array.isArray(input.scopeIds) || !input.scopeIds.length || !Array.isArray(input.excludedIds)
        || !Array.isArray(input.operations) || input.operations.length > 20000)
        return fail();
    const tree = input.baseline;
    if (input.scopeIds.some(id => !idValue(id) || !tree.nodes[id]) || input.excludedIds.some(id => !idValue(id) || !tree.nodes[id]))
        return fail();
    const allowed = new Set(input.scopeIds.flatMap(id => descendants(tree, id)));
    const excluded = new Set(input.excludedIds.flatMap(id => descendants(tree, id)));
    const nodes: BookmarkTree = { ...tree, nodes: Object.fromEntries(Object.entries(tree.nodes).map(([id, node]) => [id, { ...node }])) };
    const keys = new Set<string>();
    const creations = new Set<string>();
    for (const operation of input.operations) {
        if (!operation || !idValue(operation.id) || !idValue(operation.key) || keys.has(operation.key)
            || typeof operation.reason !== 'string' || operation.reason.length > 1000
            || (operation.confidence !== undefined && !['high', 'low'].includes(operation.confidence)))
            return fail();
        const fields = ['key', 'id', 'reason', 'confidence', 'type', ...(['create-folder', 'move'].includes(operation.type) ? ['parentId'] : []), ...(['create-folder', 'rename-folder'].includes(operation.type) ? ['title'] : [])];
        if (Object.keys(operation).some(key => !fields.includes(key)))
            return fail();
        keys.add(operation.key);
        if (input.mode === 'daily' && operation.type !== 'move')
            return fail();
        if ('title' in operation && !text(operation.title, 200))
            return fail();
        if ('parentId' in operation && !idValue(operation.parentId))
            return fail();
        if (operation.type === 'create-folder') {
            if (!operation.id.startsWith('new:') || nodes.nodes[operation.id] || creations.has(operation.id))
                return fail();
            const parent = nodes.nodes[operation.parentId];
            if (!canInsertInto(nodes, parent) || excluded.has(parent.id))
                return fail();
            // New folders belong to the selected structure, or to an allowed existing destination.
            nodes.nodes[operation.id] = { id: operation.id, title: operation.title, parentId: parent.id, type: 'folder' };
            creations.add(operation.id);
            allowed.add(operation.id);
            continue;
        }
        const node = nodes.nodes[operation.id];
        if (!allowed.has(operation.id) || excluded.has(operation.id) || !canMutateNode(nodes, node))
            return fail();
        if (descendants(nodes, operation.id).some(id => excluded.has(id)))
            return fail();
        if (input.mode === 'daily' && !node.url)
            return fail();
        if (operation.type === 'move') {
            const parent = nodes.nodes[operation.parentId];
            if (!canInsertInto(nodes, parent) || excluded.has(parent.id) || descendants(nodes, node.id).includes(parent.id))
                return fail();
            node.parentId = parent.id;
        }
        else if (operation.type === 'rename-folder') {
            if (node.url)
                return fail();
            node.title = operation.title;
        }
        else if (operation.type === 'remove-empty-folder') {
            if (node.url || Object.values(nodes.nodes).some(child => child.parentId === node.id))
                return fail();
            delete nodes.nodes[node.id];
        }
        else
            return fail();
    }
    return structuredClone(input);
}
export function operationDependsOn(operation: NativeOperation, failedIds: Set<string>): boolean {
    return failedIds.has(operation.id) || ('parentId' in operation && failedIds.has(operation.parentId));
}
export const canInsert = canInsertInto;
export const canMutate = canMutateNode;
