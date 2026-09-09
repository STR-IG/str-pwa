import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { extractPaymentBreakdown, hasCompletePaymentBreakdown, relatePaymentAdjustment } from '../payroll-payments.mjs';

test('noviembre 2025: cantidad pendiente negativa se relaciona con NOPAGA festivo del mes', () => {
  const breakdown = extractPaymentBreakdown(`
    DESGLOSE PAGOS
    TRANSFER. 1 2.247,01
    CANTIDAD PDTE −41,80
    LÍQUIDO TOTAL 2.205,21
    DEVENGOS Y DEDUCCIONES
  `);
  assert.deepEqual(breakdown, {
    transfers: [{ number: 1, amount: 2247.01 }],
    transfer1: 2247.01,
    transfer2: null,
    pendingAmount: -41.8,
    netTotal: 2205.21
  });
  const info = relatePaymentAdjustment(breakdown, { unpaidHoliday: '3,42' }, {});
  assert.equal(info.adjustment.status, 'identified');
  assert.equal(info.adjustment.sourceMonth, 'current');
  assert.deepEqual(info.adjustment.matches.map(item => [item.key, item.hours]), [['unpaidHoliday', 3.42]]);
});

test('junio/julio 2026: busca el mes anterior y no calcula ninguna tarifa', () => {
  const breakdown = extractPaymentBreakdown(`
    DESGLOSE PAGOS
    TRANSFER. 1 1.500,00
    TRANSFER. 2 300,00
    CANTIDAD PDTE 24,67-
    LÍQUIDO TOTAL 1.775,33
  `);
  const info = relatePaymentAdjustment(breakdown, {}, { unpaidNight: '1,5', unpaidHoliday: '1,5' });
  assert.equal(info.adjustment.amount, -24.67);
  assert.equal(info.adjustment.sourceMonth, 'previous');
  assert.equal(info.adjustment.matches.length, 2);
  assert.equal('rate' in info.adjustment, false);
  assert.equal('calculatedAmount' in info.adjustment, false);
});

test('ajuste sin NOPAGA queda pendiente de identificar', () => {
  const breakdown = extractPaymentBreakdown('DESGLOSE PAGOS\nCANTIDAD PDTE -12,30\nLÍQUIDO TOTAL 950,00');
  const info = relatePaymentAdjustment(breakdown, {}, {});
  assert.equal(info.adjustment.status, 'pending');
  assert.deepEqual(info.adjustment.matches, []);
});

test('rechaza un recorte que empieza en devengos y acepta el bloque completo', () => {
  assert.equal(hasCompletePaymentBreakdown('DEVENGOS Y DEDUCCIONES\n0001 SALARIO'), false);
  assert.equal(hasCompletePaymentBreakdown('DESGLOSE PAGOS\nDEVENGOS Y DEDUCCIONES'), true);
  assert.equal(hasCompletePaymentBreakdown(`
    DESGLOSE PAGOS
    TRANSFER. 1 2.247,01
    LÍQUIDO TOTAL 2.247,01
    DEVENGOS Y DEDUCCIONES
  `), true);
});

test('guarda transferencias numeradas futuras sin inventar cantidad pendiente', () => {
  const breakdown = extractPaymentBreakdown(`
    DESGLOSE PAGOS
    TRANSFER. 1 1.000,00
    TRANSFER. 2 200,00
    TRANSFER. 3 50,00
    LÍQUIDO TOTAL 1.250,00
    DEVENGOS Y DEDUCCIONES
  `);
  assert.deepEqual(breakdown.transfers, [
    { number: 1, amount: 1000 },
    { number: 2, amount: 200 },
    { number: 3, amount: 50 }
  ]);
  assert.equal(breakdown.pendingAmount, null);
});

test('el flujo existente amplía el recorte y guarda la información en el recibo', () => {
  const html = readFileSync(new URL('../revisa-tu-nomina-base.html', import.meta.url), 'utf8');
  assert.match(html, /y: 0\.30, width: 1, height: 0\.70/);
  assert.match(html, /Empieza por encima de «DESGLOSE PAGOS»/);
  assert.match(html, /paymentInfo: documents\.payroll\.paymentInfo/);
  assert.match(html, /await previousMonthTimesheetValues\(\)/);
  assert.match(html, /missing-payment-breakdown/);
  assert.match(html, /!hasCompletePaymentBreakdown\(recognizedText\)/);
});
