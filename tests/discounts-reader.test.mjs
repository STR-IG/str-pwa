import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { DISCOUNT_KIND, normalizeDiscountsResponse, formatMoney, formatRate } from '../discounts-reader.mjs';

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
  assert.match(wrapper, /revisa-tu-nomina-base\.html\?v=prod-20/);
  assert.match(wrapper, /discounts-reader\.js\?v=prod-2/);
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

test('client catalog includes every requested code and keeps IRPF concepts distinct', () => {
  const expected = {
    accrued_total_cc: '9102', accrued_total_accidents: '9105', extra_pay_proration: '/341',
    march_pay_proration: '9044', other_proration: 'RDL', common_contingencies: '9350',
    unemployment: '9370', training: '9380', solidarity_contribution: '93C0', irpf: '9402',
    in_kind_irpf: '/402', company_fogasa: '/361', company_it: '/352', company_ims: '/353',
    company_pension_plan: '4001', company_meals: '9106', life_insurance: '9117', christmas_lot: '9108',
  };
  for (const [kind, code] of Object.entries(expected)) assert.equal(DISCOUNT_KIND[kind].code, code);
  assert.notEqual(DISCOUNT_KIND.irpf.label, DISCOUNT_KIND.in_kind_irpf.label);
  assert.equal(DISCOUNT_KIND.total.label, 'Total Cotiz. SS e IRPF (*)');
});

test('client normalizer preserves variable rates, sides, missing values and totals', () => {
  const normalized = normalizeDiscountsResponse({
    isDiscountsSection: true,
    quality: 'ok',
    rows: [
      { kind: 'accrued_total_cc', code: '9102', sourceText: 'Devengado Total CC', side: 'bases', value: '2.016,74' },
      { kind: 'common_contingencies', code: '9350', sourceText: 'Contingencias Comunes', side: 'worker', base: '2.016,74', rate: '4,83', amount: '97,41' },
      { kind: 'common_contingencies', code: '9350', sourceText: 'Contingencias Comunes', side: 'company', base: '2.016,74', rate: '23,60', amount: '475,95' },
      { kind: 'solidarity_contribution', code: '93C0', sourceText: 'Cuota solidaridad', side: 'worker', base: '150,00', rate: null, amount: '0,23' },
      { kind: 'irpf', code: '9402', sourceText: 'IRPF', side: 'irpf', base: 2016.74, rate: 18, amount: 363.01 },
      { kind: 'in_kind_irpf', code: '/402', sourceText: 'Ret Especie Ingr cta IRPF', side: 'irpf', base: '12,00', rate: '19,00', amount: '2,28' },
      { kind: 'company_pension_plan', code: '4001', sourceText: 'Aportación Empresa PP', side: 'contributions', value: '13,47' },
      { kind: 'total', code: 'SSIR', sourceText: 'Total Cotiz. SS e IRPF (*)', side: 'worker_total', amount: '737,26' },
      { kind: 'total', code: 'SSIR', sourceText: 'Total Cotiz. SS e IRPF (*)', side: 'company_total', amount: '661,71' },
      { kind: 'unknown', code: '9G01', sourceText: 'Compens. especial', side: 'unknown', value: '7,50' },
      { kind: 'training', code: '9380', sourceText: 'Formación Profesional', side: 'worker', base: 'x', rate: '101', amount: 'abc' },
    ],
  });
  assert.equal(normalized.readable, true);
  assert.equal(normalized.rows.length, 10);
  assert.deepEqual(normalized.rows[1], {
    kind: 'common_contingencies', code: '9350', label: 'Contingencias comunes', section: 'worker',
    sourceText: 'Contingencias Comunes', value: null, base: 2016.74, rate: 4.83, amount: 97.41,
  });
  assert.equal(normalized.rows[2].section, 'company');
  assert.equal(normalized.rows[3].rate, null);
  assert.equal(normalized.rows[4].label, 'IRPF');
  assert.equal(normalized.rows[5].label, 'Retención en especie IRPF');
  assert.equal(normalized.rows[7].section, 'worker_total');
  assert.equal(normalized.rows[8].section, 'company_total');
  assert.equal(normalized.rows[9].kind, 'unknown');
  assert.equal(formatMoney(null), 'No indicado');
  assert.equal(formatRate(null), 'No indicado');
  assert.equal(formatMoney(94.79), '94,79 €');
  assert.equal(formatRate(4.85), '4,85 %');
});

test('result presentation has the requested blocks and side-specific labels', () => {
  const titles = [
    'Bases y prorratas', 'Seguridad Social – trabajador/a', 'IRPF',
    'Seguridad Social – empresa', 'Aportaciones de la empresa', 'Total Cotiz. SS e IRPF',
  ];
  for (const title of titles) assert.ok(reader.includes(`['${title}'`));
  assert.match(reader, /% trabajador\/a/);
  assert.match(reader, /Cuota trabajador\/a/);
  assert.match(reader, /% empresa/);
  assert.match(reader, /Cuota empresa/);
  assert.match(reader, /Retención en especie/);
  assert.doesNotMatch(reader, /Total de cotizaciones y deducciones/);
});

test('unreadable responses and possible personal labels are not displayed', () => {
  assert.deepEqual(normalizeDiscountsResponse({ isDiscountsSection: false, quality: 'low', rows: [] }), { readable: false, rows: [] });
  assert.deepEqual(normalizeDiscountsResponse({ isDiscountsSection: true, quality: 'ok', rows: [
    { kind: 'unknown', sourceText: 'DNI 12345678Z' },
  ] }), { readable: false, rows: [] });
});

test('Edge catalog classifies by code and concept and separates worker from company', () => {
  const start = edge.indexOf('const discountKinds');
  const end = edge.indexOf('Deno.serve', start);
  const source = edge.slice(start, end)
    .replace(/: Record<string, RegExp>/g, '')
    .replace(/: Record<string, string>/g, '')
    .replace(/: unknown/g, '')
    .replace(/: string/g, '')
    .replace(/: number/g, '')
    .replace(/: any/g, '');
  const normalizeConceptForTest = (value) => String(value ?? '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
  const context = vm.createContext({ Set, normalizeConcept: normalizeConceptForTest });
  vm.runInContext(`${source};globalThis.result=normalizeDiscountRows([
    {code:'9102',sourceText:'Devengado Total CC',side:'bases',value:'2000,00'},
    {code:'9105',sourceText:'Devengado Total Acc/d/fp',side:'bases',value:'2100,00'},
    {code:'/341',sourceText:'Prorrata pagas extras',side:'bases',value:'300,00'},
    {code:'9044',sourceText:'Prorrata Paga de Marzo',side:'bases',value:'100,00'},
    {code:'RDL',sourceText:'Otras prorratas',side:'bases',value:'50,00'},
    {code:'9350',sourceText:'Contingencias Comunes',side:'worker',base:'2000,00',rate:'4,83',amount:'96,60'},
    {code:'9350',sourceText:'Contingencias Comunes',side:'company',base:'2000,00',rate:'23,60',amount:'472,00'},
    {code:'9370',sourceText:'Desempleo',side:'worker',base:'2000,00',rate:'1,55',amount:'31,00'},
    {code:'9380',sourceText:'Formación Profesional',side:'worker',base:'2000,00',rate:'0,10',amount:'2,00'},
    {code:'',sourceText:'MEI',side:'worker',base:'2000,00',rate:'0,13',amount:'2,60'},
    {code:'9350',sourceText:'Desempleo',side:'worker',base:'2000,00',rate:'1,55',amount:'31,00'},
    {code:'9402',sourceText:'IRPF',side:'irpf',base:'2000,00',rate:'18,00',amount:'360,00'},
    {code:'/402',sourceText:'Ret Especie Ingr cta IRPF',side:'irpf',base:'10,00',rate:'19,00',amount:'1,90'},
    {code:'93C0',sourceText:'Cuota solidaridad',side:'worker',base:'150,00',rate:null,amount:'0,23'},
    {code:'/361',sourceText:'Empr. fondo gar. salarial',side:'company',base:'2000,00',rate:'0,20',amount:'4,00'},
    {code:'/352',sourceText:'Empresa IT',side:'company',base:'2000,00',rate:'1,50',amount:'30,00'},
    {code:'/353',sourceText:'Empresa IMS',side:'company',base:'2000,00',rate:'5,50',amount:'110,00'},
    {code:'4001',sourceText:'Aportación Empresa PP',side:'contributions',value:'13,47'},
    {code:'9106',sourceText:'Comedor parte empresa',side:'contributions',value:'20,00'},
    {code:'9117',sourceText:'Seguro vida',side:'contributions',value:'4,50'},
    {code:'9108',sourceText:'Lote Navidad',side:'contributions',value:'25,00'},
    {code:'SSIR',sourceText:'Total Cotiz. SS e IRPF (*)',side:'worker_total',amount:'737,26'},
    {code:'SSIR',sourceText:'Total Cotiz. SS e IRPF (*)',side:'company_total',amount:'661,71'},
    {code:'9G01',sourceText:'Compens. especial',side:'unknown',value:'7,50'},
    {code:'',sourceText:'DNI 12345678Z',side:'unknown',amount:null}
  ])`, context);
  const rows = JSON.parse(JSON.stringify(context.result));
  assert.equal(rows.length, 24);
  assert.deepEqual(rows.filter((row) => row.kind === 'common_contingencies').map((row) => [row.kind, row.side]), [
    ['common_contingencies', 'worker'], ['common_contingencies', 'company'],
  ]);
  const kinds = new Set(rows.map((row) => row.kind));
  for (const kind of [
    'accrued_total_cc', 'accrued_total_accidents', 'extra_pay_proration', 'march_pay_proration',
    'other_proration', 'unemployment', 'training', 'mei', 'irpf', 'in_kind_irpf',
    'solidarity_contribution', 'company_fogasa', 'company_it', 'company_ims',
    'company_pension_plan', 'company_meals', 'life_insurance', 'christmas_lot', 'total', 'unknown',
  ]) assert.ok(kinds.has(kind), `missing normalized kind ${kind}`);
  assert.equal(rows.find((row) => row.kind === 'solidarity_contribution').rate, null);
  assert.ok(rows.some((row) => row.kind === 'total' && row.side === 'worker_total'));
  assert.ok(rows.some((row) => row.kind === 'total' && row.side === 'company_total'));
  assert.ok(rows.some((row) => row.kind === 'unknown' && row.code === '9350'));
  assert.ok(rows.some((row) => row.kind === 'unknown' && row.code === '9G01'));
});

test('Edge discounts mode is opt-in, variable-value and keeps original payroll path', () => {
  assert.match(edge, /readDiscounts = body\?\.readDiscounts === true/);
  assert.match(edge, /if \(readDiscounts\)/);
  for (const code of ['9102', '9105', '/341', '9044', '9350', '9370', '9380', '93C0', '9402', '/402', '/361', '/352', '/353', '4001', '9106', '9117', '9108']) {
    assert.ok(edge.includes(`"${code}"`) || edge.includes(`${code} `), `missing ${code}`);
  }
  assert.match(edge, /mismo code y sourceText, una fila side "worker" y otra side "company"/);
  assert.match(edge, /No clasifiques por importes ni porcentajes/);
  assert.doesNotMatch(edge, /4,83|4,85/);
  assert.doesNotMatch(edge, /Total de cotizaciones y deducciones/);
  assert.match(edge, /return json\(\{ isPayroll: true, concepts \}\)/);
  assert.match(edge, /includeSupplemental/);
  assert.match(edge, /includeOvertime/);
});

test('iPhone layout stacks narrow result values and avoids fixed-width cards', () => {
  assert.match(base, /@media \(max-width: 390px\)[\s\S]*?\.discounts-values \{ grid-template-columns: 1fr; \}/);
  assert.match(base, /grid-template-columns: repeat\(auto-fit, minmax\(118px, 1fr\)\)/);
  assert.match(base, /overflow-wrap: anywhere/);
});
