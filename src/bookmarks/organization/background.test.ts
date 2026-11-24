import { describe, expect, it, vi } from 'vitest';
import { normalizeBookmarkTree } from '../normalize';
import type { BookmarkAdapter } from '../types';
import type { NativeJournal, NativeOrganizationPlan } from './types';
import { createNativeOrganizationHandler, NATIVE_ORGANIZATION_CHANNEL } from './background';

const tree=normalizeBookmarkTree([{id:'0',title:'',children:[{id:'1',parentId:'0',title:'Bar',children:[{id:'a',parentId:'1',title:'A',children:[{id:'b',parentId:'a',index:0,title:'Page',url:'https://example.com'}]},{id:'c',parentId:'1',index:1,title:'C'}]}]}]);
const getURL=(path: string)=>`chrome-extension://test/${path}`;
const sender={id:'test',url:getURL('newtab.html')};
function fixture(){
 let records:NativeJournal[]=[];
 const adapter={getTree:vi.fn(async()=>structuredClone(tree)),create:vi.fn(),update:vi.fn(),move:vi.fn(),removeTree:vi.fn()} as unknown as BookmarkAdapter;
 const runtime={adapter,removeEmptyFolder:vi.fn(),now:()=>1,load:vi.fn(async()=>structuredClone(records)),save:vi.fn(async(next:NativeJournal[])=>{records=structuredClone(next);})};
 return {adapter,runtime,handler:createNativeOrganizationHandler(runtime,'test',getURL,vi.fn())};
}
function plan():NativeOrganizationPlan{return {id:'test-plan',mode:'daily',scopeIds:['b'],excludedIds:[],baseline:structuredClone(tree),operations:[{key:'move',type:'move',id:'b',parentId:'c',reason:'Topic'}]};}
describe('native organization background messages',()=>{
 it('rejects external senders and unknown message fields',async()=>{
  const f=fixture();
  expect(await f.handler({channel:NATIVE_ORGANIZATION_CHANNEL,action:'list'},{id:'other',url:getURL('newtab.html')})).toEqual({ok:false,error:'invalid_request'});
  expect(await f.handler({channel:NATIVE_ORGANIZATION_CHANNEL,action:'list',extra:true},sender)).toEqual({ok:false,error:'invalid_request'});
  expect(await f.handler({channel:NATIVE_ORGANIZATION_CHANNEL,action:'start',plan:plan()},{...sender,url:'https://example.com/newtab.html'})).toEqual({ok:false,error:'invalid_request'});
  expect(f.adapter.move).not.toHaveBeenCalled();
 });
 it('allows history reads while a mutation is waiting for Chrome',async()=>{
  const f=fixture();let unblock!:()=>void;let entered!:()=>void;
  const started=new Promise<void>(resolve=>{entered=resolve;});
  (f.adapter.move as any).mockImplementation(async()=>{entered();await new Promise<void>(resolve=>{unblock=resolve;});});
  const running=f.handler({channel:NATIVE_ORGANIZATION_CHANNEL,action:'start',plan:plan()},sender);
  await started;
  const response=await f.handler({channel:NATIVE_ORGANIZATION_CHANNEL,action:'list'},sender) as any;
  expect(response.ok).toBe(true);expect(response.result[0].steps[0].status).toBe('running');
  unblock();await running;
 });
 it('rejects historical adoption outside the capture inbox',async()=>{
  const f=fixture();expect(await f.handler({channel:NATIVE_ORGANIZATION_CHANNEL,action:'adopt',ids:['b']},sender)).toEqual({ok:false,error:'invalid_origin'});
 });
});

describe('history cleanup',()=>{
 function record(status:NativeJournal['status']):NativeJournal{return {id:'old',plan:{...plan(),id:'old'},status,createdAt:1,updatedAt:1,idMap:{},steps:[],pathChanges:[]};}
 it('requires confirmation and an authenticated source before deleting completed history',async()=>{
  const f=fixture();await f.runtime.save([record('completed')]);f.runtime.save.mockClear();
  expect(await f.handler({channel:NATIVE_ORGANIZATION_CHANNEL,action:'forget',id:'old'},sender)).toEqual({ok:false,error:'confirmation_required'});
  expect(await f.handler({channel:NATIVE_ORGANIZATION_CHANNEL,action:'forget',id:'old',confirmed:true},{...sender,id:'other'})).toEqual({ok:false,error:'invalid_request'});
  expect(f.runtime.save).not.toHaveBeenCalled();
  expect(await f.handler({channel:NATIVE_ORGANIZATION_CHANNEL,action:'forget',id:'old',confirmed:true},sender)).toEqual({ok:true,result:null});
  expect(await f.runtime.load()).toEqual([]);expect(f.adapter.move).not.toHaveBeenCalled();expect(f.adapter.removeTree).not.toHaveBeenCalled();
 });
 it.each(['running','partial','needs-review','restoring'] as const)('preserves %s recovery records',async status=>{
  const f=fixture();await f.runtime.save([record(status)]);f.runtime.save.mockClear();
  expect(await f.handler({channel:NATIVE_ORGANIZATION_CHANNEL,action:'forget',id:'old',confirmed:true},sender)).toEqual({ok:false,error:'record_unresolved'});
  expect(f.runtime.save).not.toHaveBeenCalled();expect((await f.runtime.load())[0]?.status).toBe(status);
 });
 it('allows forgetting restored records without touching bookmarks',async()=>{
  const f=fixture();await f.runtime.save([record('restored')]);
  expect(await f.handler({channel:NATIVE_ORGANIZATION_CHANNEL,action:'forget',id:'old',confirmed:true},sender)).toEqual({ok:true,result:null});
  expect(await f.runtime.load()).toEqual([]);expect(f.adapter.removeTree).not.toHaveBeenCalled();
 });
});
