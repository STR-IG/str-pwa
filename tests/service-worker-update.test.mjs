import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../service-worker.js',import.meta.url),'utf8');
function setup({offline=false,ok=true,cacheFails=false,cached=true}={}) {
  const handlers={},deleted=[],writes=[],requests=[],matches=[],pending=[];
  let claimed=false,skipped=false;
  const context=vm.createContext({URL,Promise,Set,
    self:{registration:{scope:'https://str-ig.github.io/str-pwa/'},addEventListener:(k,v)=>handlers[k]=v,skipWaiting:()=>skipped=true,clients:{claim:async()=>claimed=true}},
    caches:{keys:async()=>['str-ig-cache-v58','str-ig-cache-v59','other-app-cache'],delete:async k=>deleted.push(k),
      open:async name=>({put:async(request,value)=>{if(cacheFails)throw Error('quota');writes.push({name,request,value});}}),
      match:async(request,options)=>{matches.push(options);return cached?{version:'cached'}:undefined;}},
    fetch:async(request,options)=>{requests.push({request,options});if(offline)throw Error('offline');return {ok,type:'basic',version:'current',clone(){return this;}};}
  });
  vm.runInContext(source,context);
  async function load(url,mode='navigate',method='GET') {
    let result;handlers.fetch({request:{url,mode,method},respondWith:p=>result=p,waitUntil:p=>pending.push(p)});
    const response=await result;await Promise.all(pending);return response;
  }
  return {handlers,deleted,writes,requests,matches,load,claimed:()=>claimed,skipped:()=>skipped};
}
test('activation claims users and deletes old PWA caches only',async()=>{
  const app=setup();app.handlers.install({});let done;app.handlers.activate({waitUntil:p=>done=p});await done;
  assert.equal(app.claimed(),true);assert.equal(app.skipped(),true);assert.deepEqual(app.deleted,['str-ig-cache-v58']);
});
for(const mode of ['navigate','cors'])test(`${mode}: current public files replace the old cache`,async()=>{
  const app=setup();assert.equal((await app.load('https://str-ig.github.io/str-pwa/permisos-publicos.html',mode)).version,'current');
  assert.equal(app.requests[0].options.cache,'no-store');assert.equal(app.writes[0].name,'str-ig-cache-v59');
});
test('public offline fallback is restricted to the current cache',async()=>{
  const app=setup({offline:true});assert.equal((await app.load('https://str-ig.github.io/str-pwa/index.html')).version,'cached');
  assert.equal(app.matches[0].cacheName,'str-ig-cache-v59');
});
test('private pages, queries, signed URLs and API calls bypass PWA caching',async()=>{
  const app=setup();for(const url of [
    'https://icneigdnuntzugisexaz.supabase.co/storage/v1/object/sign/payroll-documents/example?token=secret',
    'https://icneigdnuntzugisexaz.supabase.co/rest/v1/private_access_allowlist',
    'https://str-ig.github.io/str-pwa/auth-callback.html?code=secret',
    'https://str-ig.github.io/str-pwa/comunicados-internos.html',
    'https://str-ig.github.io/str-pwa/revisa-tu-nomina.html',
    'https://str-ig.github.io/other-app/index.html'
  ])assert.equal(await app.load(url),undefined);
  assert.equal(app.requests.length,0);assert.equal(app.writes.length,0);assert.equal(app.matches.length,0);
});
test('failed responses never replace valid public cached files',async()=>{
  const app=setup({ok:false});await app.load('https://str-ig.github.io/str-pwa/index.html');assert.equal(app.writes.length,0);
});
test('cache quota failure does not break online navigation',async()=>{
  const app=setup({cacheFails:true});assert.equal((await app.load('https://str-ig.github.io/str-pwa/index.html')).version,'current');
});
test('an uncached offline request rejects instead of returning undefined',async()=>{
  const app=setup({offline:true,cached:false});await assert.rejects(app.load('https://str-ig.github.io/str-pwa/index.html'),/offline/);
});
