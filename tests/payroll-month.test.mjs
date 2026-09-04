import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import { collectMonth, closeMonth, readMonthClosure } from '../payroll-month.mjs';
import { newReceiptId, monthReceipts } from '../payroll-receipts.mjs';
import { bucketFor, documentHarness, extract, source, element } from './payroll-receipts.test.mjs';

const keys = ['meals','rotation','night','shift','holiday','shift12','holidayDiets','vacation'];
const zeros = overrides => ({...Object.fromEntries(keys.map(key => [key, '0'])), ...overrides});
const folder = 'owner-a/2026/10';
const compareContext = vm.createContext({COMPARABLE_KEYS:keys, parseQuantityValue:value => Number(String(value).replace(',', '.'))});
vm.runInContext(extract('buildMonthlyComparisons'), compareContext);
const compare = compareContext.buildMonthlyComparisons;

async function seed(bucket, monthFolder, payroll, timesheet = zeros({vacation:'17'}), legacy = false) {
  const id = legacy ? '' : newReceiptId();
  const path = `${monthFolder}${id ? `/${id}` : ''}`;
  const [,year,month] = monthFolder.split('/');
  const review = {version:2, scope:'receipt', status:'complete', userId:monthFolder.split('/')[0],
    period:`${year}-${month}${id ? `/${id}` : ''}`, timesheet, payroll:zeros(payroll), comparisons:{}};
  await bucket.upload(`${path}/timesheet`, new Blob(['same synthetic monthly register']), {upsert:false});
  await bucket.upload(`${path}/payroll`, new Blob([`synthetic payroll ${id || 'legacy'}`]), {upsert:false});
  await bucket.upload(`${path}/review`, new Blob([JSON.stringify(review)]), {upsert:false});
  return {path, id, review};
}

test('October and November: 10 + 7 = 17, one register counted once, receipts remain independent', async () => {
  for (const month of ['10','11']) {
    const path = `owner-a/2026/${month}`;
    const bucket = bucketFor('owner-a');
    await seed(bucket,path,{vacation:'10'},undefined,true);
    await seed(bucket,path,{vacation:'7'});
    const originals = new Map(bucket.objects);
    const result = await closeMonth(bucket,path,keys,compare);
    assert.equal(result.receiptCount,2);
    assert.equal(result.timesheet.vacation,17);
    assert.equal(result.payroll.vacation,17);
    assert.equal(result.comparisons.vacation.status,'match');
    assert.equal(result.scope,'month');
    assert.equal(bucket.objects.size, originals.size + 1);
    for (const [key,blob] of originals) assert.equal(bucket.objects.get(key),blob,'never replace a receipt');
    assert.equal((await monthReceipts(bucket,path)).length,2,'summary is not a payroll');
    assert.equal((await readMonthClosure(bucket,path,keys,compare)).fingerprint,result.fingerprint);
  }
});

test('one receipt, three receipts, decimals, zero and actual mismatches', async () => {
  const bucket = bucketFor('owner-a');
  await seed(bucket,folder,{vacation:'10',night:'0,1'},zeros({vacation:'17',night:'0,6'}));
  let result = await closeMonth(bucket,folder,keys,compare);
  assert.equal(result.comparisons.vacation.status,'mismatch');
  assert.equal(result.comparisons.vacation.difference,-7);
  await seed(bucket,folder,{vacation:'3',night:'0,2'},zeros({vacation:'17',night:'0,6'}));
  await seed(bucket,folder,{vacation:'4',night:'0,3'},zeros({vacation:'17',night:'0,6'}));
  assert.equal(await readMonthClosure(bucket,folder,keys,compare),null,'old closure invalidated');
  result = await closeMonth(bucket,folder,keys,compare);
  assert.equal(result.receiptCount,3);
  assert.equal(result.comparisons.night.status,'match');
  assert.equal(result.payroll.night,0.6);
  assert.equal(result.comparisons.meals.status,'match');
});

test('incomplete receipts, missing quantities, invalid JSON and conflicting registers prevent closure', async () => {
  for (const issue of ['draft','quantity','register','json']) {
    const bucket = bucketFor('owner-a');
    await seed(bucket,folder,{vacation:'10'});
    const second = await seed(bucket,folder,{vacation:'7'});
    if (issue === 'draft') bucket.objects.delete(`${second.path}/payroll`);
    if (issue === 'quantity') { delete second.review.payroll.meals; bucket.objects.set(`${second.path}/review`,new Blob([JSON.stringify(second.review)])); }
    if (issue === 'register') { second.review.timesheet.vacation='18'; bucket.objects.set(`${second.path}/review`,new Blob([JSON.stringify(second.review)])); }
    if (issue === 'json') bucket.objects.set(`${second.path}/review`,new Blob(['invalid']));
    await assert.rejects(closeMonth(bucket,folder,keys,compare));
    assert.equal(bucket.objects.has(`${folder}/month-summary/review`),false);
  }
});

test('old sparse reviews support explicitly absent concepts, not missing values for existing concepts', async () => {
  const bucket=bucketFor('owner-a');
  const receipt=await seed(bucket,folder,{vacation:'17'},undefined,true);
  receipt.review.version=1;
  receipt.review.timesheet={vacation:'17'};
  receipt.review.payroll={vacation:'17'};
  bucket.objects.set(`${receipt.path}/review`,new Blob([JSON.stringify(receipt.review)]));
  assert.equal((await closeMonth(bucket,folder,keys,compare)).payroll.meals,0);
  delete receipt.review.payroll.vacation;
  bucket.objects.set(`${receipt.path}/review`,new Blob([JSON.stringify(receipt.review)]));
  await assert.rejects(closeMonth(bucket,folder,keys,compare),/sin confirmar/);
});

test('receipt edits, new drafts and image changes invalidate saved closures; other months do not', async () => {
  const bucket=bucketFor('owner-a');
  const receipt=await seed(bucket,folder,{vacation:'17'});
  await closeMonth(bucket,folder,keys,compare);
  await seed(bucket,'owner-a/2026/11',{vacation:'17'});
  assert.ok(await readMonthClosure(bucket,folder,keys,compare));
  receipt.review.payroll.vacation='16';
  bucket.objects.set(`${receipt.path}/review`,new Blob([JSON.stringify(receipt.review)]));
  assert.equal(await readMonthClosure(bucket,folder,keys,compare),null);
  await closeMonth(bucket,folder,keys,compare);
  bucket.objects.set(`${receipt.path}/payroll`,new Blob(['edited synthetic image']));
  assert.equal(await readMonthClosure(bucket,folder,keys,compare),null);
  await closeMonth(bucket,folder,keys,compare);
  bucket.objects.set(`${folder}/${newReceiptId()}/timesheet`,new Blob(['draft']));
  await assert.rejects(readMonthClosure(bucket,folder,keys,compare),/falta guardar/);
});

test('duplicate receipts, download/upload failures and concurrent edits fail closed', async () => {
  const bucket=bucketFor('owner-a');
  const one=await seed(bucket,folder,{vacation:'10'});
  const two=await seed(bucket,folder,{vacation:'7'});
  const originalImage=bucket.objects.get(`${two.path}/payroll`);
  bucket.objects.set(`${two.path}/payroll`,bucket.objects.get(`${one.path}/payroll`));
  await assert.rejects(closeMonth(bucket,folder,keys,compare),/duplicada/);
  bucket.objects.set(`${two.path}/payroll`,originalImage);
  bucket.failDownloads=true;
  await assert.rejects(closeMonth(bucket,folder,keys,compare),/leer todos/);
  bucket.failDownloads=false; bucket.failUploads=true;
  await assert.rejects(closeMonth(bucket,folder,keys,compare),/guardar el cierre/);
  bucket.failUploads=false;
  const upload=bucket.upload.bind(bucket);
  bucket.upload=async (...args) => { const result=await upload(...args); if(args[0].endsWith('month-summary/review')) bucket.objects.set(`${two.path}/payroll`,new Blob(['concurrent edit'])); return result; };
  await assert.rejects(closeMonth(bucket,folder,keys,compare),/han cambiado/);
  assert.equal(await readMonthClosure(bucket,folder,keys,compare),null);
});

test('another user cannot close or read a month belonging to the owner', async () => {
  const bucket=bucketFor('owner-a');
  await seed(bucket,folder,{vacation:'17'});
  await closeMonth(bucket,folder,keys,compare);
  const other=bucketFor('owner-b',bucket.objects);
  await assert.rejects(closeMonth(other,folder,keys,compare));
  assert.equal(await readMonthClosure(other,folder,keys,compare),null);
  assert.ok((await other.download(`${folder}/month-summary/review`)).error);
});

function ui(bucket) {
  const app=documentHarness(bucket);
  // Lightweight DOM for exercising the actual production rendering functions.
  const node=() => Object.assign(element(),{children:[], appendChild(child){this.children.push(child); return child;}});
  app.document.createElement=node;
  Object.assign(app,{COMPARABLE_KEYS:keys,PAYROLL_VARIABLES:keys.map(key=>({key,label:key,max:200})),
    comparisonFields:node(),comparisonForm:node(),comparisonResultTitle:node(),comparisonResultMessage:node(),comparisonResultList:node(),
    comparisonRunning:false,retryPayrollAnalysisButton:node(),closeMonth,readMonthClosure,crypto:webcrypto});
  const get=app.document.getElementById.bind(app.document);
  app.document.getElementById=id=>{const item=get(id); if(!item.appendChild)Object.assign(item,{children:[],appendChild(child){this.children.push(child);return child;}});return item;};
  for(const name of ['buildMonthlyComparisons','monthlyIncidentCount','hideMonthlyResults','updateMonthlyControls','renderComparisonResult','renderPayrollComparison','renderMonthClosure','handleMonthClosure']) vm.runInContext(extract(name),app);
  return app;
}

test('actual UI: partial receipt is provisional; explicit close sums two payrolls and reopens safely', async () => {
  const bucket=bucketFor('owner-a');
  const app=ui(bucket); app.month.value='9';
  await app.loadStoredDocuments();
  app.documents.timesheet.confirmed=true;app.documents.timesheet.saved=true;
  app.documents.timesheet.blob=new Blob(['monthly register']);
  await bucket.upload(app.storagePath('timesheet'),app.documents.timesheet.blob,{upsert:false});
  const register=new Map(Object.entries(zeros({vacation:'17'})));
  app.confirmedTimesheetAnalyses.set(app.periodKey(),register);
  const savePayroll=async amount=>{
    await bucket.upload(app.storagePath('payroll'),new Blob([`payroll amount ${amount}`]),{upsert:false});
    app.documents.payroll.confirmed=true;
    app.comparisonScreen.hidden=false;
    app.renderPayrollComparison(new Map(Object.entries(zeros({vacation:String(amount)}))));
    await app.confirmMonthlyComparison();
    assert.equal(app.monthlyReviews.get(app.periodKey()).scope,'receipt');
    assert.equal(Object.keys(app.monthlyReviews.get(app.periodKey()).comparisons).length,0);
    assert.match(app.comparisonResultMessage.textContent,/no es el resultado del mes/);
    assert.equal(app.document.getElementById('month-controls-comparison').hidden,false);
    assert.equal([...app.comparisonInputs.values()].every(input=>input.readOnly),true);
  };
  await savePayroll(10);
  assert.equal(bucket.objects.has(`${folder}/month-summary/review`),false);
  await app.startAnotherPayroll();
  assert.equal(app.document.getElementById('month-result-comparison').hidden,true);
  await savePayroll(7);
  await app.handleMonthClosure(true);
  let panel=app.document.getElementById('month-result-comparison');
  assert.equal(panel.hidden,false);
  assert.match(panel.children[0].textContent,/coinciden/);
  assert.match(panel.children[1].textContent,/2 nóminas/);
  assert.equal((await readMonthClosure(bucket,folder,keys,compare)).payroll.vacation,17);
  assert.equal(app.savingReview,false);
  const reopened=ui(bucket); reopened.month.value='9';
  await reopened.loadStoredDocuments();
  reopened.comparisonScreen.hidden=true;
  await reopened.handleMonthClosure(false);
  assert.equal(reopened.document.getElementById('month-result-period').hidden,false);
  assert.match(reopened.document.getElementById('month-result-period').children[0].textContent,/coinciden/);
});

test('old per-receipt mismatches never render as a monthly incident or monthly OK', () => {
  const app=ui(bucketFor('owner-a'));
  const legacy={status:'complete',comparisons:{vacation:{status:'mismatch',register:17,payroll:10}}};
  assert.equal(app.monthlyIncidentCount(legacy),0);
  app.renderComparisonResult(legacy);
  assert.match(app.comparisonResultMessage.textContent,/no es el resultado del mes/);
});

test('UI rejects unconfirmed quantities and prevents duplicate close actions; errors unlock controls', async () => {
  const bucket=bucketFor('owner-a');
  await seed(bucket,folder,{vacation:'17'});
  const app=ui(bucket); app.month.value='9';
  await app.loadStoredDocuments();
  app.comparisonScreen.hidden=false;
  app.renderPayrollComparison(new Map([['vacation','17']]));
  const before=new Map(bucket.objects);
  await app.confirmMonthlyComparison();
  assert.equal(app.comparisonError.hidden,false);
  assert.deepEqual(bucket.objects,before,'unknown is not treated as zero');
  app.renderPayrollComparison(new Map(Object.entries(zeros({vacation:'17'}))),true,app.monthlyReviews.get(app.periodKey()));
  let release;
  const pending=new Promise(resolve=>{release=resolve;});
  let calls=0;
  app.closeMonth=async (...args)=>{calls++;await pending;return closeMonth(...args);};
  const closing=app.handleMonthClosure(true);
  assert.equal(app.month.disabled,true);
  await app.handleMonthClosure(true);
  assert.equal(calls,1);
  release(); await closing;
  assert.equal(app.savingReview,false);
  assert.equal(app.document.getElementById('close-month-comparison').disabled,false);
  app.closeMonth=closeMonth;bucket.failUploads=true;
  await app.handleMonthClosure(true);
  const target=app.document.getElementById('month-result-comparison');
  assert.match(target.textContent,/No se ha podido guardar/);
  assert.equal(app.savingReview,false);
  assert.equal(app.document.getElementById('close-month-comparison').disabled,false);
});
