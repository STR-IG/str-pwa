// Shared public questionnaire contract for the browser and the Edge Functions.
export const dutyChoices = {
  obligation: ['Citación judicial u oficial', 'Mesa electoral / elecciones', 'Trámite obligatorio ante una Administración', 'Comparecencia ante organismo público', 'Otra obligación pública', 'Otro caso'],
  overlap: ['Sí', 'Parcialmente', 'No', 'No lo sé'],
  outside: ['No, el horario viene impuesto', 'No hay otra cita/horario disponible', 'Sí', 'No lo sé'],
  proof: ['Sí, citación/documento oficial', 'Sí, justificante de asistencia', 'Todavía no', 'No']
};

export const electoralRoles = ['Presidente/a titular', 'Vocal titular', 'Suplente', 'Solo voy a votar'];
export const substituteOutcomes = ['No ocupé finalmente el cargo', 'Sí, sustituí al titular y desempeñé el cargo'];
export const electoralDayStatuses = ['Sí, es día laborable', 'No, es día de descanso'];

export function validDutyFacts(b) {
  if (!b || typeof b !== 'object') return false;
  for (const [field, choices] of Object.entries(dutyChoices)) if (!choices.includes(b[field])) return false;
  if (typeof b.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(b.date)) return false;
  const d = new Date(b.date + 'T12:00:00Z');
  if (!Number.isFinite(d.getTime()) || d.toISOString().slice(0, 10) !== b.date) return false;
  if (typeof b.time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(b.time)) return false;
  if (b.obligation === 'Mesa electoral / elecciones') {
    if (!electoralRoles.includes(b.electoralRole) || !electoralDayStatuses.includes(b.electoralDayStatus)) return false;
    if (b.electoralRole === 'Suplente' && !substituteOutcomes.includes(b.substituteOutcome)) return false;
  } else if ((b.electoralRole && b.electoralRole !== '') || (b.substituteOutcome && b.substituteOutcome !== '') || (b.electoralDayStatus && b.electoralDayStatus !== '')) return false;
  return typeof b.workSchedule === 'string' && b.workSchedule.trim().length > 0 && b.workSchedule.length <= 300 &&
    typeof b.details === 'string' && b.details.length <= 1500;
}

export function dutyFacts(b) {
  return Object.fromEntries(['obligation', 'overlap', 'outside', 'date', 'time', 'workSchedule', 'proof', 'electoralRole', 'substituteOutcome', 'electoralDayStatus', 'details'].map(k => [k, (b[k] || '').trim()]));
}


export function electoralGuidance(b) {
  if (b.obligation !== 'Mesa electoral / elecciones' || b.electoralRole === 'Solo voy a votar') return null;
  const alternate = b.electoralRole === 'Suplente';
  const served = !alternate || b.substituteOutcome === substituteOutcomes[1];
  if (!served) return {
    case: 'Designación como suplente; presentación: ' + b.time + '; turno anterior: ' + b.workSchedule + '; finalmente no ocupaste el cargo.',
    eligibility: 'Al no haber sustituido al titular ni desempeñado la presidencia o vocalía, no se aplican automáticamente los derechos de jornada completa y reducción de cinco horas previstos para quien desempeña el cargo. La asistencia a la constitución y el tiempo necesario para atender esa citación deben analizarse según las circunstancias y acreditarse.',
    time: 'La regla electoral de cinco horas corresponde a quien desempeña el cargo; no se puede dar por reconocida automáticamente a una suplencia que no llegó a ocuparlo. Conserva la designación y cualquier justificante de comparecencia.',
    documents: 'Presenta la designación oficial y, si acudiste a la constitución, la acreditación de asistencia y de que finalmente no sustituiste al titular.',
    next: 'Comunica a la empresa la designación y el resultado de la suplencia. Si te ausentaste para presentarte a la constitución, conserva la citación y la acreditación del tiempo empleado para que se valore ese tramo.'
  };
  const range = b.workSchedule.match(/(\d{2}:\d{2})\s+a\s+(\d{2}:\d{2})/);
  let prior = 'No has indicado un turno previo que permita calcular el intervalo.';
  if (range) {
    const end = range[2].split(':').map(Number), start = b.time.split(':').map(Number);
    const gap = ((start[0] * 60 + start[1]) - (end[0] * 60 + end[1]) + 1440) % 1440;
    if (gap < 720) {
      const cut = (start[0] * 60 + start[1] - 720 + 1440) % 1440;
      prior = 'Existe una afectación del descanso previo. Para disponer de 12 horas hasta las ' + b.time + ', el descanso debería comenzar a las ' + String(Math.floor(cut / 60)).padStart(2, '0') + ':' + String(cut % 60).padStart(2, '0') + ' del día anterior. Este es un análisis del descanso entre actividades, no una regla electoral literal de la LOREG.';
    } else prior = 'Según el turno seleccionado (' + b.workSchedule + ') y la presentación a las ' + b.time + ', el horario indicado deja al menos 12 horas entre ambos. El análisis del descanso es separado de los derechos electorales.';
  }
  const workday = b.electoralDayStatus === 'Sí, es día laborable';
  const restday = b.electoralDayStatus === 'No, es día de descanso';
  const day = workday ? 'Al ser día laborable para ti, corresponde permiso retribuido de jornada completa.' : restday ? 'Al ser día de descanso, no corresponde permiso de jornada completa por ese día.' : 'Si resulta laborable para ti, corresponde permiso retribuido de jornada completa.';
  return {
    case: 'Has indicado que eres ' + b.electoralRole + ' de una mesa electoral el ' + b.date + ' y debes presentarte a las ' + b.time + '. Turno del día anterior: ' + b.workSchedule + '. ' + (workday ? 'La votación coincide con tu jornada laboral.' : restday ? 'Indicas que la votación coincide con un día de descanso.' : 'No queda confirmado si coincide con tu jornada laboral.'),
    eligibility: alternate ? 'Como suplente, al haber sustituido al titular y desempeñado el cargo, se aplican los derechos electorales correspondientes a quien ejerce la Presidencia o Vocalía. No se aplica la regla genérica de “solo el tiempo indispensable” al permiso electoral de jornada completa.' : 'Para Presidencia o Vocalía titular, los arts. 28.1 LOREG y 13.3 del Real Decreto 605/1999 prevalecen sobre la regla genérica del deber inexcusable. No se aplica aquí el criterio de “solo el tiempo indispensable” al permiso electoral de jornada completa.',
    time: prior + '\n\nDía de la votación: ' + day + ' Día inmediatamente posterior: en todo caso, corresponde una reducción de cinco horas de tu jornada de trabajo, aunque la votación haya coincidido con tu día de descanso.',
    documents: 'Presenta la designación o citación oficial como miembro de la mesa y, cuando corresponda, la acreditación de haber desempeñado el cargo.',
    next: 'Comunica la designación a la empresa por el canal habitual y conserva la citación y la acreditación de asistencia. La jornada completa del día de la votación y la reducción de cinco horas del día siguiente son derechos electorales; el cálculo del descanso previo es un análisis separado.'
  };
}

export const dutySections = { case: 'Tu caso', eligibility: '¿Puede corresponderte?', time: 'Tiempo', documents: 'Qué debes presentar', next: 'Qué hacer ahora' };
export function validDutyGuidance(g) {
  return g && Object.keys(dutySections).every(k => typeof g[k] === 'string' && g[k].trim().length > 0 && g[k].length <= 4000);
}
