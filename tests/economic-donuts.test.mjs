import test from 'node:test';
import assert from 'node:assert/strict';
import { buildEconomicDonuts } from '../salary-overview.mjs';
import { buildYearStatistics, reviewToReceipt } from '../payroll-statistics.mjs';

function receipt(month = 1, company = 300, year = 2026) {
  return reviewToReceipt({ year, month, payrollEconomics: { totals: { gross: 1000, net: 800, deductions: 200 } },
    discounts: [{ section: 'irpf', kind: 'irpf', amount: 150 },
      { section: 'worker', kind: 'common_contingencies', amount: 50 },
      { section: 'company_total', kind: 'total', amount: company }] });
}

test('año y mes suman cada recibo y mantienen conjuntos comparables independientes', () => {
  const year = buildYearStatistics([receipt(), receipt(1, null), receipt(2), receipt(1, 300, 2025)], 2026);
  const annual = buildEconomicDonuts(year);
  const month = buildEconomicDonuts(year.months[0]);
  assert.equal(annual.cost.total, 2600);
  assert.equal(annual.salary.total, 3000);
  assert.equal(month.cost.total, 1300);
  assert.equal(month.salary.total, 2000);
  assert.equal(month.cost.available, 1);
  assert.equal(month.cost.withCompany, 1);
  assert.equal(month.perHundred, 800 / 1300 * 100);
  assert.equal(month.salary.slices[1].amount, 300);
});

test('ausencia no equivale a cero y el dato empresarial no limita el bruto', () => {
  const row = receipt(1, null);
  row.discounts.irpf = null;
  const result = buildEconomicDonuts({ receipts: [row] });
  assert.equal(result.cost.total, null);
  assert.equal(result.perHundred, null);
  assert.equal(result.salary.slices[1].amount, null);
  assert.equal(result.salary.remainder, 150);
  assert.equal(result.salary.valid, true);
  assert.equal(buildEconomicDonuts({ receipts: [receipt(1, 0)] }).cost.total, 1000);
});

test('descuadres y negativos no fuerzan un dónut y se detectan por recibo', () => {
  const first = receipt();
  first.metrics.net = 900;
  const second = receipt();
  second.metrics.net = 700;
  const result = buildEconomicDonuts({ receipts: [first, second] });
  assert.equal(result.salary.valid, false);
  assert.equal(result.mismatchCount, 2);
  assert.equal(result.mismatch, 0);
  first.company.socialSecurity = -1;
  assert.equal(buildEconomicDonuts({ receipts: [first] }).cost.valid, false);
});

test('sin recibos o sin líquido no se publica una proporción inventada', () => {
  assert.equal(buildEconomicDonuts({ receipts: [] }).salary.valid, false);
  const row = receipt();
  row.metrics.net = null;
  const result = buildEconomicDonuts({ receipts: [row] });
  assert.equal(result.cost.valid, true);
  assert.equal(result.perHundred, null);
});
