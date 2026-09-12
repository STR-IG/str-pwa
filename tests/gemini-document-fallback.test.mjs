import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  GEMINI_FIELDS,
  mergeGeminiFields,
  payrollFallbackKeys,
  readGeminiFallback,
  timesheetFallbackKeys,
} from '../gemini-document-fallback.mjs';

const conceptKey = (name) => ({
  'Plus rotatividad': 'rotation',
  'Comidas Can Guasch': 'meals',
  'Plus Nocturno': 'night',
  'Plus de turno': 'shift',
  'Plus Festivo': 'holiday',
  'Plus de turno 12 horas': 'shift12',
  'Dietas Festivos': 'holidayDiets',
  'Pluses Vacaciones': 'vacation',
})[name] || '';

test('una lectura STR completa no activa Gemini', async () => {
  const values = new Map(Object.keys(GEMINI_FIELDS).map((key, index) => [key, String(index + 2)]));
  assert.deepEqual(payrollFallbackKeys(values, new Map(values), new Set(values.keys())), []);
  assert.deepEqual(timesheetFallbackKeys(values, new Map(values)), []);
  assert.equal(await readGeminiFallback({ session: { access_token: 'test' }, documentType: 'payroll', img: null, requestedKeys: [] }), null);
});

test('Comidas Can Guasch ausente en STR se completa con CANTIDAD 2', () => {
  const requested = payrollFallbackKeys(new Map(), new Map(), new Set(['meals']));
  assert.deepEqual(requested, ['meals']);
  const merged = mergeGeminiFields([], {
    comidas_can_guasch: { value: 2, found: true },
  }, requested, new Map(), conceptKey);
  assert.deepEqual(merged, [{ name: 'Comidas Can Guasch', value: '2', engine: 'gemini' }]);
});

test('Plus de turno dudoso usa 11 solo cuando Gemini confirma la otra lectura STR', () => {
  const concepts = [{ name: 'Plus de turno', value: '1' }];
  const local = new Map([['shift', '11']]);
  const requested = payrollFallbackKeys(new Map([['shift', '1']]), local, new Set(['shift']));
  assert.deepEqual(requested, ['shift']);
  const merged = mergeGeminiFields(concepts, {
    plus_turno: { value: 11, found: true },
  }, requested, local, conceptKey);
  assert.equal(merged[0].value, '11');
  assert.equal(merged[0].engine, 'gemini');
});

test('Gemini inválido o no disponible no altera los valores STR', () => {
  const concepts = [{ name: 'Plus de turno', value: '1' }];
  assert.deepEqual(mergeGeminiFields(concepts, null, ['shift'], new Map([['shift', '11']]), conceptKey), [
    { name: 'Plus de turno', value: '1', engine: 'str' },
  ]);
  assert.deepEqual(mergeGeminiFields(concepts, {
    plus_turno: { value: null, found: false },
  }, ['shift'], new Map([['shift', '11']]), conceptKey), [
    { name: 'Plus de turno', value: '1', engine: 'str' },
  ]);
});

test('PC30, ordinarios y NOPAGA tienen identificadores literales distintos en servidor', async () => {
  const edge = await readFile(new URL('../supabase/functions/gemini-str/index.ts', import.meta.url), 'utf8');
  for (const field of [
    'plus_nocturno', 'plus_nocturno_teor_pc30', 'plus_festivo',
    'plus_festivo_teor_pc30', 'nopaga_pnocturn_teor', 'nopaga_pfestivo_teor',
  ]) assert.match(edge, new RegExp(`${field}:`));
  assert.match(edge, /No mezcles una fila ordinaria con otra que incluya teór\.\/teórico PC30 ni con NOPAGA/);
});

test('el cliente agrupa como máximo una llamada Gemini por documento', async () => {
  const payroll = await readFile(new URL('../payroll-vision-lab.js', import.meta.url), 'utf8');
  const timesheet = await readFile(new URL('../timesheet-vision-lab.js', import.meta.url), 'utf8');
  assert.equal(payroll.match(/readGeminiFallback\(/g)?.length, 1);
  assert.equal(timesheet.match(/readGeminiFallback\(/g)?.length, 1);
  assert.match(payroll, /catch \{\}/);
  assert.match(timesheet, /catch \{\}/);
});
