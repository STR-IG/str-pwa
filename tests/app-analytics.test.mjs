import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../app-analytics.js',import.meta.url),'utf8').replace('export async function','async function');
function setup(origin='https://str-ig.github.io',blocked=false){
  const requests=[];const storage={getItem:()=>null,setItem:()=>{}};
  const ctx={URL,Math,fetch:async(url,options)=>{requests.push(JSON.parse(options.body));return {ok:true};},
    location:{origin,pathname:'/str-pwa/index.html',hash:'#access_token=synthetic-secret',href:origin+'/str-pwa/index.html?email=private'},
    document:{documentElement:{dataset:{}},addEventListener(){}},localStorage:storage,sessionStorage:storage};
  if(blocked)Object.defineProperty(ctx,'localStorage',{get(){throw Error('storage blocked');}});
  vm.createContext(ctx);vm.runInContext(source,ctx);return {ctx,requests};
}
test('analytics sends paths without query strings or authentication fragments',()=>{
  const {requests}=setup();assert.equal(requests[0].path,'/str-pwa/index.html');assert.equal(requests[0].event_type,'page_view');
  assert.equal(JSON.stringify(requests).includes('synthetic-secret'),false);
});
test('local previews never write events into production',()=>assert.equal(setup('http://localhost:8000').requests.length,0));
test('storage restrictions do not prevent analytics initialization',()=>assert.equal(setup(undefined,true).requests.length,1));
test('fallback link targets exclude query strings and fragments',()=>{
  const {ctx}=setup();assert.equal(vm.runInContext("safeLinkTarget('https://example.org/path?email=private#token')",ctx),'/path');
});
