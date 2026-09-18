import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('../revisa-tu-nomina-base.html', import.meta.url), 'utf8');
const source = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1].replace(/\r/g, '');
function extract(name) {
  const start = source.indexOf(`    function ${name}(`);
  assert.ok(start >= 0, name);
  return source.slice(start, source.indexOf('\n    }', start) + 6);
}
function element() {
  return {
    children: [], dataset: {}, value: '', hidden: false,
    set textContent(value) { this.text = value; this.children = []; },
    get textContent() { return this.text || ''; },
    appendChild(child) { this.children.push(child); },
    setAttribute() {}, addEventListener() {}, focus() {}, scrollIntoView() {},
  };
}
function setup() {
  const context = vm.createContext({
    Map, Set, Number, String, Math,
    document: { createElement: element },
    analysisFields: element(), analysisDetectedCount: element(),
    analysisError: element(), analysisConfirmed: element(),
    analysisForm: element(), confirmAnalysisButton: element(),
    analysisInputs: new Map(), analysisInternalValues: new Map(),
    confirmedTimesheetAnalyses: new Map(), isAdminMode: false,
    periodKey: () => '2026-09', currentScheduleSettings: () => ({ type: 'full' }),
    computeScheduleFactor: () => 1, saveWorkSchedule() {},
    setAnalysisProgress() {}, updatePeriodCards() {},
  });
  vm.runInContext(source.slice(source.indexOf('    const DOCUMENT_KIND_MARKERS'), source.indexOf('    const documents', source.indexOf('    const DOCUMENT_KIND_MARKERS'))), context);
  vm.runInContext(extract('renderTimesheetAnalysis') + '\n' + extract('confirmTimesheetAnalysis'), context);
  return context;
}
for (const confirmed of [false, true]) {
  test(`current catalogue excludes NOPAGA from ${confirmed ? 'saved history' : 'new OCR'} cards and counts`, () => {
    const ctx = setup();
    const values = { night: '55,08', unpaidNight: '2,17', unpaidHoliday: '3,42', obsoleteKey: '99' };
    const input = new Map(Object.entries(values).map(([key, value]) => [key, confirmed ? value : { value, quality: 2 }]));
    const original = JSON.stringify([...input]);
    ctx.renderTimesheetAnalysis(input, confirmed);
    assert.equal(ctx.analysisFields.children.length, 8);
    assert.equal(ctx.analysisInputs.has('unpaidNight'), false);
    assert.equal(ctx.analysisInputs.has('unpaidHoliday'), false);
    assert.equal(ctx.analysisInputs.has('obsoleteKey'), false);
    assert.equal(ctx.analysisInputs.get('night').value, '55,08');
    assert.match(ctx.analysisDetectedCount.textContent, /^1 cantidades/);
    assert.equal(JSON.stringify([...input]), original);
    ctx.analysisInputs.get('night').value = '56';
    ctx.confirmTimesheetAnalysis();
    assert.deepEqual(Object.fromEntries(ctx.confirmedTimesheetAnalyses.get('2026-09')), {
      night: '56', unpaidNight: '2,17', unpaidHoliday: '3,42',
    });
    assert.equal(ctx.analysisFields.children.length, 8);
  });
}
test('missing NOPAGA does not create empty cards; another receipt does not inherit internal values', () => {
  const ctx = setup();
  ctx.renderTimesheetAnalysis(new Map([['unpaidNight', '2,17']]));
  assert.match(ctx.analysisDetectedCount.textContent, /^0 cantidades/);
  ctx.confirmTimesheetAnalysis();
  assert.equal(ctx.confirmedTimesheetAnalyses.size, 0);
  ctx.renderTimesheetAnalysis(new Map([['rotation', '30']]));
  assert.equal(ctx.analysisFields.children.length, 8);
  ctx.confirmTimesheetAnalysis();
  assert.deepEqual(Object.fromEntries(ctx.confirmedTimesheetAnalyses.get('2026-09')), { rotation: '30' });
});
test('visibility changes apply again on render instead of reusing a memoized catalogue', () => {
  const ctx = setup();
  const input = new Map([['rotation', '30'], ['night', '55']]);
  ctx.renderTimesheetAnalysis(input);
  vm.runInContext("TIMESHEET_VARIABLES.find(v => v.key === 'night').reviewVisible = false", ctx);
  ctx.renderTimesheetAnalysis(input, true);
  assert.equal(ctx.analysisInputs.has('night'), false);
  assert.equal(ctx.analysisFields.children.length, 7);
  assert.match(ctx.analysisDetectedCount.textContent, /^1 cantidades/);
});
