import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {SUPPLEMENTAL_CONCEPTS, decimal, validateSupplemental, renderSupplemental, readSupplemental, applySupplemental} from '../payroll-supplemental.mjs';
import {renderOvertime, readOvertime, applyOvertime} from '../payroll-overtime.mjs';
import {bucketFor, documentHarness, extract} from './payroll-receipts.test.mjs';

function dom() {
  const nodes = new Map();
  function node(tag) {
    return {tag,children:[],style:{},dataset:{},value:'',disabled:false,readOnly:false,listeners:{},
      set id(value){this._id=value;nodes.set(value,this);}, get id(){return this._id;},
      append(...children){for(const child of children){child.parent=this;this.children.push(child);}},
      appendChild(child){this.append(child);return child;},
      setAttribute(name,value){this[name]=value;},
      addEventListener(type,fn){this.listeners[type]=fn;},
      closest(){return this.dataset.supplementalCode ? this : this.parent?.closest();},
      querySelectorAll(tag){return this.children.flatMap(child=>[...(child.tag===tag?[child]:[]),...child.querySelectorAll(tag)]);}
    };
  }
  return {createElement:node,getElementById:id=>nodes.get(id)};
}

test('distinct payroll-only codes, decimals, signed amounts, unknown and absent never fabricated as zero',()=>{
  assert.deepEqual(SUPPLEMENTAL_CONCEPTS.map(x=>x.code),['0001','0002','0003','0004','0053','0038','7001','7016','7017']);
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

test('absent supplemental concepts show no aplica until changed to present',()=>{
  const root=dom();globalThis.document=root;
  renderSupplemental(root.createElement('div'),{'7001':{status:'absent',quantity:null,amount:null}},false);
  const quantity=root.getElementById('supplemental-7001-quantity');
  const amount=root.getElementById('supplemental-7001-amount');
  assert.equal(root.getElementById('supplemental-7001-status').closest().hidden,true);
  assert.equal(quantity.disabled,true);assert.equal(quantity.placeholder,'No aplica');
  assert.equal(amount.disabled,true);assert.equal(amount.placeholder,'No aplica');
  const status=root.getElementById('supplemental-7001-status');
  status.value='present';status.listeners.change();
  assert.equal(quantity.disabled,false);assert.equal(amount.disabled,false);
  quantity.value='5';quantity.listeners.input();amount.value='119,90';amount.listeners.input();
  assert.equal(status.value,'present');
  assert.equal(readSupplemental(root)['7001'].amount,119.9);
  delete globalThis.document;
});


test('administrative reread populates fixed concepts despite a visual lock and keeps the normal lock',()=>{
  const rows=[
    {code:'0001',quantity:30,unitPrice:50.191,amount:1505.73},
    {code:'0002',quantity:30,unitPrice:17.567,amount:527.01},
    {code:'0003',quantity:30,unitPrice:1.3073,amount:39.22},
    {code:'0004',quantity:30,unitPrice:7.581,amount:227.43},
    {code:'0053',quantity:30,unitPrice:.8707,amount:26.12},
  ];
  const root=dom();globalThis.document=root;
  renderSupplemental(root.createElement('div'),{},true);
  applySupplemental(rows,root);
  assert.equal(root.getElementById('supplemental-0001-quantity').value,'');
  applySupplemental(rows,root,{allowLocked:true});
  for(const {code} of rows){
    assert.equal(root.getElementById(`supplemental-${code}-status`).value,'present');
    assert.equal(root.getElementById(`supplemental-${code}-quantity`).value,'30');
  }
  delete globalThis.document;
});

test('old administrative reviews only reread on the explicit action and reuse the saved image',()=>{
  const base=readFileSync(new URL('../revisa-tu-nomina-base.html',import.meta.url),'utf8');
  const vision=readFileSync(new URL('../payroll-vision-lab.js',import.meta.url),'utf8');
  assert.match(base,/retryPayrollAnalysisButton\.addEventListener\('click', \(\) => startPayrollComparison\(true\)\)/);
  assert.match(base,/documents\.payroll\.blob \|\| documents\.payroll\.file/);
  assert.match(vision,/confirmButton\?\.dataset\.action === 'check'/);
  assert.match(vision,/clearAndApply\(concepts, allowLockedAfterRead\)/);
  assert.match(vision,/applySupplemental\(data\?\.supplemental \|\| \[\], document, completedReading\)/);
});


test('0038 reads an amount-only deduction and a completed read separates absent from ambiguous',()=>{
  const root=dom();globalThis.document=root;renderSupplemental(root.createElement('div'));
  applySupplemental([
    {code:'0038',quantity:null,amount:'12,00'},
    {code:'7017',ambiguous:true,quantity:null,amount:null}
  ],root,{readingComplete:true});
  assert.equal(root.getElementById('supplemental-0038-status').value,'present');
  assert.equal(root.getElementById('supplemental-0038-quantity'),undefined);
  assert.equal(root.getElementById('supplemental-0038-amount').value,'12');
  assert.equal(root.getElementById('supplemental-7016-status').value,'absent');
  assert.equal(root.getElementById('supplemental-7016-quantity').disabled,true);
  assert.equal(root.getElementById('supplemental-7016-quantity').placeholder,'No aplica');
  assert.equal(root.getElementById('supplemental-7016-status').closest().hidden,true);
  assert.equal(root.getElementById('supplemental-7017-status').value,'unknown');
  assert.equal(root.getElementById('supplemental-7017-status').closest().hidden,false);
  const saved=readSupplemental(root);
  assert.equal(saved['0038'].status,'present');
  assert.equal(saved['0038'].amount,12);
  assert.equal(saved['0038'].quantity,null);
  assert.equal(saved['7016'].status,'absent');
  assert.equal(saved['7017'].status,'unknown');
  delete globalThis.document;
});

test('catalog supplemental concepts render only when returned and persist through the existing review shape',()=>{
  const root=dom();globalThis.document=root;const container=root.createElement('div');renderSupplemental(container);
  const metadata=(code,label,quantityExpected=false,unitPriceExpected=false)=>({
    code,label,output:'supplemental',dynamic:true,quantityExpected,unitPriceExpected,amountLabel:'Importe (€)'
  });
  applySupplemental([
    {...metadata('0262','Ayuda escolar hasta 23',true),quantity:3,amount:300},
    {...metadata('9A00','Prestaciones IT 0 %'),amount:-120.25},
    {...metadata('1001','Paga Extra de Julio'),amount:2000},
    {...metadata('7013','Difer. Grup. Sup. Pl. Noct.',true),quantity:5.5,amount:44},
    {...metadata('/552','Líq. Dif. Meses Anteriores'),amount:-41.8},
    {code:'9350',label:'Contingencias Comunes',output:'discounts',dynamic:true,amount:50},
  ],root,{readingComplete:true});
  assert.equal(root.getElementById('supplemental-0262-status').value,'present');
  assert.equal(root.getElementById('supplemental-0262-quantity').value,'3');
  assert.equal(root.getElementById('supplemental-9A00-amount').value,'-120,25');
  assert.equal(root.getElementById('supplemental-1001-amount').value,'2000');
  assert.equal(root.getElementById('supplemental-7013-quantity').value,'5,5');
  assert.equal(root.getElementById('supplemental-/552-amount').value,'-41,8');
  assert.equal(root.getElementById('supplemental-0265-status'),undefined,'an absent dynamic concept is not rendered');
  assert.equal(root.getElementById('supplemental-9350-status'),undefined,'SS/IRPF stays outside the main review');
  const saved=readSupplemental(root);
  assert.equal(saved['0262'].quantity,3);assert.equal(saved['9A00'].amount,-120.25);
  assert.equal(saved['1001'].amount,2000);assert.equal(saved['7013'].quantity,5.5);assert.equal(saved['/552'].amount,-41.8);
  const reopened=dom();globalThis.document=reopened;renderSupplemental(reopened.createElement('div'),saved,true);
  assert.equal(reopened.getElementById('supplemental-0262-quantity').value,'3');
  assert.equal(reopened.getElementById('supplemental-9A00-amount').readOnly,true);
  delete globalThis.document;
});

test('septiembre 2022 keeps present concepts, hides absent cards and preserves comparison quantities',()=>{
  const root=dom();globalThis.document=root;const container=root.createElement('div');
  renderSupplemental(container);renderOvertime(container);
  const metadata={code:'4002',label:'Aportación Empl. obl. PP',output:'supplemental',dynamic:true,
    quantityExpected:false,unitPriceExpected:false,amountLabel:'Importe (€)',amount:13.09};
  applySupplemental([
    {code:'0001',quantity:30,unitPrice:50,amount:1500},{code:'0002',quantity:30,unitPrice:10,amount:300},
    {code:'0003',quantity:30,unitPrice:2,amount:60},{code:'0004',quantity:30,unitPrice:8,amount:240},
    {code:'0053',quantity:30,unitPrice:1,amount:30},{code:'0038',amount:12},metadata,
  ],root,{readingComplete:true});
  applyOvertime(null,root,{readingComplete:true});
  for(const code of ['0001','0002','0003','0004','0053','0038','4002']) {
    assert.equal(root.getElementById(`supplemental-${code}-status`).value,'present');
    assert.equal(root.getElementById(`supplemental-${code}-status`).closest().hidden,false);
  }
  assert.equal(root.getElementById('supplemental-0038-amount').value,'12');
  assert.equal(root.getElementById('supplemental-4002-amount').value,'13,09');
  for(const code of ['7001','7016','7017']) assert.equal(root.getElementById(`supplemental-${code}-status`).closest().hidden,true);
  assert.equal(root.getElementById('payroll-overtime').hidden,true);
  assert.equal(readOvertime(root).status,'absent');
  assert.equal(readSupplemental(root)['4002'].amount,13.09);

  const ids={rotation:'comparison-rotation',meals:'comparison-meals',night:'comparison-night',shift:'comparison-shift',
    holiday:'comparison-holiday',shift12:'comparison-shift12',holidayDiets:'comparison-holidayDiets',vacation:'comparison-vacation'};
  const inputs=Object.fromEntries(Object.values(ids).map(id=>[id,{value:'',placeholder:'',dataset:{},readOnly:false,
    dispatchEvent(){},parentElement:null}]));
  const ctx=vm.createContext({FIELD_MAP:ids,document:{getElementById:id=>inputs[id]},Event:class{},setTimeout(fn){fn();}});
  const vision=readFileSync(new URL('../payroll-vision-lab.js',import.meta.url),'utf8');
  vm.runInContext(vision.slice(vision.indexOf('  function norm('),vision.indexOf('  async function getSession(')),ctx);
  ctx.clearAndApply([
    {name:'0016 Plus rotatividad',value:'23'}, {name:'0010 Plus de turno',value:'11'},
    {name:'0013 Plus Nocturno',value:'56'}, {name:'0017 Plus Festivo',value:'42'},
    {name:'0080 Plus de turno 12 horas',value:'3'}, {name:'0034 Dietas Festivos',value:'3'},
    {name:'0046 Comidas Can Guasch',value:'2'},
  ]);
  assert.deepEqual([inputs[ids.rotation].value,inputs[ids.shift].value,inputs[ids.night].value,inputs[ids.holiday].value,
    inputs[ids.shift12].value,inputs[ids.holidayDiets].value,inputs[ids.meals].value],['23','11','56','42','3','3','2']);
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
  const fn=code.slice(code.indexOf('const PAYROLL_CONCEPT_CATALOG'),code.indexOf('function parseModelJson('))
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
  assert.equal(rows[0].output,'supplemental');assert.equal(rows[0].dynamic,true);
  assert.equal(rows[0].label,'Salario mín. garantizado');assert.equal(rows[0].unitPriceExpected,true);
  assert.equal(rows[0].unitPrice,56.531);assert.equal(rows[1].amount,44.15);assert.equal(rows[2].amount,30.3);
  assert.equal(rows[3].amount,119.9);assert.equal('unitPrice' in rows[3],false);
  assert.equal(ctx.normalizeSupplemental([{code:'7001'},{code:'7001'}])[0].ambiguous,true);
  assert.equal(ctx.normalizeSupplemental([{code:'0002'},{code:'0002'}])[0].ambiguous,true);
  assert.match(code,/admin.auth.getUser\(token\)/);assert.match(code,/private_access_allowlist/);
  assert.match(code,/includeSupplemental === true/);assert.match(code,/return json\(\{ isPayroll: true, concepts \}\)/);
  assert.match(code,/code:'0001', label:'Salario mín\. garantizado'/);assert.match(code,/unitPrice de IMPORTE DIARIO/);
});


test('el catálogo general reconoce códigos existentes y un caso nuevo de cada bloque sin alterar comparaciones',()=>{
  const code=readFileSync(new URL('../supabase/functions/lab-read-payroll-variables/index.ts',import.meta.url),'utf8');
  const fn=code.slice(code.indexOf('const PAYROLL_CONCEPT_CATALOG'),code.indexOf('function parseModelJson('))
    .replace(/: any|: unknown/g,'');
  const ctx=vm.createContext({});vm.runInContext(fn,ctx);

  for(const existing of ['0001','0002','0003','0004','0010','0013','0016','0017','0053','0080','0034','0038','0046','0207','0208','4002']){
    assert.equal(ctx.payrollConceptByCode(existing)?.code,existing);
  }
  assert.equal(ctx.payrollConceptByCode('9A00')?.label,'Prestaciones IT 0 %');
  assert.equal(ctx.payrollConceptByCode('9400'),null,'9A00 is never rewritten as 9400');
  assert.equal(ctx.payrollConceptByCode('2111')?.code,'0211','the documented OCR alias keeps the real code');

  const rows=ctx.normalizeSupplemental([
    {code:'0014',quantity:7,amount:'700,00'},
    {code:'9A00',amount:'-120,25'},
    {code:'1001',amount:'2.000,00'},
    {code:'7013',quantity:'5,5',amount:'44,00'},
    {code:'/552',amount:'-41,80'},
    {code:'0038',amount:'12,00'},
    {code:'2111',quantity:2,unitPrice:'1,7800',amount:'-3,56'}
  ]);
  const byCode=Object.fromEntries(Array.from(rows,row=>[row.code,row]));
  assert.equal(byCode['0014'].quantity,7,'help quantities have no concept-specific cap');
  assert.equal(byCode['9A00'].amount,-120.25);
  assert.equal(byCode['1001'].amount,2000);
  assert.equal(byCode['7013'].quantity,5.5);
  assert.equal(byCode['/552'].amount,-41.8);
  assert.equal(byCode['0038'].quantity,null,'amount-only deductions do not require quantity');
  assert.equal(byCode['0211'].unitPrice,1.78);
  assert.equal(byCode['0211'].amount,-3.56);
  assert.equal(byCode['0014'].output,'supplemental');assert.equal(byCode['0014'].dynamic,true);
  assert.equal(byCode['0014'].label,'Ayuda escolar hasta 18');assert.equal(byCode['0014'].quantityExpected,true);
  assert.equal(rows.some(row=>row.code==='0010'),false,'main comparison remains separate');
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
