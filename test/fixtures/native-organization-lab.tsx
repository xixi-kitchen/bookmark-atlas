import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createMemoryBookmarkAdapter } from '../../src/bookmarks/adapter';
import { createDemoBookmarkTree } from '../../src/bookmarks/demoData';
import { BookmarkOrganizer } from '../../src/bookmarks/organization/BookmarkOrganizer';
import { createNativeOrganizationHandler } from '../../src/bookmarks/organization/background';
import { loadJournalRecords, saveJournalRecords } from '../../src/bookmarks/organization/journal';
import { markOriginsOrganized, recordCapturedBookmark } from '../../src/bookmarks/organization/provenance';
import { retainCanvasPathChanges } from '../../src/bookmarks/organization/canvasChanges';
import { CapturePopup } from '../../src/capture/CapturePopup';
import { createCaptureMessageHandler } from '../../src/capture/captureBackground';
import { createEmbedCaptureMessageHandler } from '../../src/capture/embedCaptureBackground';
import { CAPTURE_STORAGE_KEY } from '../../src/capture/captureQueue';
import { EMBED_CAPTURE_STORAGE_KEY } from '../../src/capture/embedCaptureQueue';
import { saveLocalAISettings } from '../../src/ai/client';
import { initializeLanguagePreference } from '../../src/i18n/languagePreference';
import '../../entrypoints/newtab/style.css';

// This lab drives a separate, in-memory browser bookmark adapter.
const query = new URLSearchParams(location.search);
const demoAI = query.get('ai') === 'demo' || query.get('ai') === 'empty';
const examples = [
  ['Chrome Extensions Docs', 'https://developer.chrome.com/docs/extensions'],
  ['Quick Start – React', 'https://react.dev/learn'],
  ['JavaScript Guide – MDN', 'https://developer.mozilla.org/zh-CN/docs/Web/JavaScript/Guide'],
  ['Excalidraw Whiteboard', 'https://excalidraw.com/'],
  ['Figma', 'https://www.figma.com/'],
  ['Wikipedia', 'https://www.wikipedia.org/'],
  ['Bilibili', 'https://www.bilibili.com/'],
  ['YouTube', 'https://www.youtube.com/'],
];
const sampleBookmarks = examples.map(([title, url], index) => ({id: String(100 + index), parentId:'21', title:title!,url:url!,index}));
const demoTree = [{id:'0',title:'',children:[{id:'1',parentId:'0',title:'Bookmarks Bar',children:[]},{id:'2',parentId:'0',folderType:'other',title:'Other Bookmarks',children:[{id:'21',parentId:'2',title:'Bookmark Atlas',children:sampleBookmarks}]}]}];
const adapter = createMemoryBookmarkAdapter(demoAI ? demoTree : createDemoBookmarkTree());
const popup = query.has('popup');
if (popup) await import('../../entrypoints/popup/style.css');
const language = query.get('lang') === 'zh-CN' ? 'zh-CN' : 'en';
const storage: Record<string, unknown> = { 'bookmark-atlas:ui-language:v1': language, 'bookmark-atlas:capture-open-after-save:v1': false };
if (demoAI) storage['bookmark-atlas:capture-origins:v1'] = {version:1,items:sampleBookmarks.map(node=>({bookmarkId:node.id,url:node.url,title:node.title,parentId:'21',folderPath:'Other Bookmarks / Bookmark Atlas',created:true,organized:false,createdAt:Date.now()}))};
const listeners = new Set<(changes: Record<string, unknown>, area: string) => void>();
const event = { addListener: () => {}, removeListener: () => {} };
const extensionId = 'lab';
const url = (path: string) => `chrome-extension://${extensionId}/${path}`;
const rawTree = async () => {
  const tree = await adapter.getTree();
  return tree.rootIds.map(id => tree.nodes[id]!);
};
const captureRuntime = {
  extensionId, getURL: url,
  getTab: async () => ({ id: 7, windowId: 1, active: true, title: 'Research article', url: 'https://example.com/research' }),
  getBookmarkTree: rawTree,
  createBookmark: (input: { parentId: string; title: string; url?: string }) => adapter.create(input),
  readStorage: async () => storage[CAPTURE_STORAGE_KEY],
  writeStorage: async (intents: unknown[], acknowledged: unknown[]) => { storage[CAPTURE_STORAGE_KEY] = { version: 1, intents, acknowledged }; },
  createTab: async () => ({}), randomId: () => crypto.randomUUID(), now: () => Date.now(),
  recordCapture: recordCapturedBookmark,
};
const captures = createCaptureMessageHandler(captureRuntime);
const embeds = createEmbedCaptureMessageHandler({ ...captureRuntime,
  readEmbedStorage: async () => storage[EMBED_CAPTURE_STORAGE_KEY],
  writeEmbedStorage: async (intents, receipts) => { storage[EMBED_CAPTURE_STORAGE_KEY] = { version: 2, intents, receipts }; },
});
const handler = createNativeOrganizationHandler({
  adapter, load: loadJournalRecords, save: saveJournalRecords, now: () => Date.now(),
  removeEmptyFolder: async id => { const tree = await adapter.getTree(); if (tree.nodes[id]?.childIds?.length) throw Error('not_empty'); await adapter.removeTree(id); },
  afterChange: async (ids, tree, changes, restoring, origins) => { await markOriginsOrganized(ids, tree, restoring, origins); await retainCanvasPathChanges(changes); },
}, extensionId, url);
Object.defineProperty(globalThis, 'chrome', { configurable: true, value: {
  runtime: { id: extensionId, getURL: url, getManifest: () => ({ version: '0.9.8' }),
    sendMessage: (message: { channel: string }) => message.channel === 'bookmark-atlas:capture:v1'
      ? captures(message, { id: extensionId, url: url('popup.html') })
      : message.channel === 'bookmark-atlas:capture:v2' ? embeds(message, { id: extensionId, url: url('popup.html') })
      : handler(message, { id: extensionId, url: url('newtab.html') }),
  },
  i18n: { getUILanguage: () => language },
  permissions: {contains:async()=>true,request:async()=>true},
  bookmarks: { getTree: rawTree, onCreated: event, onChanged: event, onMoved: event, onRemoved: event },
  tabs: { query: async () => [await captureRuntime.getTab()], create: async () => ({}) },
  storage: {
    local: {
      get: async (keys: string | string[]) => Object.fromEntries((Array.isArray(keys) ? keys : [keys]).map(key => [key, storage[key]])),
      set: async (values: Record<string, unknown>) => { Object.assign(storage, values); listeners.forEach(listener => listener(Object.fromEntries(Object.entries(values).map(([key, newValue]) => [key, { newValue }])), 'local')); },
    },
    onChanged: { addListener: (listener: (changes: Record<string, unknown>, area: string) => void) => listeners.add(listener), removeListener: (listener: (changes: Record<string, unknown>, area: string) => void) => listeners.delete(listener) },
  },
} });

if (demoAI) {
  const actualFetch = globalThis.fetch.bind(globalThis);
  globalThis.fetch = async (input, options) => {
    if (String(input) !== 'https://planner.example/v1/chat/completions') return actualFetch(input, options);
    const body = JSON.parse(String(options?.body));
    const payload = JSON.parse(body.messages[1].content);
    const labels = language === 'zh-CN' ? ['开发','设计','阅读','视频'] : ['Development','Design','Reading','Videos'];
    let response;
    if (payload.sampleItems) response = {folders:query.get('ai')==='empty'?[]:labels.map((title,index)=>({type:'create-folder',id:'n'+(index+1),parentId:payload.organizationRootId,title,reason:'Based on the supplied titles and domains',confidence:'high'}))};
    else response = {assignments:query.get('ai')==='empty'?[]:payload.items.map((item:{id:string;domain:string})=>({id:item.id,folderId:/figma|excalidraw/.test(item.domain)?'n2':/wikipedia/.test(item.domain)?'n3':/youtube|bilibili/.test(item.domain)?'n4':'n1',reason:'Topic matches this category',confidence:'high'}))};
    return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify(response)}}]}),{headers:{'content-type':'application/json'}});
  };
}

function Lab() {
  const [tree, setTree] = useState<Awaited<ReturnType<typeof adapter.getTree>> | null>(null);
  useEffect(() => {
    const refresh = () => { void adapter.getTree().then(setTree); };
    const stop = adapter.subscribe(refresh); refresh(); return stop;
  }, []);
  if (popup) return <CapturePopup />;
  return tree && <BookmarkOrganizer tree={tree} selectedIds={tree.orderedIds.filter(id => tree.nodes[id]!.url).slice(0, 2)}
    onClose={() => {}} onOpenAISettings={() => {}} onChanged={() => { void adapter.getTree().then(setTree); }} />;
}
void initializeLanguagePreference().then(async () => { if (demoAI) await saveLocalAISettings({baseUrl:'https://planner.example/v1',model:'local-fixture',apiKey:'demo-not-a-real-key'}); createRoot(document.getElementById('root')!).render(<Lab />); });
