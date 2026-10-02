// Shared public questionnaire contract for the browser and the Edge Functions.
export const dutyChoices = {
  obligation: ['Citación judicial u oficial', 'Mesa electoral / elecciones', 'Trámite obligatorio ante una Administración', 'Comparecencia ante organismo público', 'Otra obligación pública', 'Otro caso'],
  overlap: ['Sí', 'Parcialmente', 'No', 'No lo sé'],
  outside: ['No, el horario viene impuesto', 'No hay otra cita/horario disponible', 'Sí', 'No lo sé'],
  proof: ['Sí, citación/documento oficial', 'Sí, justificante de asistencia', 'Todavía no', 'No']
};

export function validDutyFacts(b) {
  if (!b || typeof b !== 'object') return false;
  for (const [field, choices] of Object.entries(dutyChoices)) if (!choices.includes(b[field])) return false;
  if (typeof b.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(b.date)) return false;
  const d = new Date(b.date + 'T12:00:00Z');
  if (!Number.isFinite(d.getTime()) || d.toISOString().slice(0, 10) !== b.date) return false;
  if (typeof b.time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(b.time)) return false;
  return typeof b.workSchedule === 'string' && b.workSchedule.trim().length > 0 && b.workSchedule.length <= 300 &&
    typeof b.details === 'string' && b.details.length <= 1500;
}

export function dutyFacts(b) {
  return Object.fromEntries(['obligation', 'overlap', 'outside', 'date', 'time', 'workSchedule', 'proof', 'details'].map(k => [k, b[k].trim()]));
}

export const dutySections = { case: 'Tu caso', eligibility: '¿Puede corresponderte?', time: 'Tiempo', documents: 'Qué debes presentar', next: 'Qué hacer ahora' };
export function validDutyGuidance(g) {
  return g && Object.keys(dutySections).every(k => typeof g[k] === 'string' && g[k].trim().length > 0 && g[k].length <= 4000);
}
