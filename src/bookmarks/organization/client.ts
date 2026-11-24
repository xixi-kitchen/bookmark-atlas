import { NATIVE_ORGANIZATION_CHANNEL } from './types';
import { NATIVE_ORGANIZATION_KEY } from './journal';
import { NativeOrganizationError, type NativeJournal, type NativeOrganizationPlan } from './types';
async function send<T>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
    if (!globalThis.chrome?.runtime?.sendMessage)
        throw new NativeOrganizationError('unavailable');
    const result = await chrome.runtime.sendMessage({ channel: NATIVE_ORGANIZATION_CHANNEL, action, ...payload });
    if (!result || result.ok !== true)
        throw new NativeOrganizationError(typeof result?.error === 'string' ? result.error : 'failed');
    return result.result as T;
}
export function loadOrganizationHistory(): Promise<NativeJournal[]> { return send('list'); }
export function executeOrganization(plan: NativeOrganizationPlan): Promise<NativeJournal> { return send('start', { plan }); }
export function resumeOrganization(id: string): Promise<NativeJournal> { return send('resume', { id }); }
export function restoreOrganization(id: string): Promise<NativeJournal> { return send('restore', { id }); }
export function adoptHistoricalBookmarks(ids: string[]): Promise<void> { return send('adopt', { ids }); }
export function subscribeOrganizationHistory(listener: () => void): () => void {
    const event = globalThis.chrome?.storage?.onChanged;
    if (!event)
        return () => { };
    const changed = (changes: Record<string, unknown>, area: string) => { if (area === 'local' && NATIVE_ORGANIZATION_KEY in changes)
        listener(); };
    event.addListener(changed);
    return () => event.removeListener(changed);
}
export function acknowledgeOrganizationStep(id: string, key: string): Promise<NativeJournal> { return send('review-step', { id, key }); }

export function forgetOrganizationHistory(id: string): Promise<void> { return send('forget', { id, confirmed: true }); }
