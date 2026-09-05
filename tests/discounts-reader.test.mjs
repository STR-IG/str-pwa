import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { normalizeDiscountsResponse, formatMoney, formatRate } from '../discounts-reader.mjs';

const base = readFileSync(new URL('../revisa-tu-nomina-base.html', import.meta.url), 'utf8');
const wrapper = readFileSync(new URL('../revisa-tu-nomina.html', import.meta.url), 'utf8');
const reader = readFileSync(new URL('../discounts-reader.js', import.meta.url), 'utf8');
const edge = readFileSync(new URL('../supabase/functions/lab-read-payroll-variables/index.ts', import.meta.url), 'utf8');

test('the period screen keeps Registro and Nómina and adds Descuentos after them', () => {
  const timesheet = base.indexOf('id="timesheet-card"');
  const payroll = base.indexOf('id="payroll-card"');
  const discounts = base.indexOf('id="discounts-card"');
  assert.ok(timesheet > 0 && timesheet < payroll && payroll < discounts);
  assert.match(base, /id="open-discounts"[^>]*>Abrir Descuentos</);
  assert.match(base, /id="discounts-screen"/);
  assert.match(wrapper, /discounts-reader\.js\?v=prod-1/);
});

test('discounts reader uses one temporary image and never calls permanent storage', () => {
  assert.match(base, /id="discounts-image"[^>]*type="file"/);
  assert.match(base, /Revisar descuentos/);
  assert.match(reader, /URL\.createObjectURL/);
  assert.match(reader, /URL\.revokeObjectURL/);
  assert.match(reader, /readDiscounts: true/);
  assert.doesNotMatch(reader, /\.storage\b|STORAGE_BUCKET|\.upload\(/);
  assert.doesNotMatch(edge, /readDiscounts[\s\S]{0,1200}\.from\([^)]*payroll_documents/i);
});

test('client normalizer accepts only reliable bounded discount values', () => {
  const normalized = normalizeDiscountsResponse({
    isDiscountsSection: true,
    quality: 'ok',
    rows: [
      { kind: 'common_contingencies', sourceText: 'Contingencias comunes', base: '2.016,74', rate: '4,70', amount: '94,79' },
      { kind: 'irpf', sourceText: 'IRPF', base: 2016.74, rate: 18, amount: 363.01 },
      { kind: 'something-new', sourceText: 'Cuota solidaridad', base: null, rate: '0,15', amount: '3,03' },
      { kind: 'training', sourceText: 'Formación', base: '999999999', rate: '101', amount: 'abc' },
    ],
  });
  assert.equal(normalized.readable, true);
  assert.equal(normalized.rows.length, 3);
  assert.deepEqual(normalized.rows[0], {
    kind: 'common_contingencies', label: 'Contingencias comunes', section: 'social',
    sourceText: 'Contingencias comunes', base: 2016.74, rate: 4.7, amount: 94.79,
  });
  assert.equal(normalized.rows[2].kind, 'unknown');
  assert.equal(normalized.rows[2].sourceText, 'Cuota solidaridad');
  assert.equal(formatMoney(94.79), '94,79 €');
  assert.equal(formatRate(4.7), '4,70 %');
});

test('unreadable responses and possible personal labels are not displayed', () => {
  assert.deepEqual(normalizeDiscountsResponse({ isDiscountsSection: false, quality: 'low', rows: [] }), { readable: false, rows: [] });
  assert.deepEqual(normalizeDiscountsResponse({ isDiscountsSection: true, quality: 'ok', rows: [
    { kind: 'unknown', sourceText: 'DNI 12345678Z' },
  ] }), { readable: false, rows: [] });
});

test('Edge discounts mode is opt-in and keeps the original payroll path', () => {
  assert.match(edge, /readDiscounts = body\?\.readDiscounts === true/);
  assert.match(edge, /if \(readDiscounts\)/);
  assert.match(edge, /common_contingencies/);
  assert.match(edge, /Mecanismo de Equidad Intergeneracional/);
  assert.match(edge, /unemployment/);
  assert.match(edge, /training/);
  assert.match(edge, /kind unknown/);
  assert.match(edge, /return json\(\{ isPayroll: true, concepts \}\)/);
  assert.match(edge, /includeSupplemental/);
  assert.match(edge, /includeOvertime/);
});

test('server normalizer removes identifiers and never invents unreadable numbers', () => {
  const start = edge.indexOf('const discountKinds');
  const end = edge.indexOf('Deno.serve', start);
  let source = edge.slice(start, end)
    .replace(/: unknown/g, '')
    .replace(/: number/g, '')
    .replace(/: any/g, '');
  const context = vm.createContext({ Set });
  vm.runInContext(`${source};globalThis.result=normalizeDiscountRows([
    {kind:'mei',sourceText:'MEI',base:'2.000,00',rate:'0,13',amount:'2,60'},
    {kind:'unknown',sourceText:'NIF 12345678Z',base:null,rate:null,amount:null},
    {kind:'training',sourceText:'Formación profesional',base:'x',rate:'0,10',amount:null}
  ])`, context);
  assert.equal(context.result.length, 2);
  assert.equal(context.result[0].base, 2000);
  assert.equal(context.result[0].rate, 0.13);
  assert.equal(context.result[1].base, null);
  assert.equal(context.result[1].rate, 0.1);
});

test('iPhone layout stacks narrow result values and avoids fixed-width cards', () => {
  assert.match(base, /@media \(max-width: 390px\)[\s\S]*?\.discounts-values \{ grid-template-columns: 1fr; \}/);
  assert.match(base, /grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(base, /overflow-wrap: anywhere/);
});
