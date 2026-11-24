import type { BookmarkNode, BookmarkTree } from '../types';
import type { CaptureOrigin } from './provenance';
export const NATIVE_ORGANIZATION_CHANNEL = 'bookmark-atlas:native-organization:v1';
export type NativeMode = 'daily' | 'advanced';
type OperationBase = {
    key: string;
    id: string;
    reason: string;
    confidence?: 'high' | 'low';
};
export type NativeOperation = OperationBase & ({
    type: 'create-folder';
    parentId: string;
    title: string;
} | {
    type: 'rename-folder';
    title: string;
} | {
    type: 'move';
    parentId: string;
} | {
    type: 'remove-empty-folder';
});
export type NativeOrganizationPlan = {
    id: string;
    mode: NativeMode;
    baseline: BookmarkTree;
    scopeIds: string[];
    excludedIds: string[];
    operations: NativeOperation[];
};
export type NativeNodeState = Pick<BookmarkNode, 'id' | 'parentId' | 'index' | 'title' | 'url'> & {
    childIds: string[];
    folderPath: string;
};
export type NativeStep = {
    operation: NativeOperation;
    status: 'pending' | 'running' | 'done' | 'conflict' | 'failed' | 'restored';
    before?: NativeNodeState;
    after?: NativeNodeState;
    error?: string;
    restoring?: boolean;
};
export type NativePathChange = {
    beforeIdentityUnique?: boolean;
    bookmarkId: string;
    url: string;
    title: string;
    beforePath: string;
    afterPath: string;
};
export type NativeJournal = {
    id: string;
    plan: NativeOrganizationPlan;
    createdAt: number;
    updatedAt: number;
    status: 'running' | 'completed' | 'partial' | 'restoring' | 'restored' | 'needs-review';
    steps: NativeStep[];
    idMap: Record<string, string>;
    restoredIdMap?: Record<string, string>;
    restoreBaseline?: BookmarkTree;
    originSnapshot?: CaptureOrigin[];
    pathChanges: NativePathChange[];
};
export class NativeOrganizationError extends Error {
    constructor(public readonly code: string) { super(code); this.name = 'NativeOrganizationError'; }
}
