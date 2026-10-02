import test from 'node:test';
import assert from 'node:assert/strict';
import { validDutyFacts, dutyFacts, electoralGuidance } from '../public-duty.js';

const common = {
  obligation: 'Mesa electoral / elecciones',
  overlap: 'Sí',
  outside: 'No, el horario viene impuesto',
  date: '2026-10-02',
  time: '08:00',
  workSchedule: 'Noche 12 h — 18:00 a 06:11 del día siguiente',
  proof: 'Sí, citación/documento oficial',
  electoralRole: 'Presidente/a titular',
  substituteOutcome: '',
  electoralDayStatus: 'Sí, es día laborable',
  details: ''
};
function guidance(overrides = {}) {
  const facts = { ...common, ...overrides };
  assert.equal(validDutyFacts(facts), true);
  return electoralGuidance(dutyFacts(facts));
}

test('A: titular con turno nocturno 18:00–06:11 y presentación 08:00', () => {
  const result = guidance();
  assert.match(result.case, /08:00/);
  assert.match(result.case, /18:00 a 06:11/);
  assert.match(result.time, /descanso debería comenzar a las 20:00 del día anterior/);
  assert.match(result.time, /permiso retribuido de jornada completa/);
  assert.match(result.time, /reducción de cinco horas/);
  assert.match(result.time, /no una regla electoral literal de la LOREG/);
});
test('B: titular sin turno anterior', () => {
  const result = guidance({ workSchedule: 'No tenía turno el día anterior' });
  assert.match(result.time, /No has indicado un turno previo/);
  assert.match(result.time, /reducción de cinco horas/);
});
test('C: mesa electoral en día laborable', () => {
  const result = guidance({ electoralDayStatus: 'Sí, es día laborable', electoralRole: 'Vocal titular' });
  assert.match(result.case, /jornada laboral/);
  assert.match(result.time, /permiso retribuido de jornada completa/);
});
test('D: mesa electoral en día de descanso conserva la reducción de cinco horas', () => {
  const result = guidance({ electoralDayStatus: 'No, es día de descanso' });
  assert.match(result.time, /no corresponde permiso de jornada completa/);
  assert.match(result.time, /en todo caso, corresponde una reducción de cinco horas/);
});
test('E: suplente que no ocupa el cargo no recibe automáticamente las medidas del miembro que lo desempeña', () => {
  const result = guidance({ electoralRole: 'Suplente', substituteOutcome: 'No ocupé finalmente el cargo' });
  assert.match(result.eligibility, /no se aplican automáticamente/);
  assert.doesNotMatch(result.time, /reducción de cinco horas/);
});
test('F: suplente que sustituye y desempeña el cargo recibe el tratamiento electoral del cargo', () => {
  const result = guidance({ electoralRole: 'Suplente', substituteOutcome: 'Sí, sustituí al titular y desempeñé el cargo' });
  assert.match(result.eligibility, /desempeñado el cargo/);
  assert.match(result.time, /jornada completa/);
  assert.match(result.time, /reducción de cinco horas/);
});
test('G: persona que solo vota queda fuera de la rama de miembro de mesa', () => {
  const facts = { ...common, electoralRole: 'Solo voy a votar' };
  assert.equal(validDutyFacts(facts), true);
  assert.equal(electoralGuidance(dutyFacts(facts)), null);
});
