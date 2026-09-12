import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('../revisa-tu-nomina-base.html', import.meta.url), 'utf8');
const source = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1].replace(/\r/g, '');

function extract(name) {
  const start = source.search(new RegExp(`    function ${name}\\(`));
  assert.ok(start >= 0, name);
  return source.slice(start, source.indexOf('\n    }', start) + 6);
}

const configStart = source.indexOf('    const DOCUMENT_KIND_MARKERS');
const configEnd = source.indexOf('    const documents', configStart);
const functions = [
  'normalizeOcrText',
  'detectDocumentKind',
  'normalizeOcrLine',
  'isTheoreticalPc30',
  'matchTimesheetVariable',
  'numericCandidates',
  'normalizeDetectedQuantity',
  'quantityFromConceptLine',
  'parseTimesheetText',
  'matchPayrollVariable',
  'quantityFromPayrollLine',
  'parsePayrollText',
].map(extract).join('\n');

const context = vm.createContext({ Map, Set, String, Number, Math, Object });
vm.runInContext(`${source.slice(configStart, configEnd)}\n${functions}`, context);

test('septiembre 2025 lee únicamente concepto y cantidad de la misma fila', () => {
  const text = `
    01/09/2025 06:00 14:00 7,92
    20,7
    RESUMEN DE VARIABLES DEL MES
    CONCEPTO CANTIDAD
    Plus rotatividad 30
    Comidas Can Guasch 4
    PLUS NOCTURNO 55,08
    Plus de turno 15
    NOPAGA PNocturn teor 2,17
    Plus Festivo 48
    Dietas Festivos 4
    Plus de turno 12 h 4
    Pluses Vacaciones 2
    SALDOS
    NOPAGA PFestivo teor 3,42
  `;

  const values = Object.fromEntries(
    [...context.parseTimesheetText(text)].map(([key, result]) => [key, result.value])
  );

  assert.deepEqual(values, {
    rotation: '30',
    meals: '4',
    night: '55,08',
    shift: '15',
    unpaidNight: '2,17',
    holiday: '48',
    holidayDiets: '4',
    shift12: '4',
    vacation: '2',
  });
  assert.equal(values.unpaidHoliday, undefined);
});

test('no toma una cifra de otra línea para completar un concepto', () => {
  const values = context.parseTimesheetText(`
    RESUMEN DE VARIABLES DEL MES
    Plus Nocturno
    1
    Plus Festivo
    20,7
    SALDOS
  `);

  assert.equal(values.has('night'), false);
  assert.equal(values.has('holiday'), false);
});

test('enero 2026 excluye los teóricos PC30 y conserva solo los pluses ordinarios', () => {
  const values = Object.fromEntries([...context.parseTimesheetText(`
    RESUMEN DE VARIABLES DEL MES
    CONCEPTO CANTIDAD
    Plus rotatividad 23
    Plus rotativid. teór. PC30 7
    Plus Nocturno teórico PC30 1,25
    Plus de turno teor PC30 5
    Plus Festivo teorico PC30 8
    Plus Nocturno 56
    Plus Festivo 42
    Plus de turno 12 horas 3
    Dietas Festivos 3
    NOPAGA PNocturn teór 2,17
    NOPAGA PFestivo teórico 3,42
    SALDOS
  `)].map(([key, result]) => [key, result.value]));

  assert.deepEqual(values, {
    rotation: '23',
    night: '56',
    holiday: '42',
    unpaidNight: '2,17',
    unpaidHoliday: '3,42',
    shift12: '3',
    holidayDiets: '3',
  });
});

test('visión ignora teóricos PC30 antes de clasificar conceptos ordinarios', () => {
  const vision = readFileSync(new URL('../timesheet-vision-lab.js', import.meta.url), 'utf8');
  const extractVision = (name) => {
    const start = vision.indexOf(`  function ${name}(`);
    assert.ok(start >= 0, name);
    return vision.slice(start, vision.indexOf('\n  }', start) + 4);
  };
  const visionContext = vm.createContext({ String });
  vm.runInContext([
    extractVision('norm'), extractVision('isTheoreticalPc30'), extractVision('conceptKey')
  ].join('\n'), visionContext);

  assert.equal(visionContext.conceptKey('Plus Nocturno teór. PC30'), '');
  assert.equal(visionContext.conceptKey('Plus Festivo teorico PC30'), '');
  assert.equal(visionContext.conceptKey('Plus Nocturno'), 'night');
  assert.equal(visionContext.conceptKey('Plus Festivo'), 'holiday');
  assert.equal(visionContext.conceptKey('NOPAGA PNocturn teór'), 'night');
});

test('0036 Comidas Can Guasch toma 2 de CANTIDAD y conserva el resto de conceptos', () => {
  const values = Object.fromEntries([...context.parsePayrollText(`
    DEVENGOS Y DEDUCCIONES
    CÓDIGO CONCEPTO CANTIDAD IMPORTE DIARIO DEVENGOS DEDUCCIONES
    0016 Plus rotatividad 30 5,1916 155,75
    0013 Plus Nocturno 55,08 6,8800 378,95
    0010 Plus de turno 15 7,4600 111,90
    0017 Plus Festivo 48 17,2101 826,08
    0036 Comidas Can Guasch 2 1,7800 3,56
    0006 Plus de turno 12 horas 4 10,5600 42,24
    0034 Dietas Festivos 4 14,9500 59,80
    Total: 1.578,28
  `)].map(([key, result]) => [key, result.value]));

  assert.deepEqual(values, {
    rotation: '30',
    meals: '2',
    night: '55,08',
    shift: '15',
    holiday: '48',
    shift12: '4',
    holidayDiets: '4',
  });
});

test('visión enruta el código exacto 0036 a Comidas sin usar importes', () => {
  const vision = readFileSync(new URL('../payroll-vision-lab.js', import.meta.url), 'utf8');
  const start = vision.indexOf('  function norm(');
  const end = vision.indexOf('\n  function markAsRead', start);
  const visionContext = vm.createContext({ String });
  vm.runInContext(vision.slice(start, end), visionContext);
  assert.equal(visionContext.conceptKey('0036 Comidas Can Guasch'), 'meals');
  assert.equal(visionContext.conceptKey('0036'), 'meals');
});

test('visión distingue vacaciones ausentes en noviembre y leídas en diciembre', () => {
  const vision = readFileSync(new URL('../timesheet-vision-lab.js', import.meta.url), 'utf8');
  const extractVision = (name) => {
    const start = vision.indexOf(`  function ${name}(`);
    assert.ok(start >= 0, name);
    return vision.slice(start, vision.indexOf('\n  }', start) + 4);
  };
  const badge = {textContent:'COMPROBAR',className:''};
  const input = {
    value:'', placeholder:'', dataset:{}, parentElement:{parentElement:null,querySelectorAll:()=>[badge]},
    dispatchEvent(){badge.textContent=this.value ? 'REVISADO' : 'COMPROBAR';}
  };
  const counter = {textContent:''};
  const ids = {vacation:input};
  const visionContext = vm.createContext({
    FIELD_MAP:{vacation:'analysis-vacation'}, Map, Set, String,
    document:{getElementById:id=>id==='analysis-detected-count'?counter:ids.vacation},
    Event:class {}, setTimeout:fn=>fn()
  });
  vm.runInContext([
    extractVision('norm'), extractVision('isTheoreticalPc30'), extractVision('conceptKey'), extractVision('markState'), extractVision('clearAndApply')
  ].join('\n'), visionContext);

  visionContext.clearAndApply([]);
  assert.equal(input.value,'0');
  assert.equal(badge.textContent,'NO APARECE ESTE MES');

  input.value=''; badge.textContent='COMPROBAR';
  visionContext.clearAndApply([{name:'Pluses vacaciones',value:'3'}]);
  assert.equal(input.value,'3');
  assert.equal(badge.textContent,'LEÍDO');

  input.value=''; badge.textContent='COMPROBAR';
  visionContext.clearAndApply([{name:'Pluses vacaciones',value:null}]);
  assert.equal(input.value,'');
  assert.equal(badge.textContent,'COMPROBAR');
});
