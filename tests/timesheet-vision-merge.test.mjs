import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../timesheet-vision-lab.js', import.meta.url), 'utf8');
function setup(previous) {
  const input = { value: previous, dataset: {}, dispatchEvent() {}, closest() { return null; } };
  const context = vm.createContext({
    document: { getElementById: id => id === 'analysis-shift12' ? input : null },
    Event: class {}, setTimeout() {}, MutationObserver: class { observe() {} },
  });
  vm.runInContext(source.replace('  const observer = new MutationObserver',
    '  globalThis.apply = clearAndApply;\n  const observer = new MutationObserver'), context);
  return { input, apply: context.apply };
}

test('una lectura visual vacía conserva el 2 detectado para el turno de 12 horas', () => {
  const { input, apply } = setup('2');
  assert.equal(apply([{ name: 'Plus de turno 12 horas', value: '' }]), 1);
  assert.equal(input.value, '2');
  assert.equal(input.dataset.labAutoRead, 'ocr');
});

test('sin cantidad en ninguna lectura el turno de 12 horas sigue vacío', () => {
  const { input, apply } = setup('');
  assert.equal(apply([{ name: 'Plus de turno 12 horas', value: null }]), 0);
  assert.equal(input.value, '');
  assert.equal(input.placeholder, 'No leído automáticamente');
});

test('la cantidad visual explícita, incluido cero, prevalece sobre la inicial', () => {
  for (const value of ['3', 0]) {
    const { input, apply } = setup('2');
    assert.equal(apply([{ name: 'Plus de turno 12 horas', value }]), 1);
    assert.equal(input.value, String(value));
    assert.equal(input.dataset.labAutoRead, 'vision');
  }
});

function setupAll(previous = {}) {
  const keys = ['rotation', 'meals', 'night', 'shift', 'holiday', 'shift12', 'holidayDiets', 'vacation'];
  const inputs = Object.fromEntries(keys.map(key => [key, {
    value: previous[key] || '', dataset: {}, dispatchEvent() {}, closest() { return null; },
  }]));
  const context = vm.createContext({
    document: { getElementById: id => inputs[id.replace('analysis-', '')] || null },
    Event: class {}, setTimeout() {}, MutationObserver: class { observe() {} },
  });
  vm.runInContext(source.replace('  const observer = new MutationObserver',
    '  globalThis.apply = clearAndApply;\n  const observer = new MutationObserver'), context);
  return { inputs, apply: context.apply };
}

const august = [
  ['Plus rotatividad', '30'], ['Pluses Vacaciones', '17'],
  ['Plus de turno 12 horas', '2'], ['Dietas Festivos', '2'],
  ['Plus Festivo', '24'], ['Comidas Can Guasch', '1'], ['Plus de turno', '1'],
].map(([name, value]) => ({ name, value }));

test('agosto 2026 reconoce las siete etiquetas y confirma el nocturno ausente como cero', () => {
  const { inputs, apply } = setupAll();
  assert.equal(apply(august, true), 7);
  assert.deepEqual(Object.fromEntries(Object.entries(inputs).map(([key, input]) => [key, input.value])), {
    rotation: '30', meals: '1', night: '0', shift: '1', holiday: '24',
    shift12: '2', holidayDiets: '2', vacation: '17',
  });
  assert.equal(inputs.night.dataset.labAutoRead, 'absent');
});

test('cantidades visuales vacías conservan comidas y festivo leídos por OCR', () => {
  const { inputs, apply } = setupAll({ meals: '1', holiday: '24' });
  apply(august.map(row => /Comidas|Plus Festivo/.test(row.name) ? { ...row, value: '' } : row), true);
  assert.equal(inputs.meals.value, '1');
  assert.equal(inputs.holiday.value, '24');
});

test('tabla incompleta y fila presente ilegible no se convierten en ceros', () => {
  const { inputs, apply } = setupAll();
  apply(august, false);
  assert.equal(inputs.night.value, '');
  apply([...august, { name: 'Plus nocturno', value: '' }], true);
  assert.equal(inputs.night.value, '');
  assert.equal(inputs.night.placeholder, 'No leído automáticamente');
});

test('normaliza mayúsculas y espacios sin confundir festivos ni turnos', () => {
  const { inputs, apply } = setupAll();
  apply(august.map(row => ({ ...row, name: row.name.toUpperCase().replaceAll(' ', '   ') })), true);
  assert.equal(inputs.meals.value, '1');
  assert.equal(inputs.holiday.value, '24');
  assert.equal(inputs.holidayDiets.value, '2');
  assert.equal(inputs.shift.value, '1');
  assert.equal(inputs.shift12.value, '2');
});
