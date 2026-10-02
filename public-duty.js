// Shared public questionnaire contract for the browser and the Edge Functions.
export const dutyChoices = {
  obligation: ['Citación judicial u oficial', 'Mesa electoral / elecciones', 'Trámite obligatorio ante una Administración', 'Comparecencia ante organismo público', 'Otra obligación pública', 'Otro caso'],
  overlap: ['Sí', 'Parcialmente', 'No', 'No lo sé'],
  outside: ['No, el horario viene impuesto', 'No hay otra cita/horario disponible', 'Sí', 'No lo sé'],
  proof: ['Sí, citación/documento oficial', 'Sí, justificante de asistencia', 'Todavía no', 'No']
};
export const electoralRoles = ['Presidente/a de mesa electoral', 'Vocal de mesa electoral', 'Interventor/a', 'Apoderado/a', 'Otra función electoral', 'Solo voy a votar'];
export const shiftChoices = ['Trabajo ese turno', 'No trabajo / descanso', 'No lo sé'];
const timeOk = value => typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
function shiftOk(facts, prefix, schedule) {
  const type = facts[schedule];
  if (!['Trabajo ese turno', 'No trabajo / descanso', 'No lo sé'].includes(type)) return false;
  if (type !== 'Trabajo ese turno') return true;
  return timeOk(facts[`${prefix}Start`]) && timeOk(facts[`${prefix}End`]);
}
export function validDutySchedule(b) {
  if (!b || typeof b !== 'object') return false;
  if (typeof b.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(b.date)) return false;
  const d = new Date(b.date + 'T12:00:00Z');
  if (!Number.isFinite(d.getTime()) || d.toISOString().slice(0, 10) !== b.date || !timeOk(b.time)) return false;
  if (b.endTime && !timeOk(b.endTime)) return false;
  if (typeof b.workSchedule !== 'string' || !b.workSchedule.trim()) return false;
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
  const keys = ['obligation', 'overlap', 'outside', 'date', 'time', 'endTime', 'workSchedule', 'proof', 'details', 'electoralRole', 'otherRole', 'previousShift', 'previousStart', 'previousEnd', 'followingShift', 'followingStart', 'followingEnd', 'electionShift', 'electionStart', 'electionEnd', 'nextDayShift', 'nextDayStart', 'nextDayEnd'];
  return Object.fromEntries(keys.map(k => [k, typeof b[k] === 'string' ? b[k].trim() : '']));
}
export const dutySections = { case: 'Tu caso', eligibility: '¿Puede corresponderte?', time: 'Tiempo', documents: 'Qué debes presentar', next: 'Qué hacer ahora' };
export function validDutyGuidance(g) {
  return g && Object.keys(dutySections).every(k => typeof g[k] === 'string' && g[k].trim().length > 0 && g[k].length <= 4000);
}
