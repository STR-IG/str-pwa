import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {overtimeAmount, validateOvertime, renderOvertime, readOvertime, applyOvertime} from '../payroll-overtime.mjs';
import {renderSupplemental, readSupplemental} from '../payroll-supplemental.mjs';
import {bucketFor, documentHarness, extract, source, element} from './payroll-receipts.test.mjs';

test('receipt-specific prices, fractional hours and cent rounding; no inferred tariff', () => {
  for (const price of [20, 22, 24]) assert.equal(overtimeAmount(8, price), 8 * price);
  assert.equal(overtimeAmount('2,5', '22,1250'), 55.31);
  assert.equal(overtimeAmount(1, '1,005'), 1.01);
  assert.equal(overtimeAmount('0', '24'), 0);
  assert.equal(overtimeAmount('8', ''), null);
  assert.equal(overtimeAmount('', '24'), null);
  assert.equal(overtimeAmount(null, 24), null);
  assert.equal(overtimeAmount(8, -1), null);
});

test('missing price does not block saving hours; absent/unknown are distinct from zero', () => {
  const row = validateOvertime({status:'present', quantity:'8', unitPrice:''});
  assert.deepEqual(row, {code:'0029', status:'present', quantity:8, unitPrice:null, amount:null, unit:'hours'});
  assert.equal(validateOvertime({status:'present', unitPrice:'24'}).unitPrice, 24);
  assert.equal(validateOvertime({status:'present', quantity:'0', unitPrice:'20'}).amount, 0);
  for (const status of ['unknown','absent']) {
    const saved = validateOvertime({status, quantity:8, unitPrice:20});
    assert.equal(saved.status,status); assert.equal(saved.quantity,null); assert.equal(saved.amount,null);
  }
  for (const value of ['-1','abc','Infinity','20 euros','1e2','1,2,3','0,00001','1000001']) {
    assert.throws(() => validateOvertime({status:'present',quantity:value,unitPrice:20}),/Revisa/);
    assert.throws(() => validateOvertime({status:'present',quantity:8,unitPrice:value}),/Revisa/);
  }
  assert.equal(validateOvertime({status:'present',quantity:8,unitPrice:20,amount:999}).amount,160,'recalculate, never trust stored/model total');
});

// Simulated DOM: exercises the actual renderers, click bindings and persistence.
// This is not a replacement for a signed-in browser test on a real payroll.
function dom() {
  const nodes = new Map();
  function node(tag='div') {
    let content='';
    const item = Object.assign(element(), {tag, ownerDocument:root, children:[], style:{}, readOnly:false,
      append(...children){for(const child of children){child.parent=this;this.children.push(child);}},
      appendChild(child){this.append(child);return child;},
      closest(){return this.dataset.supplementalCode ? this : this.parent?.closest();},
      querySelectorAll(tag){return this.children.flatMap(child=>[...(child.tag===tag?[child]:[]),...child.querySelectorAll(tag)]);}
    });
    Object.defineProperty(item,'id',{get(){return this._id;},set(id){this._id=id;nodes.set(id,this);}});
    Object.defineProperty(item,'textContent',{get(){return content;},set(value){
      const remove = child => {if(child.id)nodes.delete(child.id);for(const nested of child.children)remove(nested);};
      for(const child of this.children)remove(child);this.children=[];content=value;
    }});
    return item;
  }
  const root = {createElement:node,getElementById:id=>nodes.get(id),nodes};
  return root;
}

function ui(bucket) {
  const root=dom();globalThis.document=root;
  const app=documentHarness(bucket);
  app.document={...root,getElementById(id){if(!root.getElementById(id)){const el=root.createElement();el.id=id;}return root.getElementById(id);}};
  const keys=['meals','rotation','night','shift','holiday','shift12','holidayDiets','vacation'];
  Object.assign(app, {COMPARABLE_KEYS:keys,PAYROLL_VARIABLES:keys.map(key=>({key,label:key,max:200})),
    renderOvertime,readOvertime:()=>readOvertime(root),renderSupplemental,readSupplemental:()=>readSupplemental(root),
    comparisonFields:root.createElement(),comparisonForm:root.createElement(),comparisonRunning:false});
  for(const name of ['renderPayrollComparison','editPayrollValues','cancelPayrollEditing']) vm.runInContext(extract(name),app);
  const start=source.indexOf("    document.getElementById('edit-payroll-values').addEventListener");
  const end=source.indexOf('    async function startAnotherPayroll()',start);
  vm.runInContext(source.slice(start,end),app); // Actual production event bindings, not direct calls.
  return {app,root,values:new Map(keys.map(key=>[key,'0']))};
}

const type = (root,id,value) => {
  const input=root.getElementById(id);
  assert.equal(input.readOnly,false,`${id} is writable`);assert.equal(input.disabled,false);
  input.value=value;input.listeners.input();
};

test('new form, live total, manual correction, saved edit/cancel/save and reopening',async(t)=>{
  t.after(()=>delete globalThis.document);
  const bucket=bucketFor('owner-a');const {app,root,values}=ui(bucket);
  await app.loadStoredDocuments();app.renderPayrollComparison(values);
  app.documents.payroll.confirmed=true;app.documents.timesheet.confirmed=true;
  applyOvertime({code:'0029',quantity:8,unitPrice:20},root);
  assert.match(root.getElementById('overtime-amount').textContent,/160,00/);
  type(root,'overtime-unitPrice','24');
  applyOvertime({code:'0029',quantity:100,unitPrice:100},root);
  assert.equal(readOvertime(root).amount,192,'late IA response cannot overwrite manual input');
  await app.confirmComparisonButton.click();
  const path=app.storagePath('review');const original=bucket.objects.get(path);
  assert.equal(JSON.parse(await original.text()).overtime.unitPrice,24);
  assert.equal(root.getElementById('overtime-quantity').readOnly,true);
  const edit=app.document.getElementById('edit-payroll-values');assert.equal(edit.hidden,false);
  await edit.click();type(root,'overtime-quantity','9');
  type(root,'supplemental-7001-quantity','5');type(root,'supplemental-7001-amount','119,90');
  await app.document.getElementById('cancel-payroll-edit').click();
  assert.equal(root.getElementById('overtime-quantity').value,'8');assert.equal(bucket.objects.get(path),original);
  await edit.click();type(root,'overtime-unitPrice','');
  await app.confirmComparisonButton.click();
  assert.equal(app.comparisonError.hidden,true);
  const saved=JSON.parse(await bucket.objects.get(path).text());
  assert.equal(saved.overtime.quantity,8);assert.equal(saved.overtime.unitPrice,null);assert.equal(saved.overtime.amount,null);
  assert.equal(saved.payroll['0029'],undefined);assert.deepEqual(saved.comparisons,{});
  const reopened=ui(bucket);await reopened.app.loadStoredDocuments();
  const review=reopened.app.monthlyReviews.get(reopened.app.periodKey());
  reopened.app.renderPayrollComparison(values,true,review);
  assert.equal(reopened.root.getElementById('overtime-quantity').value,'8');
  assert.equal(reopened.root.getElementById('overtime-unitPrice').value,'');
});

test('different receipts retain distinct rates, failed save retains original, other owner denied',async(t)=>{
  t.after(()=>delete globalThis.document);
  const bucket=bucketFor('owner-a');const {app,root,values}=ui(bucket);
  await app.loadStoredDocuments();
  const paths=[];
  for(const [id,price] of [['receipt-one','20'],['receipt-two','24']]) {
    app.activeReceiptId=id;app.renderPayrollComparison(values);
    assert.equal(root.getElementById('overtime-unitPrice').value,'','never copy the previous receipt rate');
    type(root,'overtime-quantity','8');type(root,'overtime-unitPrice',price);
    await app.confirmComparisonButton.click();paths.push(app.storagePath('review'));
  }
  const one=JSON.parse(await bucket.objects.get(paths[0]).text());
  const two=JSON.parse(await bucket.objects.get(paths[1]).text());
  assert.equal(one.overtime.amount,160);assert.equal(two.overtime.amount,192);
  const before=bucket.objects.get(paths[1]);
  await app.document.getElementById('edit-payroll-values').click();type(root,'overtime-unitPrice','22');
  bucket.failUploads=true;await app.confirmComparisonButton.click();
  assert.equal(bucket.objects.get(paths[1]),before);assert.equal(app.comparisonError.hidden,false);
  assert.equal(root.getElementById('overtime-unitPrice').readOnly,false,'can retry after failure');
  const other=bucketFor('owner-b',bucket.objects);
  for(const path of paths){assert.ok((await other.download(path)).error);assert.ok((await other.upload(path,new Blob(['x']),{upsert:true})).error);}
});

test('unknown/absent UI stays optional, entering zero works, model omission never invents absence', (t)=>{
  t.after(()=>delete globalThis.document);
  const root=dom();globalThis.document=root;
  renderOvertime(root.createElement(),{status:'absent'});
  type(root,'overtime-quantity','0');type(root,'overtime-unitPrice','22');
  assert.equal(readOvertime(root).amount,0);assert.equal(readOvertime(root).status,'present');
  renderOvertime(root.createElement());
  applyOvertime(null,root);assert.equal(readOvertime(root).status,'unknown');
  applyOvertime({code:'9G01',quantity:1,unitPrice:999},root);assert.equal(readOvertime(root).quantity,null);
  applyOvertime({code:'0029',quantity:8,unitPrice:null},root);
  assert.equal(readOvertime(root).quantity,8);assert.equal(readOvertime(root).amount,null);
});

test('IA normalizer accepts only one exact 0029 row, preserves unknowns and rejects invalid rates',()=>{
  const code=readFileSync(new URL('../supabase/functions/lab-read-payroll-variables/index.ts',import.meta.url),'utf8');
  const fn=code.slice(code.indexOf('function normalizeOvertime('),code.indexOf('function parseModelJson(')).replace(/: any|: unknown/g,'');
  const ctx=vm.createContext({});vm.runInContext(fn,ctx);
  assert.equal(ctx.normalizeOvertime([{code:'0029',quantity:'2,5',unitPrice:'22,1250'}]).unitPrice,22.125);
  assert.equal(ctx.normalizeOvertime([{code:'0029',quantity:'8',unitPrice:null}]).unitPrice,null);
  assert.equal(ctx.normalizeOvertime([{code:'0029',quantity:0,unitPrice:20}]).quantity,0);
  assert.equal(ctx.normalizeOvertime([{code:'0029',unitPrice:-1}]).unitPrice,null);
  assert.equal(ctx.normalizeOvertime([{code:'0029'},{code:'0029'}]),null);
  assert.equal(ctx.normalizeOvertime([{code:'9G01',quantity:2,unitPrice:100}]),null);
  assert.match(code,/includeOvertime === true/);assert.match(code,/admin.auth.getUser\(token\)/);
  assert.match(code,/private_access_allowlist/);assert.match(code,/return json\(\{ isPayroll: true, concepts \}\)/);
});

test('overtime cannot leak into regular festive/night/12-hour comparisons',()=>{
  const ctx=vm.createContext({normalizeOcrLine:s=>s.toUpperCase(),PAYROLL_MATCH_ORDER:['holiday'],PAYROLL_VARIABLES:[{key:'holiday',payrollPatterns:[/FESTIVO/]}]});
  vm.runInContext(extract('matchPayrollVariable'),ctx);
  assert.equal(ctx.matchPayrollVariable('0029 Horas extras festivo 8 24,00 192,00'),null);
  const vision=readFileSync(new URL('../payroll-vision-lab.js',import.meta.url),'utf8');
  vm.runInContext(vision.slice(vision.indexOf('  function norm('),vision.indexOf('  function markAsRead(')),ctx);
  assert.equal(ctx.conceptKey('0029 Horas extras nocturnas'),'');assert.equal(ctx.conceptKey('Horas extraordinarias festivo'),'');
  const patch=readFileSync(new URL('../payroll-lab-patch.js',import.meta.url),'utf8');
  vm.runInContext(patch.slice(patch.indexOf('  function normalizeLine('),patch.indexOf('  function markAsAutoRead(')),ctx);
  assert.equal(ctx.findQuantity('0029 Horas extras festivo 8 24,00 192,00\n0017 Plus Festivo 50 835,00',{labels:[/FESTIVO/],max:200,integer:false,exclude:[]}),'50');
});

test('full Edge handler: opt-in API, auth gating and partial IA result without live data',async()=>{
  const raw=readFileSync(new URL('../supabase/functions/lab-read-payroll-variables/index.ts',import.meta.url),'utf8');
  const code=stripTypeScriptTypes(raw.replace(/^import .*;\n/gm,''));
  let handler,allowed=true,requests=0;
  const model={isPayroll:true,concepts:[{name:'Plus festivo',value:'8'},{name:'0029 Horas extras festivas',value:'4'},
    {name:'0003 Complemento Personal',value:'30'}], supplemental:[
      {code:'0003',quantity:30,unitPrice:1.4717,amount:44.15},
      {code:'0053',quantity:30,unitPrice:1.01,amount:30.3},
      {code:'7001',quantity:5,amount:119.9}],overtime:[{code:'0029',quantity:8,unitPrice:null}]};
  const ctx=vm.createContext({Request,Response,console,
    Deno:{serve(fn){handler=fn;},env:{get(){return 'synthetic-test-only';}}},
    createClient(){return {auth:{async getUser(){return {data:{user:{email:'test@example.invalid'}},error:null};}},
      from(){return {select(){return this;},ilike(){return this;},eq(){return this;},async maybeSingle(){return {data:allowed?{}:null,error:null};}};}};},
    async fetch(url,options){requests++;const payload=JSON.parse(options.body);
      assert.equal(url,'https://api.openai.com/v1/responses');
      if(payload.max_output_tokens===2200)assert.match(payload.input[0].content[0].text,/0003 Complemento Personal/);
      if(payload.input[0].content[0].text.includes('"overtime"'))assert.match(payload.input[0].content[0].text,/No derives el precio/);
      return new Response(JSON.stringify({output_text:JSON.stringify(model)}));}
  });
  vm.runInContext(code,ctx);
  const request=(flags={},authorized=true)=>new Request('https://example.invalid/read',{method:'POST',
    headers:authorized?{Authorization:'Bearer synthetic-session','Content-Type':'application/json'}:{},
    body:JSON.stringify({imageDataUrl:'data:image/png;base64,synthetic',...flags})});
  assert.equal((await handler(request({},false))).status,401);assert.equal(requests,0);
  allowed=false;assert.equal((await handler(request())).status,403);assert.equal(requests,0);allowed=true;
  const legacy=await (await handler(request())).json();
  assert.equal(legacy.overtime,undefined);assert.equal(legacy.supplemental,undefined);
  const supplemental=await (await handler(request({includeSupplemental:true}))).json();
  assert.equal(supplemental.overtime,undefined);assert.equal(supplemental.supplemental[0].code,'0003');
  assert.equal(supplemental.supplemental[0].unitPrice,1.4717);
  const result=await (await handler(request({includeSupplemental:true,includeOvertime:true}))).json();
  assert.deepEqual(result.overtime,{code:'0029',quantity:8,unitPrice:null});
  assert.equal(result.concepts.length,1);assert.equal(result.supplemental[0].code,'0003');
  assert.equal(result.supplemental.at(-1).code,'7001');
  model.overtime=[{code:'0029',quantity:8,unitPrice:24}];
  const priced=await (await handler(request({includeOvertime:true}))).json();
  assert.equal(priced.overtime.unitPrice,24);assert.equal(priced.supplemental,undefined);
});
