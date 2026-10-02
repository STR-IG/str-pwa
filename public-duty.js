// Shared public questionnaire contract for the browser and the Edge Functions.
export const dutyChoices = {
  obligation: ['Citación judicial u oficial', 'Mesa electoral / elecciones', 'Trámite obligatorio ante una Administración', 'Comparecencia ante organismo público', 'Otra obligación pública', 'Otro caso'],
  overlap: ['Sí', 'Parcialmente', 'No', 'No lo sé'],
  outside: ['No, el horario viene impuesto', 'No hay otra cita/horario disponible', 'Sí', 'No lo sé'],
  proof: ['Sí, citación/documento oficial', 'Sí, justificante de asistencia', 'Todavía no', 'No']
};
export const electoralRoles = ['Presidente/a de mesa electoral', 'Vocal de mesa electoral', 'Interventor/a', 'Apoderado/a', 'Otra función electoral', 'Solo voy a votar'];
export const shiftSchedules = {
  morning: { label: 'Turno de mañana (06:00–14:13)', start: '06:00', end: '14:13' },
  afternoon: { label: 'Turno de tarde (14:00–22:13)', start: '14:00', end: '22:13' },
  night: { label: 'Turno de noche (22:00–06:03)', start: '22:00', end: '06:03' },
  long_day: { label: 'Turno largo de día (06:00–18:11)', start: '06:00', end: '18:11' },
  long_night: { label: 'Turno largo de noche (18:00–06:11)', start: '18:00', end: '06:11' },
  night_18_06: { label: 'Turno de noche (18:00–06:00)', start: '18:00', end: '06:00' }
};
export const shiftLabels = {
  ...Object.fromEntries(Object.entries(shiftSchedules).map(([key, value]) => [key, value.label])),
  other: 'Otro horario (indicar las horas)',
  rest: 'No trabajo / día de descanso',
  unknown: 'No lo sé'
};
export const shiftChoices = Object.keys(shiftLabels);
const timeOk = value => typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
function shiftOk(facts, prefix, schedule) {
  const type = facts[schedule];
  if (!shiftChoices.includes(type)) return false;
  if (shiftSchedules[type] || type === 'rest' || type === 'unknown') return true;
  return type === 'other' && timeOk(facts[`${prefix}Start`]) && timeOk(facts[`${prefix}End`]);
}
function shiftDescription(facts, prefix, label) {
  const type = facts[`${prefix}Shift`];
  const preset = shiftSchedules[type];
  if (preset) return `${label}: ${preset.label}`;
  if (type === 'other') return `${label}: otro horario ${facts[`${prefix}Start`]}–${facts[`${prefix}End`]}`;
  return `${label}: ${shiftLabels[type] || 'sin indicar'}`;
}
export function validDutySchedule(b) {
  if (!b || typeof b !== 'object') return false;
  if (typeof b.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(b.date)) return false;
  const d = new Date(b.date + 'T12:00:00Z');
  if (!Number.isFinite(d.getTime()) || d.toISOString().slice(0, 10) !== b.date || !timeOk(b.time)) return false;
  if (b.endTime && !timeOk(b.endTime)) return false;
  if (b.obligation === 'Mesa electoral / elecciones') {
    if (!electoralRoles.includes(b.electoralRole)) return false;
    if (b.electoralRole === 'Otra función electoral' && !(typeof b.otherRole === 'string' && b.otherRole.trim())) return false;
    return shiftOk(b, 'election', 'electionShift') && shiftOk(b, 'nextDay', 'nextDayShift');
  }
  if (b.electoralRole) return false;
  return shiftOk(b, 'previous', 'previousShift') && shiftOk(b, 'following', 'followingShift');
}
export function validDutyFacts(b) {
  if (!b || typeof b !== 'object') return false;
  for (const [field, choices] of Object.entries(dutyChoices)) if (!choices.includes(b[field])) return false;
  return typeof b.details === 'string' && b.details.length <= 1500 && validDutySchedule(b);
}
export function dutyFacts(b) {
  const keys = ['obligation', 'overlap', 'outside', 'date', 'time', 'endTime', 'proof', 'details', 'electoralRole', 'otherRole', 'previousShift', 'previousStart', 'previousEnd', 'followingShift', 'followingStart', 'followingEnd', 'electionShift', 'electionStart', 'electionEnd', 'nextDayShift', 'nextDayStart', 'nextDayEnd'];
  const facts = Object.fromEntries(keys.map(k => [k, typeof b[k] === 'string' ? b[k].trim() : '']));
  const prefixes = facts.obligation === 'Mesa electoral / elecciones' ? ['election', 'nextDay'] : ['previous', 'following'];
  for (const prefix of prefixes) {
    const preset = shiftSchedules[facts[`${prefix}Shift`]];
    if (preset) {
      facts[`${prefix}Start`] = preset.start;
      facts[`${prefix}End`] = preset.end;
    }
  }
  const details = facts.obligation === 'Mesa electoral / elecciones'
    ? `Función electoral: ${facts.electoralRole || 'sin indicar'}${facts.otherRole ? ` (${facts.otherRole})` : ''}; ${shiftDescription(facts, 'election', 'Turno anterior/coincidente con votación')}; ${shiftDescription(facts, 'nextDay', 'Jornada del día natural posterior')}`
    : `${shiftDescription(facts, 'previous', 'Turno anterior al deber')}; ${shiftDescription(facts, 'following', 'Turno posterior al deber')}`;
  facts.workSchedule = `${details}${facts.endTime ? `; fin aproximado del deber: ${facts.endTime}` : ''}`;
  return facts;
}
export const dutySections = { case: 'Tu caso', eligibility: '¿Puede corresponderte?', time: 'Tiempo', documents: 'Qué debes presentar', next: 'Qué hacer ahora' };
export function validDutyGuidance(g) {
  return g && Object.keys(dutySections).every(k => typeof g[k] === 'string' && g[k].trim().length > 0 && g[k].length <= 4000);
}
