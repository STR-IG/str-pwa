import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {SUPPLEMENTAL_CONCEPTS, decimal, validateSupplemental, renderSupplemental, readSupplemental, applySupplemental} from '../payroll-supplemental.mjs';
import {bucketFor, documentHarness, extract} from './payroll-receipts.test.mjs';

function dom() {
  const nodes = new Map();
  function node(tag) {
    return {tag,children:[],style:{},dataset:{},value:'',disabled:false,readOnly:false,listeners:{},
      set id(value){this._id=value;nodes.set(value,this);}, get id(){return this._id;},
      append(...children){for(const child of children){child.parent=this;this.children.push(child);}},
      appendChild(child){this.append(child);return child;},
      addEventListener(type,fn){this.listeners[type]=fn;},
      closest(){return this.dataset.supplementalCode ? this : this.parent?.closest();},
      querySelectorAll(tag){return this.children.flatMap(child=>[...(child.tag===tag?[child]:[]),...child.querySelectorAll(tag)]);}
    };
  }
  return {createElement:node,getElementById:id=>nodes.get(id)};
}

test('distinct payroll-only codes, decimals, signed amounts, unknown and absent never fabricated as zero',()=>{
  assert.deepEqual(SUPPLEMENTAL_CONCEPTS.map(x=>x.code),['0001','0002','0003','0004','0053','7001','7016','7017']);
  assert.equal(decimal('1.234,56',true),1234.56);
  assert.equal(decimal('-12,34',true),-12.34);
  assert.equal(decimal(''),null);assert.equal(decimal('NaN'),null);assert.equal(decimal('-1'),null);
  const rows=validateSupplemental({
    '0003':{status:'present',quantity:'30',unitPrice:'1,4717',amount:'44,15'},
    '0053':{status:'present',amount:'30,30'},
    '7001':{status:'present',quantity:'5',amount:'119,90'},
    '7016':{status:'absent'},
  });
  assert.deepEqual(rows['0003'],{code:'0003',status:'present',quantity:30,amount:44.15,unit:null,unitPrice:1.4717});
  assert.equal(rows['0053'].quantity,null);assert.equal(rows['0053'].unitPrice,null);assert.equal(rows['0053'].amount,30.3);
  assert.equal(rows['7001'].quantity,5);assert.equal(rows['7001'].amount,119.9);assert.equal(rows['7001'].unit,null);
  assert.equal('unitPrice' in rows['7001'],false,'existing group-superior storage shape stays unchanged');
  assert.equal(rows['7016'].status,'absent');assert.equal(rows['7016'].amount,null);
  assert.equal(rows['7017'].status,'unknown');assert.equal(rows['7017'].quantity,null);
  assert.equal(rows['0001'].status,'unknown');assert.equal(rows['0001'].unitPrice,null);
  assert.throws(()=>validateSupplemental({'7001':{status:'present',quantity:'5',amount:''}}),/Completa/);
  assert.throws(()=>validateSupplemental({'0001':{status:'present',quantity:'',unitPrice:'',amount:''}}),/al menos un dato/);
  assert.throws(()=>validateSupplemental({'0001':{status:'present',quantity:'30 días'}}),/Revisa/);
});

test('actual supplemental UI reads, allows correction, protects manual edits, restores saved read-only data',()=>{
  const root=dom();globalThis.document=root;
  const container=root.createElement('div');renderSupplemental(container);
  const rows=[{code:'0001',quantity:30,unitPrice:56.531,amount:1695.93},
    {code:'0053',quantity:30,unitPrice:1.01,amount:30.3},
    {code:'7001',quantity:5,amount:119.9},{code:'7016',quantity:4,amount:14.4},{code:'7017',quantity:24,amount:88.7}];
  applySupplemental(rows,root);
  assert.equal(root.getElementById('supplemental-0001-unitPrice').value,'56,531');
  assert.equal(root.getElementById('supplemental-0053-amount').value,'30,3');
  assert.equal(root.getElementById('supplemental-7001-amount').value,'119,9');
  const qty=root.getElementById('supplemental-7001-quantity');qty.value='6';qty.listeners.input();
  applySupplemental(rows,root);assert.equal(qty.value,'6');
  const saved=readSupplemental(root);assert.equal(saved['7001'].quantity,6);
  assert.equal(saved['0001'].unitPrice,56.531);assert.equal(saved['0001'].amount,1695.93);
  renderSupplemental(container,saved,true);applySupplemental([],root);
  assert.equal(root.getElementById('supplemental-0001-unitPrice').readOnly,true);
  assert.equal(root.getElementById('supplemental-7001-quantity').value,'6');
  assert.equal(root.getElementById('supplemental-7001-quantity').readOnly,true);
  const fresh=dom();globalThis.document=fresh;renderSupplemental(fresh.createElement('div'));
  applySupplemental([{code:'7001',quantity:5,amount:null}],fresh);
  assert.throws(()=>readSupplemental(fresh),/Completa/);
  fresh.getElementById('supplemental-7001-status').value='unknown';
  assert.equal(readSupplemental(fresh)['7001'].status,'unknown');
  applySupplemental([{code:'7016',quantity:4,amount:14.4},{code:'7016',quantity:1,amount:3.6}],fresh);
  assert.equal(readSupplemental(fresh)['7016'].status,'unknown','ambiguous duplicate rows require manual confirmation');
  delete globalThis.document;
});

test('absent supplemental concepts stay writable in edit mode, typing marks present',()=>{
  const root=dom();globalThis.document=root;
  renderSupplemental(root.createElement('div'),{'7001':{status:'absent',quantity:null,amount:null}},false);
  const quantity=root.getElementById('supplemental-7001-quantity');
  const amount=root.getElementById('supplemental-7001-amount');
  assert.equal(quantity.disabled,false);assert.equal(quantity.readOnly,false);
  assert.equal(amount.disabled,false);assert.equal(amount.readOnly,false);
  quantity.value='5';quantity.listeners.input();amount.value='119,90';amount.listeners.input();
  assert.equal(root.getElementById('supplemental-7001-status').value,'present');
  assert.equal(readSupplemental(root)['7001'].amount,119.9);
  delete globalThis.document;
});

test('actual save/reopen persists supplements independently and leaves comparisons unchanged',async()=>{
  const bucket=bucketFor('owner-a');const app=documentHarness(bucket);
  app.readSupplemental=()=>validateSupplemental({
    '0001':{status:'present',quantity:'30',unitPrice:'56,5310',amount:'1695,93'},
    '0002':{status:'present',quantity:'30',unitPrice:'19,7860',amount:'593,58'},
    '0003':{status:'present',quantity:'30',unitPrice:'1,4717',amount:'44,15'},
    '0004':{status:'present',quantity:'30',unitPrice:'8,5387',amount:'256,16'},
    '0053':{status:'present',quantity:'30',unitPrice:'1,0100',amount:'30,30'},
    '7001':{status:'present',quantity:'5',amount:'119,90'},
  });
  await app.loadStoredDocuments();
  app.documents.timesheet.confirmed=true;app.documents.payroll.confirmed=true;
  await app.confirmMonthlyComparison();
  const review=JSON.parse(await bucket.objects.get(app.storagePath('review')).text());
  assert.equal(review.supplemental['7001'].amount,119.9);
  assert.equal(review.supplemental['0003'].unitPrice,1.4717);
  assert.equal(review.supplemental['0004'].amount,256.16);
  assert.deepEqual(review.comparisons,{});assert.equal(review.payroll['7001'],undefined);assert.equal(review.payroll['0003'],undefined);
  const loaded=await app.downloadMonthlyReview();
  assert.equal(loaded.supplemental['7001'].quantity,5);assert.equal(loaded.supplemental['0053'].amount,30.3);
  const count=bucket.uploads.length;
  app.confirmComparisonButton.dataset.action='check';app.readSupplemental=()=>{throw Error('Completa');};
  await app.confirmMonthlyComparison();assert.equal(bucket.uploads.length,count);
});

test('all three production readers exclude fixed payroll and group differences from register comparisons',()=>{
  const ctx=vm.createContext({normalizeOcrLine:s=>s.toUpperCase(),PAYROLL_MATCH_ORDER:['holiday'],PAYROLL_VARIABLES:[{key:'holiday',payrollPatterns:[/FESTIVO/]}]});
  vm.runInContext(extract('matchPayrollVariable'),ctx);
  assert.equal(ctx.matchPayrollVariable('0002 Plus convenio 30 19,7860 593,58'),null);
  assert.equal(ctx.matchPayrollVariable('0053 Antigüedad 30 1,0100 30,30'),null);
  assert.equal(ctx.matchPayrollVariable('7017 Difer.Grp.Sup.Pl.Festivo 24 88,70'),null);
  assert.equal(ctx.matchPayrollVariable('0017 Plus Festivo 50 835,00').variable.key,'holiday');
  const vision=readFileSync(new URL('../payroll-vision-lab.js',import.meta.url),'utf8');
  vm.runInContext(vision.slice(vision.indexOf('  function norm('),vision.indexOf('  function markAsRead(')),ctx);
  assert.equal(ctx.conceptKey('0003 Complemento Personal 30 1,4717 44,15'),'');
  assert.equal(ctx.conceptKey('Difer.Grupo.Sup.Pl.Rotat.'),'');assert.equal(ctx.conceptKey('Plus rotatividad'),'rotation');
  const patch=readFileSync(new URL('../payroll-lab-patch.js',import.meta.url),'utf8');
  vm.runInContext(patch.slice(patch.indexOf('  function normalizeLine('),patch.indexOf('  function markAsAutoRead(')),ctx);
  const config={labels:[/FESTIVO/],max:200,integer:false,exclude:[]};
  assert.equal(ctx.findQuantity('0004 Complemento Puesto Trabajo 30 8,5387 256,16\n7017 Difer.Grp.Sup.Pl.Festivo 24 88,70\n0017 Plus Festivo 50 835,00',config),'50');
});

test('edge validation whitelists codes and rejects ambiguity; API retains auth and opt-in compatibility',()=>{
  const code=readFileSync(new URL('../supabase/functions/lab-read-payroll-variables/index.ts',import.meta.url),'utf8');
  const fn=code.slice(code.indexOf('function normalizeSupplemental('),code.indexOf('function parseModelJson('))
    .replace(/: any|: unknown/g,'');
  const ctx=vm.createContext({});vm.runInContext(fn,ctx);
  const rows=ctx.normalizeSupplemental([
    {code:'0001',quantity:30,unitPrice:'56,5310',amount:'1695,93'},
    {code:3,quantity:30,unitPrice:'1,4717',amount:'44,15'},
    {code:'0053',quantity:30,unitPrice:'1,0100',amount:'30,30'},
    {code:'7001',quantity:5,amount:'119,90'},
    {code:'9999',quantity:1,amount:1},
  ]);
  assert.deepEqual(Array.from(rows, row=>row.code),['0001','0003','0053','7001']);
  assert.equal(rows[0].unitPrice,56.531);assert.equal(rows[1].amount,44.15);assert.equal(rows[2].amount,30.3);
  assert.equal(rows[3].amount,119.9);assert.equal('unitPrice' in rows[3],false);
  assert.equal(ctx.normalizeSupplemental([{code:'7001'},{code:'7001'}]).length,0);
  assert.equal(ctx.normalizeSupplemental([{code:'0002'},{code:'0002'}]).length,0);
  assert.match(code,/admin.auth.getUser\(token\)/);assert.match(code,/private_access_allowlist/);
  assert.match(code,/includeSupplemental === true/);assert.match(code,/return json\(\{ isPayroll: true, concepts \}\)/);
  assert.match(code,/0001 Salario mín\. garantizado/);assert.match(code,/unitPrice de IMPORTE DIARIO/);
});

test('manual editing does not start local OCR or remote vision',async()=>{
  const screen={hidden:false,dataset:{manualEdit:'true'}};
  const ctx=vm.createContext({document:{getElementById:id=>id==='comparison-screen'?screen:{src:'synthetic'}},
    running:false,completedForSrc:'',updateSafeWording(){throw Error('unexpected OCR entry');},
    fetch(){throw Error('unexpected network call');}});
  const vision=readFileSync(new URL('../payroll-vision-lab.js',import.meta.url),'utf8');
  vm.runInContext(vision.slice(vision.indexOf('  async function runPayrollVisionRead('),vision.indexOf('  const observer =')),ctx);
  await ctx.runPayrollVisionRead();
  const patch=readFileSync(new URL('../payroll-lab-patch.js',import.meta.url),'utf8');
  vm.runInContext(patch.slice(patch.indexOf('  async function improvePayrollReading('),patch.indexOf('  function guardSavingUnknownValues(')),ctx);
  await ctx.improvePayrollReading();
});
