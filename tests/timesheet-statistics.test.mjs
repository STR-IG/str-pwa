import test from 'node:test';
import assert from 'node:assert/strict';
import {
  availableTimesheetYears,
  buildTimesheetYearStatistics,
  reviewToTimesheet
} from '../timesheet-statistics.mjs';

function entry(year, month, timesheet, receiptId = `${year}-${month}`) {
  return reviewToTimesheet({ year, month, receiptId, status: 'complete', timesheet });
}

test('un mes con dos nóminas contabiliza una sola vez el Registro compartido', () => {
  const register = { night: '17', holiday: '8', meals: '0', vacation: '2', shift: '4' };
  const statistics = buildTimesheetYearStatistics([
    entry(2026, 8, register, 'nomina-1'),
    entry(2026, 8, register, 'nomina-2'),
    entry(2026, 9, { night: '3', holiday: '0', meals: '1' }, 'nomina-1')
  ], 2026);
  assert.deepEqual(statistics.availableMonths, [8, 9]);
  assert.equal(statistics.registerCount, 2);
  assert.equal(statistics.duplicateCopies, 1);
  assert.equal(statistics.metrics.night.value, 20);
  assert.equal(statistics.metrics.holiday.value, 8);
  assert.equal(statistics.metrics.meals.value, 1);
  assert.equal(statistics.months[7].sourceCount, 2);
  assert.equal(statistics.months[7].registerCount, 1);
});

test('cero confirmado se conserva y un concepto ausente permanece Sin datos', () => {
  const statistics = buildTimesheetYearStatistics([
    entry(2025, 11, { meals: '0', vacation: '0' })
  ], 2025);
  assert.equal(statistics.months[10].metrics.meals.value, 0);
  assert.equal(statistics.months[10].metrics.meals.complete, true);
  assert.equal(statistics.months[10].metrics.night.value, null);
  assert.equal(statistics.metrics.night.value, null);
  assert.equal(statistics.missingMonths.length, 11);
});

test('datos contradictorios del mismo mes no se suman ni se eligen arbitrariamente', () => {
  const statistics = buildTimesheetYearStatistics([
    entry(2026, 8, { night: '17' }, 'nomina-1'),
    entry(2026, 8, { night: '18' }, 'nomina-2')
  ], 2026);
  assert.equal(statistics.months[7].metrics.night.value, null);
  assert.equal(statistics.months[7].metrics.night.conflict, true);
  assert.deepEqual(statistics.conflictMonths, [8]);
  assert.equal(statistics.metrics.night.value, null);
});

test('horas, diferencia derivada y otros conceptos mantienen sus unidades mensuales', () => {
  const august = entry(2022, 8, {
    horasTeoricas: '160,48',
    horasTrabajadas: '158,25',
    absences: '7,5',
    permisoEspecial: '2'
  });
  assert.equal(august.values.theoreticalHours, 160.48);
  assert.equal(august.values.workedHours, 158.25);
  assert.equal(august.values.differenceHours, -2.23);
  assert.equal(august.values.absences, 7.5);
  assert.deepEqual(august.others, [{ key: 'permisoEspecial', label: 'Permiso Especial', value: 2 }]);
});

test('los años disponibles proceden de registros confirmados y se ordenan de reciente a antiguo', () => {
  assert.deepEqual(availableTimesheetYears([
    entry(2022, 1, { meals: 1 }),
    entry(2026, 1, { meals: 1 }),
    entry(2025, 1, { meals: 1 })
  ]), [2026, 2025, 2022]);
});

test('validación anual combina meses con una y dos nóminas, ceros, ausencias y meses vacíos', () => {
  const august = { night: '10', holiday: '8', vacation: '2', absences: '7,5', rotation: '12', meals: '1' };
  const statistics = buildTimesheetYearStatistics([
    entry(2026, 1, { night: '2', holiday: '0', vacation: '0', absences: '0', rotation: '3', meals: '0' }),
    entry(2026, 8, august, 'agosto-nomina-1'),
    entry(2026, 8, august, 'agosto-nomina-2'),
    entry(2026, 12, { night: '5', holiday: '4', vacation: '1', absences: '0', rotation: '7', meals: '2' })
  ], 2026);
  assert.deepEqual(statistics.availableMonths, [1, 8, 12]);
  assert.equal(statistics.missingMonths.length, 9);
  assert.equal(statistics.registerCount, 3);
  assert.equal(statistics.duplicateCopies, 1);
  assert.equal(statistics.metrics.night.value, 17);
  assert.equal(statistics.metrics.holiday.value, 12);
  assert.equal(statistics.metrics.vacation.value, 3);
  assert.equal(statistics.metrics.absences.value, 7.5);
  assert.equal(statistics.metrics.rotation.value, 22);
  assert.equal(statistics.metrics.meals.value, 3);
});
