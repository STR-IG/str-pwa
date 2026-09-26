import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildRegisterPayrollStatistics,
  reviewToRegisterPayrollEntry
} from '../payroll-register-statistics.mjs';

function entry(year, month, payroll, timesheet, overrides = {}) {
  return reviewToRegisterPayrollEntry({
    status: 'complete', year, month, receiptId: `${year}-${month}-${Math.random()}`,
    payroll, timesheet, ...overrides
  });
}

test('suma dos nóminas y utiliza una sola vez el registro mensual compartido', () => {
  const register = { meals: 20, night: 12 };
  const statistics = buildRegisterPayrollStatistics([
    entry(2026, 8, { meals: 8, night: 5 }, register),
    entry(2026, 8, { meals: 12, night: 7 }, register)
  ], 2026, 8);
  assert.equal(statistics.receiptCount, 2);
  assert.equal(statistics.coveredMonths, 1);
  assert.equal(statistics.metrics.meals.register.value, 20);
  assert.equal(statistics.metrics.meals.payroll.value, 20);
  assert.equal(statistics.metrics.meals.difference, 0);
  assert.equal(statistics.metrics.meals.status, 'match');
});

test('el corte elegido excluye meses posteriores y conserva la diferencia acumulada', () => {
  const statistics = buildRegisterPayrollStatistics([
    entry(2026, 1, { meals: 9 }, { meals: 10 }),
    entry(2026, 9, { meals: 4 }, { meals: 4 }),
    entry(2026, 12, { meals: 30 }, { meals: 30 })
  ], 2026, 9);
  assert.equal(statistics.receiptCount, 2);
  assert.equal(statistics.metrics.meals.register.value, 14);
  assert.equal(statistics.metrics.meals.payroll.value, 13);
  assert.equal(statistics.metrics.meals.difference, -1);
  assert.equal(statistics.metrics.meals.status, 'review');
});

test('cero confirmado no se confunde con un dato ausente', () => {
  const confirmed = buildRegisterPayrollStatistics([
    entry(2026, 3, { meals: 0 }, { meals: 0 })
  ], 2026, 3);
  assert.equal(confirmed.metrics.meals.register.value, 0);
  assert.equal(confirmed.metrics.meals.payroll.value, 0);
  assert.equal(confirmed.metrics.meals.status, 'match');

  const missing = buildRegisterPayrollStatistics([
    entry(2026, 3, {}, { meals: 2 })
  ], 2026, 3);
  assert.equal(missing.metrics.meals.payroll.value, null);
  assert.equal(missing.metrics.meals.status, 'missing');
});

test('una regularización se atribuye al periodo indicado', () => {
  const regularization = entry(2026, 9, { night: 2 }, { night: 10 }, {
    documentType: 'regularization',
    attributionPeriod: { year: 2026, month: 8 },
    paymentPeriod: { year: 2026, month: 9 }
  });
  const august = buildRegisterPayrollStatistics([regularization], 2026, 8);
  assert.equal(august.months[7].receiptCount, 1);
  assert.equal(august.months[8].receiptCount, 0);
});

test('registros contradictorios no se eligen ni se suman arbitrariamente', () => {
  const statistics = buildRegisterPayrollStatistics([
    entry(2026, 8, { meals: 1 }, { meals: 1 }),
    entry(2026, 8, { meals: 1 }, { meals: 2 })
  ], 2026, 8);
  assert.equal(statistics.months[7].metrics.meals.register.conflict, true);
  assert.equal(statistics.metrics.meals.register.value, null);
  assert.equal(statistics.metrics.meals.status, 'missing');
});
