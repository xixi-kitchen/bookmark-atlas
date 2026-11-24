import { afterEach, describe, expect, it, vi } from 'vitest';
import { normalizeBookmarkTree } from '../normalize';
import { loadJournalRecords, saveJournalRecords, NATIVE_ORGANIZATION_KEY } from './journal';
import type { NativeJournal } from './types';

function record(id: string,status: NativeJournal['status']='completed'): NativeJournal {
  return {id,createdAt:Number(id),updatedAt:Number(id),status,idMap:{},pathChanges:[],steps:[],
    plan:{id,mode:'daily',scopeIds:['1'],excludedIds:[],operations:[],baseline:normalizeBookmarkTree([{id:'0',title:'',children:[{id:'1',title:'Bookmarks',parentId:'0',children:[]}]}])}};
}
afterEach(()=>vi.unstubAllGlobals());
describe('organization journal storage',()=>{
  it('keeps ten completed records and every unfinished record',async()=>{
    const stored: Record<string,unknown>={};
    vi.stubGlobal('chrome',{storage:{local:{get:async()=>stored,set:async(value:object)=>Object.assign(stored,value)}}});
    await saveJournalRecords([...Array.from({length:12},(_,i)=>record(String(i+1))),record('20','needs-review')]);
    const results=await loadJournalRecords();
    expect(results).toHaveLength(11);expect(results.some(item=>item.id==='20')).toBe(true);expect(results.some(item=>item.id==='1')).toBe(false);
    expect(results[0]!.plan.baseline.nodes['0']?.children).toBeUndefined();
  });
  it('rejects corrupted saved history without silently replacing it',async()=>{
    vi.stubGlobal('chrome',{storage:{local:{get:async()=>({[NATIVE_ORGANIZATION_KEY]:{version:1,records:[{id:'broken'}]}})}}});
    await expect(loadJournalRecords()).rejects.toThrow('invalid_history');
  });
  it('reports a storage failure to the executor before mutation',async()=>{
    vi.stubGlobal('chrome',{storage:{local:{set:async()=>{throw Error('quota');}}}});
    await expect(saveJournalRecords([record('1')])).rejects.toThrow('quota');
  });
});

it('reads the durable IndexedDB journal when the small change notification cannot be written',async()=>{
 let saved:unknown;
 const db={objectStoreNames:{contains:()=>true},close:vi.fn(),transaction:(_store:string,mode:string)=>{
  const transaction:any={objectStore:()=>({
   put:(value:unknown)=>{const request={result:undefined};queueMicrotask(()=>{saved=structuredClone(value);transaction.oncomplete?.();});return request;},
   get:()=>{const request={result:saved};queueMicrotask(()=>transaction.oncomplete?.());return request;},
  })};return transaction;
 }};
 vi.stubGlobal('indexedDB',{open:()=>{const request:any={result:db};queueMicrotask(()=>request.onsuccess?.());return request;}});
 vi.stubGlobal('chrome',{storage:{local:{get:vi.fn(),set:async()=>{throw Error('quota');}}}});
 await saveJournalRecords([record('1')]);
 expect((await loadJournalRecords())[0]?.id).toBe('1');expect(db.close).toHaveBeenCalledTimes(2);
});
