import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TIMESHEET_METRICS,
  normalizeTimesheetReview,
  buildTimesheetYearStatistics
} from '../payroll-timesheet-statistics.mjs';

const values = Object.fromEntries(TIMESHEET_METRICS.map(({ key }) => [key, '0']));
values.meals = '8';
values.night = '12,5';

test('normalizes saved complete review timesheet values and uses the folder period as fallback', () => {
  const review = normalizeTimesheetReview({ status: 'complete', timesheet: values }, { year: 2026, month: 9 });
  assert.equal(review.year, 2026);
  assert.equal(review.month, 9);
  assert.equal(review.values.meals, 8);
  assert.equal(review.values.night, 12.5);
});

test('ignores pending and empty reviews', () => {
  assert.equal(normalizeTimesheetReview({ status: 'pending', timesheet: values }, { year: 2026, month: 9 }), null);
  assert.equal(normalizeTimesheetReview({ status: 'complete', timesheet: {} }, { year: 2026, month: 9 }), null);
});

test('counts duplicate copies of a month once and excludes conflicting copies', () => {
  const a = { year: 2026, month: 1, values: { ...Object.fromEntries(TIMESHEET_METRICS.map(({ key }) => [key, 0])), meals: 5 } };
  const duplicate = { ...a, values: { ...a.values } };
  const conflicting = { ...a, month: 2, values: { ...a.values, meals: 7 } };
  const conflictCopy = { ...conflicting, values: { ...conflicting.values, meals: 9 } };
  const statistics = buildTimesheetYearStatistics([a, duplicate, conflicting, conflictCopy], 2026);
  assert.equal(statistics.metrics.meals.total, 5);
  assert.equal(statistics.monthCount, 1);
  assert.deepEqual(statistics.conflictMonths, [2]);
  assert.equal(statistics.months[1].values, null);
});

test('treats absent saved concepts as confirmed zero and keeps months distinct', () => {
  const blank = { year: 2026, month: 3, values: Object.fromEntries(TIMESHEET_METRICS.map(({ key }) => [key, 0])) };
  const statistics = buildTimesheetYearStatistics([blank], 2026);
  assert.equal(statistics.metrics.meals.total, 0);
  assert.equal(statistics.metrics.meals.months, 1);
  assert.equal(statistics.months[2].hasData, true);
});
