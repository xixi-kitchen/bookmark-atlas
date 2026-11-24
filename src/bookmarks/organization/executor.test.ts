import { describe, expect, it, vi } from 'vitest';
import { normalizeBookmarkTree } from '../normalize';
import type { BookmarkAdapter, BookmarkTree } from '../types';
import { createOrganizationExecutor } from './executor';
import { validateNativePlan } from './tree';
import type { NativeOrganizationPlan, NativeJournal } from './types';

function fixture() {
  let tree = normalizeBookmarkTree([{ id: '0', title: '', children: [
    { id: '1', parentId: '0', index:0, title: 'Bookmarks bar', folderType: 'bookmarks-bar', children: [
      { id: 'a', parentId:'1', index:0, title: 'Work', children: [{ id: 'b', title: 'Article', url: 'https://example.com', parentId: 'a', index: 0 }] },
      { id: 'c', parentId:'1', index:1, title: 'Reading', children: [] },
    ] },
  ] }]);
  let records: NativeJournal[] = [];
  let counter = 0;
  const rebuild = () => {
    const nodes = tree.nodes;
    const visit = (id: string,index?: number): any => ({ ...nodes[id], index:index ?? nodes[id]?.index, children: nodes[id]?.url ? undefined : Object.values(nodes).filter(n => n.parentId === id).sort((a,b) => (a.index ?? 0) - (b.index ?? 0)).map((n,index) => visit(n.id,index)) });
    tree = normalizeBookmarkTree(tree.rootIds.map(id=>visit(id)));
  };
  const adapter = {
    getTree: vi.fn(async () => structuredClone(tree)),
    create: vi.fn(async (input: any) => { if(input.index!==undefined)for(const existing of Object.values(tree.nodes))if(existing.parentId===input.parentId && (existing.index ?? 0)>=input.index)existing.index=(existing.index ?? 0)+1; const node = { ...input, id: `made-${++counter}`, index: input.index ?? Object.values(tree.nodes).filter(n => n.parentId === input.parentId).length }; tree.nodes[node.id] = node; rebuild(); return tree.nodes[node.id]!; }),
    move: vi.fn(async (id: string, input: any) => {
      const node=tree.nodes[id]!;
      for(const sibling of Object.values(tree.nodes)) if(sibling.id!==id && sibling.parentId===node.parentId && (sibling.index ?? 0)>(node.index ?? 0)) sibling.index=(sibling.index ?? 0)-1;
      const children=Object.values(tree.nodes).filter(child=>child.parentId===input.parentId && child.id!==id);
      const index=Math.min(input.index ?? children.length,children.length);
      for(const child of children) if((child.index ?? 0)>=index) child.index=(child.index ?? 0)+1;
      node.parentId=input.parentId;node.index=index;rebuild();return tree.nodes[id]!;
    }),
    update: vi.fn(async (id: string, input: any) => { Object.assign(tree.nodes[id]!, input); rebuild(); return tree.nodes[id]!; }),
    removeTree: vi.fn(async (id: string) => { const node = tree.nodes[id]!; delete tree.nodes[id]; rebuild(); return {node, parentId:node.parentId,index:node.index,deletedAt:1,subtree:[node]}; }),
    restore: vi.fn(), subscribe: vi.fn(() => () => {}),
  } as unknown as BookmarkAdapter;
  const runtime = {
    adapter, now: () => 100,
    removeEmptyFolder:async (id: string)=>{if(Object.values(tree.nodes).some(node=>node.parentId===id)) throw Error('not empty');await adapter.removeTree(id);},
    load: async () => structuredClone(records),
    save: vi.fn(async (value: NativeJournal[]) => { records = structuredClone(value); }),
  };
  const plan = (): NativeOrganizationPlan => ({ id: 'plan-1', mode: 'daily', baseline: structuredClone(tree), scopeIds: ['b'], excludedIds: [], operations: [{ key:'move-b', type:'move', id:'b', parentId:'c', reason:'Reading' }] });
  return { runtime, adapter, plan, get tree() { return tree; }, get records() { return records; } };
}

describe('native organization validation', () => {
  it('rejects root mutation, excluded descendants, and cyclic folder moves', () => {
    const f=fixture(); const base=f.plan();
    expect(() => validateNativePlan({...base,operations:[{key:'x',type:'rename-folder',id:'1',title:'New',reason:''}],mode:'advanced',scopeIds:['1']})).toThrow();
    expect(() => validateNativePlan({...base,excludedIds:['a']})).toThrow();
    expect(() => validateNativePlan({...base,mode:'advanced',scopeIds:['a'],operations:[{key:'x',type:'move',id:'a',parentId:'a',reason:''}]})).toThrow();
  });
  it('rejects scope escape and daily folder operations', () => {
    const f=fixture();
    expect(() => validateNativePlan({...f.plan(),operations:[{key:'x',type:'rename-folder',id:'c',title:'New',reason:''}],mode:'advanced'})).toThrow();
    expect(() => validateNativePlan({...f.plan(),operations:[{key:'x',type:'create-folder',id:'new:x',parentId:'c',title:'New',reason:''}]})).toThrow();
  });
});

describe('durable native organization', () => {
  it('persists before mutation and restores a successful move', async () => {
    const f=fixture(); const executor=createOrganizationExecutor(f.runtime);
    const result=await executor.start(f.plan());
    expect(result.status).toBe('completed'); expect(f.tree.nodes.b?.parentId).toBe('c');
    expect(f.runtime.save.mock.invocationCallOrder[0]).toBeLessThan((f.adapter.move as any).mock.invocationCallOrder[0]);
    expect((await executor.restore(result.id)).status).toBe('restored');
    expect(f.tree.nodes.b?.parentId).toBe('a');
  });
  it('does not write native data when the first journal save fails', async () => {
    const f=fixture(); f.runtime.save.mockRejectedValueOnce(new Error('storage'));
    await expect(createOrganizationExecutor(f.runtime).start(f.plan())).rejects.toThrow('storage');
    expect(f.adapter.move).not.toHaveBeenCalled();
  });
  it('does not repeat an already completed plan or change a later user edit on restore', async () => {
    const f=fixture(); const executor=createOrganizationExecutor(f.runtime);
    await executor.start(f.plan());
    await executor.resume('plan-1'); expect(f.adapter.move).toHaveBeenCalledTimes(1);
    await f.adapter.update('b',{title:'User edit'});
    const result=await executor.restore('plan-1');
    expect(result.status).toBe('needs-review'); expect(f.tree.nodes.b?.parentId).toBe('c');
  });
  it('recovers a confirmed move whose post-write journal save failed', async () => {
    const f=fixture(); let writes=0;
    const save=f.runtime.save.getMockImplementation()!;
    f.runtime.save.mockImplementation(async value => { if(++writes===3) throw Error('storage'); await save(value); });
    await expect(createOrganizationExecutor(f.runtime).start(f.plan())).rejects.toThrow('storage');
    const result=await createOrganizationExecutor(f.runtime).resume('plan-1');
    expect(result.status).toBe('completed'); expect(f.adapter.move).toHaveBeenCalledTimes(1);
  });
  it('marks uncertain folder creation for review instead of guessing by name', async () => {
    const f=fixture(); const plan={...f.plan(),mode:'advanced' as const,scopeIds:['a','c'],operations:[{key:'new',type:'create-folder' as const,id:'new:x',parentId:'c',title:'Topic',reason:''}]};
    let writes=0; const save=f.runtime.save.getMockImplementation()!;
    f.runtime.save.mockImplementation(async value => { if(++writes===3) throw Error('storage'); await save(value); });
    await expect(createOrganizationExecutor(f.runtime).start(plan)).rejects.toThrow('storage');
    const result=await createOrganizationExecutor(f.runtime).resume(plan.id);
    expect(result.status).toBe('needs-review'); expect(f.adapter.create).toHaveBeenCalledTimes(1);
  });
  it('retains a newly added child when restoring a newly created folder', async () => {
    const f=fixture(); const plan={...f.plan(),mode:'advanced' as const,scopeIds:['c'],operations:[{key:'new',type:'create-folder' as const,id:'new:x',parentId:'c',title:'Topic',reason:''}]};
    const executor=createOrganizationExecutor(f.runtime); const result=await executor.start(plan);
    await f.adapter.create({parentId:result.idMap['new:x'],title:'Later',url:'https://later.example'});
    expect((await executor.restore(plan.id)).status).toBe('needs-review');
    expect(f.adapter.removeTree).not.toHaveBeenCalled();
  });
});

describe('multi-step organization and recovery', () => {
  it('restores a folder rename followed by a bookmark move in reverse order', async () => {
    const f=fixture(); const plan={...f.plan(),mode:'advanced' as const,scopeIds:['a','b'],operations:[
      {key:'rename',type:'rename-folder' as const,id:'a',title:'Projects',reason:'Topic'},
      ...f.plan().operations,
    ]};
    const executor=createOrganizationExecutor(f.runtime);
    expect((await executor.start(plan)).status).toBe('completed');
    const restored=await executor.restore(plan.id);
    expect(restored.status).toBe('restored'); expect(f.tree.nodes.a?.title).toBe('Work'); expect(f.tree.nodes.b?.parentId).toBe('a');
  });
  it('recreates an emptied and deleted source folder before restoring its children', async () => {
    const f=fixture(); const plan={...f.plan(),mode:'advanced' as const,scopeIds:['a'],operations:[
      ...f.plan().operations,{key:'remove',type:'remove-empty-folder' as const,id:'a',reason:'Clean empty source'},
    ]};
    const executor=createOrganizationExecutor(f.runtime);
    expect((await executor.start(plan)).status).toBe('completed'); expect(f.tree.nodes.a).toBeUndefined();
    const restored=await executor.restore(plan.id);
    expect(restored.status).toBe('restored');
    const restoredFolder=restored.restoredIdMap?.a;
    expect(restoredFolder).toBeTruthy(); expect(f.tree.nodes.b?.parentId).toBe(restoredFolder);
  });
  it('does not move bookmarks into a destination renamed since preview', async () => {
    const f=fixture(); const plan=f.plan(); await f.adapter.update('c',{title:'Secret'});
    const result=await createOrganizationExecutor(f.runtime).start(plan);
    expect(result.status).toBe('partial'); expect(f.adapter.move).not.toHaveBeenCalled();
  });
  it('retains independent successful operations alongside a conflict', async () => {
    const f=fixture(); const plan={...f.plan(),mode:'advanced' as const,scopeIds:['b','c'],operations:[
      ...f.plan().operations,{key:'rename',type:'rename-folder' as const,id:'c',title:'Projects',reason:'Topic'},
    ]};
    await f.adapter.update('b',{title:'Changed'});
    const result=await createOrganizationExecutor(f.runtime).start(plan);
    expect(result.status).toBe('partial'); expect(f.tree.nodes.c?.title).toBe('Projects'); expect(f.tree.nodes.b?.parentId).toBe('a');
  });
  it('retains reverse path changes so sleeping canvases can repair references', async () => {
    const f=fixture(); const afterChange=vi.fn(async()=>{}); const executor=createOrganizationExecutor({...f.runtime,afterChange});
    const forward=await executor.start(f.plan()); const restored=await executor.restore(forward.id);
    expect(forward.pathChanges[0]).toMatchObject({bookmarkId:'b',beforePath:'Bookmarks bar / Work',afterPath:'Bookmarks bar / Reading'});
    expect(restored.pathChanges[0]).toMatchObject({bookmarkId:'b',beforePath:'Bookmarks bar / Reading',afterPath:'Bookmarks bar / Work'});
    expect(afterChange).toHaveBeenCalledTimes(2);
  });
  it('retries path repair persistence after native work has already completed', async () => {
    const f=fixture(); const afterChange=vi.fn(async()=>{}).mockRejectedValueOnce(new Error('ledger'));
    await expect(createOrganizationExecutor({...f.runtime,afterChange}).start(f.plan())).rejects.toThrow('ledger');
    const result=await createOrganizationExecutor({...f.runtime,afterChange}).resume('plan-1');
    expect(result.status).toBe('completed');expect(f.adapter.move).toHaveBeenCalledTimes(1);expect(afterChange).toHaveBeenCalledTimes(2);
  });
});

describe('native readback conflicts',()=>{
 it('does not adopt a concurrent move as this operation result',async()=>{
  const f=fixture(); const move=f.adapter.move;
  f.adapter.move=vi.fn(async(id,input)=>{const own=await move(id,input);await move(id,{parentId:'1'});return own;});
  const executor=createOrganizationExecutor(f.runtime);
  const result=await executor.start(f.plan());
  expect(result.status).toBe('partial');expect(result.steps[0]?.status).toBe('conflict');
  expect(result.steps[0]?.after?.parentId).toBe('c');
  await executor.restore(result.id);
  expect(f.tree.nodes.b?.parentId).toBe('1');
 });
 it('uses atomic empty-folder removal when another writer adds a child',async()=>{
  const f=fixture(); const plan={...f.plan(),mode:'advanced' as const,scopeIds:['c'],operations:[{key:'remove',type:'remove-empty-folder' as const,id:'c',reason:'Empty'}]};
  f.runtime.removeEmptyFolder=async()=>{await f.adapter.create({parentId:'c',title:'Later',url:'https://later.example'});throw Error('not empty');};
  const result=await createOrganizationExecutor(f.runtime).start(plan);
  expect(result.status).toBe('needs-review');expect(f.tree.nodes.c).toBeTruthy();expect(f.adapter.removeTree).not.toHaveBeenCalled();
 });
});

it('lets a reviewed uncertain creation be skipped so confirmed earlier work can restore',async()=>{
 const f=fixture();const plan={...f.plan(),mode:'advanced' as const,scopeIds:['a','c'],operations:[...f.plan().operations,{key:'new',type:'create-folder' as const,id:'new:x',parentId:'c',title:'Topic',reason:'Topic'}]};
 let writes=0;const save=f.runtime.save.getMockImplementation()!;
 f.runtime.save.mockImplementation(async value=>{if(++writes===5)throw Error('storage');await save(value);});
 await expect(createOrganizationExecutor(f.runtime).start(plan)).rejects.toThrow('storage');
 const executor=createOrganizationExecutor(f.runtime);
 const resumed=await executor.resume(plan.id);expect(resumed.status).toBe('needs-review');
 await executor.acknowledge(plan.id,'new');
 const result=await executor.restore(plan.id);
 expect(result.status).toBe('needs-review');expect(f.tree.nodes.b?.parentId).toBe('a');expect(f.adapter.create).toHaveBeenCalledTimes(1);
});

it('idempotently accepts the same original plan after persisted baselines were compacted',async()=>{
 const f=fixture();const original=f.plan();const save=f.runtime.save.getMockImplementation()!;
 f.runtime.save.mockImplementation(async records=>{const compact=structuredClone(records);for(const record of compact)for(const node of Object.values(record.plan.baseline.nodes))delete node.children;await save(compact);});
 const executor=createOrganizationExecutor(f.runtime);
 await executor.start(original);
 expect((await executor.start(original)).status).toBe('completed');expect(f.adapter.move).toHaveBeenCalledTimes(1);
});

it('restores relative order when multiple siblings are moved in one plan',async()=>{
 const f=fixture();const other=await f.adapter.create({parentId:'a',title:'Second',url:'https://second.example'});
 const plan={...f.plan(),baseline:structuredClone(f.tree),scopeIds:['a'],operations:[...f.plan().operations,{key:'second',type:'move' as const,id:other.id,parentId:'c',reason:'Topic'}]};
 const executor=createOrganizationExecutor(f.runtime);expect((await executor.start(plan)).status).toBe('completed');
 const restored=await executor.restore(plan.id);expect(restored.status,JSON.stringify(restored.steps)).toBe('restored');
 expect(f.tree.nodes.b?.index).toBe(0);expect(f.tree.nodes[other.id]?.index).toBe(1);expect(f.tree.nodes[other.id]?.parentId).toBe('a');
});

it('marks old canvas identity ambiguous when an unchanged twin shares the moved bookmark identity',async()=>{
 const f=fixture();await f.adapter.create({parentId:'a',title:'Article',url:'https://example.com/#another-fragment'});
 const result=await createOrganizationExecutor(f.runtime).start({...f.plan(),baseline:structuredClone(f.tree)});
 expect(result.status).toBe('completed');expect(result.pathChanges[0]?.beforeIdentityUnique).toBe(false);
});

it('marks a unique old canvas identity as eligible for cross-device path repair',async()=>{
 const f=fixture();const result=await createOrganizationExecutor(f.runtime).start(f.plan());
 expect(result.pathChanges[0]?.beforeIdentityUnique).toBe(true);
});
