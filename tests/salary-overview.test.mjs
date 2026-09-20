import test from 'node:test';
import assert from 'node:assert/strict';
import { buildEconomicValue } from '../salary-overview.mjs';

const period = receipt => ({ receipts: [receipt] });
const receipt = ({ gross = 3000, net = 2300, irpf = 500, worker = 200, other = 0, company = 750 } = {}) => ({
  metrics: { gross, net },
  discounts: { irpf, socialSecurity: worker, other },
  company: { socialSecurity: company }
});

test('calcula bruto más aportaciones y separa impuestos públicos', () => {
  const value = buildEconomicValue(period(receipt()));
  assert.equal(value.totalRepresented, 3750);
  assert.equal(value.publicTotal, 1450);
  assert.equal(value.fromPayroll, 700);
  assert.equal(value.twoPart, true);
  assert.deepEqual(value.slices.map(slice => slice.amount), [2300, 1450]);
});

test('no clasifica otras deducciones como Administración', () => {
  const value = buildEconomicValue(period(receipt({ net: 2200, other: 100 })));
  assert.equal(value.publicTotal, 1450);
  assert.equal(value.twoPart, false);
  assert.deepEqual(value.slices.map(slice => slice.amount), [2200, 1450, 100]);
});

test('no fuerza un gráfico cuando los importes no cuadran', () => {
  const value = buildEconomicValue(period(receipt({ net: 2400 })));
  assert.equal(value.slices.length, 0);
  assert.match(value.reason, /no permite/);
});

test('usa solo nóminas comparables y comunica cobertura parcial', () => {
  const value = buildEconomicValue({ receipts: [receipt(), receipt({ company: null })] });
  assert.equal(value.available, 1);
  assert.equal(value.total, 2);
  assert.equal(value.complete, false);
});
