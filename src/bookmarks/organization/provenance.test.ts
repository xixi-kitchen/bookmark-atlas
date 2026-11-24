import { afterEach, describe, expect, it, vi } from 'vitest';
import { normalizeBookmarkTree } from '../normalize';
import { adoptHistoricalOrigins, loadCaptureOrigins, recordCapturedBookmark, markOriginsOrganized } from './provenance';

afterEach(()=>vi.unstubAllGlobals());
function storage(){const stored:Record<string,unknown>={};vi.stubGlobal('chrome',{storage:{local:{get:async()=>stored,set:async(value:object)=>Object.assign(stored,value)}}});}
const input={bookmarkId:'b',url:'https://example.com',title:'Example',parentId:'a',folderPath:'Other / Bookmark Atlas',created:true,organized:false};
describe('capture provenance',()=>{
 it('preserves a confirmed creation when a retry reuses the bookmark',async()=>{storage();await recordCapturedBookmark(input);await recordCapturedBookmark({...input,created:false});expect((await loadCaptureOrigins())[0]).toMatchObject({created:true,organized:false});});
 it('marks explicit historical adoption without falsely claiming creation',async()=>{
  storage(); const tree=normalizeBookmarkTree([{id:'0',title:'',children:[{id:'2',title:'Other',parentId:'0',children:[{id:'a',title:'Bookmark Atlas',parentId:'2',children:[{id:'b',parentId:'a',title:'Example',url:'https://example.com'}]}]}]}]);
  await adoptHistoricalOrigins(['b'],tree); expect((await loadCaptureOrigins())[0]).toMatchObject({created:false,adopted:true,organized:false});
  await recordCapturedBookmark({...input,created:false});expect((await loadCaptureOrigins())[0]?.adopted).toBe(true);
 });
 it('rejects missing or unmodifiable historical candidates',async()=>{storage();const tree=normalizeBookmarkTree([{id:'0',title:'',children:[{id:'b',parentId:'0',title:'Locked',url:'https://example.com',unmodifiable:'managed'}]}]);await expect(adoptHistoricalOrigins(['b'],tree)).rejects.toThrow('invalid_origin');});
});
