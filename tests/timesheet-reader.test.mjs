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

const configStart = source.indexOf('    const TIMESHEET_VARIABLES');
const configEnd = source.indexOf('    const COMPARABLE_KEYS', configStart);
const functions = [
  'normalizeOcrText',
  'detectDocumentKind',
  'normalizeOcrLine',
  'matchTimesheetVariable',
  'numericCandidates',
  'normalizeDetectedQuantity',
  'quantityFromConceptLine',
  'parseTimesheetText',
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
