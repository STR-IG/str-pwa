import test from 'node:test';
import assert from 'node:assert/strict';
import {
  availableYears,
  buildYearStatistics,
  conceptTotal,
  reviewToReceipt
} from '../payroll-statistics.mjs';

function review(year, month, overrides = {}) {
  return {
    version: 2,
    status: 'complete',
    year,
    month,
    period: `${year}-${String(month).padStart(2, '0')}`,
    receiptId: `receipt-${year}-${month}-${Math.random()}`,
    payrollEconomics: {
      totals: { gross: 3000, deductions: 600, net: 2400 },
      concepts: [
        { code: '0001', label: 'Salario mínimo garantizado', amount: 1800, side: 'earnings', group: 'fixed' },
        { code: '0013', label: 'Plus nocturno', quantity: 24, amount: 180, side: 'earnings', group: 'variable' },
        { code: '0017', label: 'Plus festivo', quantity: 12, amount: 90, side: 'earnings', group: 'variable' }
      ]
    },
    discounts: [
      { kind: 'irpf', section: 'irpf', amount: 400 },
      { kind: 'common_contingencies', section: 'worker', amount: 150 },
      { kind: 'unemployment', section: 'worker', amount: 50 }
    ],
    ...overrides
  };
}

test('una única nómina ocupa solo su mes; los demás meses son Sin datos, nunca cero', () => {
  const receipt = reviewToReceipt(review(2026, 8));
  const statistics = buildYearStatistics([receipt], 2026);
  assert.deepEqual(statistics.availableMonths, [8]);
  assert.equal(statistics.metrics.gross.value, 3000);
  assert.equal(statistics.months[7].metrics.net.value, 2400);
  assert.equal(statistics.months[7].hasData, true);
  assert.equal(statistics.months[0].hasData, false);
  assert.equal(statistics.months[0].metrics.gross.value, null);
  assert.equal(statistics.months[0].metrics.gross.available, 0);
});

test('meses no consecutivos acumulan únicamente marzo, agosto y septiembre', () => {
  const receipts = [3, 8, 9].map((month) => reviewToReceipt(review(2026, month)));
  const statistics = buildYearStatistics(receipts, 2026);
  assert.deepEqual(statistics.availableMonths, [3, 8, 9]);
  assert.equal(statistics.receiptCount, 3);
  assert.equal(statistics.metrics.gross.value, 9000);
  assert.equal(statistics.metrics.net.value, 7200);
  assert.equal(statistics.metrics.deductions.value, 1800);
  assert.equal(statistics.months[4].metrics.net.value, null);
});

test('varias nóminas del mismo mes y una regularización se suman sin duplicar el mes', () => {
  const ordinary = reviewToReceipt(review(2026, 8));
  const regularization = reviewToReceipt(review(2026, 8, {
    receiptId: 'receipt-regularization',
    documentType: 'regularization',
    paymentPeriod: { year: 2026, month: 9 },
    attributionPeriod: { year: 2026, month: 8 },
    payrollEconomics: {
      totals: { gross: 120, deductions: 20, net: 100 },
      concepts: [{ code: '7013', label: 'Difer. Grup. Sup. Pl. Noct.', amount: 120, side: 'earnings', group: 'complement' }]
    },
    discounts: []
  }));
  const statistics = buildYearStatistics([ordinary, regularization], 2026);
  const august = statistics.months[7];
  assert.deepEqual(statistics.availableMonths, [8]);
  assert.equal(august.receiptCount, 2);
  assert.equal(august.regularizationCount, 1);
  assert.equal(august.metrics.gross.value, 3120);
  assert.equal(august.metrics.net.value, 2500);
  assert.equal(august.concepts.find((concept) => concept.code === '7013').amount, 120);
});

test('las revisiones anteriores reutilizan líquido, complementos y descuentos ya guardados', () => {
  const legacy = reviewToReceipt({
    version: 2,
    status: 'complete',
    year: 2025,
    month: 12,
    receiptId: 'legacy:2025-12',
    paymentInfo: { breakdown: { netTotal: 2180.5 } },
    supplemental: {
      '0001': { code: '0001', status: 'present', quantity: 30, unitPrice: 50, amount: 1500 },
      '0038': { code: '0038', status: 'present', amount: 12 },
      '7016': { code: '7016', label: 'Difer. Grup. Sup. Pl. Rotat.', status: 'present', quantity: 4, amount: 14.4 }
    },
    overtime: { code: '0029', status: 'present', quantity: 2, unitPrice: 25, amount: 50 },
    discounts: [
      { kind: 'irpf', section: 'irpf', amount: 300 },
      { kind: 'common_contingencies', section: 'worker', amount: 140 }
    ]
  });
  const statistics = buildYearStatistics([legacy], 2025);
  assert.equal(statistics.metrics.net.value, 2180.5);
  assert.equal(statistics.metrics.gross.value, null);
  assert.equal(statistics.metrics.deductions.value, null);
  assert.equal(statistics.discounts.irpf.value, 300);
  assert.equal(statistics.discounts.socialSecurity.value, 140);
  assert.equal(statistics.concepts.find((concept) => concept.code === '0001').amount, 1500);
  assert.equal(statistics.concepts.find((concept) => concept.code === '0029').amount, 50);
  assert.equal(statistics.concepts.find((concept) => concept.code === '0038').side, 'deductions');
});

test('los importes confirmados sustituyen la lectura económica del mismo código', () => {
  const receipt = reviewToReceipt(review(2026, 7, {
    payrollEconomics: {
      totals: { gross: 3000, deductions: 600, net: 2400 },
      concepts: [
        { code: '0001', label: 'Salario mínimo garantizado', amount: 1800, side: 'earnings', group: 'fixed' },
        { code: '0002', label: 'Plus convenio', amount: 500, side: 'earnings', group: 'fixed' }
      ]
    },
    supplemental: {
      '0001': { code: '0001', status: 'present', quantity: 30, unitPrice: 60, amount: 1800.01 },
      '0002': { code: '0002', status: 'absent' }
    }
  }));
  assert.equal(receipt.concepts.find((concept) => concept.code === '0001').amount, 1800.01);
  assert.equal(receipt.concepts.filter((concept) => concept.code === '0001').length, 1);
  assert.equal(receipt.concepts.some((concept) => concept.code === '0002'), false);
});

test('añadir o eliminar una nómina recalcula desde los recibos originales sin caché estadística', () => {
  const march = reviewToReceipt(review(2026, 3));
  const august = reviewToReceipt(review(2026, 8));
  assert.equal(buildYearStatistics([march], 2026).metrics.gross.value, 3000);
  assert.equal(buildYearStatistics([march, august], 2026).metrics.gross.value, 6000);
  assert.deepEqual(buildYearStatistics([august], 2026).availableMonths, [8]);
});

test('años y totales de nocturnidad/festivos proceden solo de conceptos existentes', () => {
  const receipts = [reviewToReceipt(review(2025, 12)), reviewToReceipt(review(2026, 1))];
  assert.deepEqual(availableYears(receipts), [2026, 2025]);
  const statistics = buildYearStatistics(receipts, 2026);
  assert.equal(conceptTotal(statistics.concepts, (concept) => concept.code === '0013'), 180);
  assert.equal(conceptTotal(statistics.concepts, (concept) => concept.code === '9999'), null);
});

test('las cantidades fiables se acumulan y un concepto repetido no duplica el número de recibos', () => {
  const receipt = reviewToReceipt(review(2026, 6, {
    payrollEconomics: {
      totals: { gross: 3000, deductions: 600, net: 2400 },
      concepts: [
        { code: '0013', label: 'Plus nocturno', quantity: 4.5, amount: 40, side: 'earnings', group: 'variable' },
        { code: '0013', label: 'Plus nocturno', quantity: 2, amount: 20, side: 'earnings', group: 'variable' },
        { code: '9999', label: 'DNI 12345678Z', quantity: 1, amount: 5, side: 'earnings' },
        { code: '8888', label: 'Sin lado', quantity: 1, amount: 5 }
      ]
    }
  }));
  const concepts = buildYearStatistics([receipt], 2026).concepts;
  const night = concepts.find((concept) => concept.code === '0013');
  assert.equal(night.amount, 60);
  assert.equal(night.quantity, 6.5);
  assert.equal(night.quantityComplete, true);
  assert.equal(night.receipts, 1);
  assert.equal(concepts.some((concept) => concept.code === '8888'), false);
  assert.equal(concepts.find((concept) => concept.code === '9999').label, '9999');
});
