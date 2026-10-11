const form = document.getElementById('form');
const field = id => document.getElementById(id);
function updateFields() {
  const voter = field('role').value === 'voter';
  const substitute = field('role').value === 'substitute';
  field('voter-fields').hidden = !voter;
  field('substitute-fields').hidden = !substitute;
  field('overlap').required = voter && field('work').value === 'yes' && field('postal').value === 'no';
  field('serves').required = substitute;
  field('result').hidden = true;
}
form.addEventListener('change', updateFields);
form.addEventListener('input', () => { field('result').hidden = true; });
form.addEventListener('reset', () => setTimeout(updateFields, 0));
form.addEventListener('submit', event => {
  event.preventDefault();
  const role = field('role').value;
  const work = field('work').value === 'yes';
  let title, copy, extra;
  if (role === 'voter') {
    const hours = Number(field('overlap').value);
    const permission = !work || hours <= 2 ? 0 : hours < 4 ? 2 : 4;
    title = permission ? `${permission} horas de permiso para votar` : 'Sin permiso por coincidencia horaria';
    copy = permission ? 'Según la tabla de la ficha, el permiso es retribuido y no recuperable. La empresa organiza su disfrute dentro del horario de votación.' : 'Según la tabla de la ficha, no corresponde este permiso si no trabajas o tu jornada coincide 2 horas o menos con la votación.';
    if (field('postal').value === 'yes') {
      title = 'Voto por correo: revisa tu caso';
      copy = 'La tabla de coincidencia horaria corresponde al voto presencial. Consulta con STR-IG si te corresponde un permiso para tramitar el voto por correo.';
    }
    extra = 'Avisa a la empresa y solicita a la mesa un justificante de haber votado. El reparto de horas de esta ficha está pendiente de contraste con la norma catalana de la convocatoria.';
    if (field('part').value === 'yes') extra += ' A tiempo parcial, revisa la reducción proporcional antes de solicitar el número de horas indicado.';
  } else if (role === 'substitute' && field('serves').value !== 'yes') {
    const unknown = field('serves').value === 'unknown';
    title = unknown ? 'El permiso depende de si finalmente actúas' : 'Suplente que no actúa como titular';
    copy = 'Debes presentarte a la constitución de la mesa. El nombramiento por sí solo no da derecho a la jornada completa ni a las 5 horas del día siguiente.';
    extra = 'Solicita un justificante de asistencia y consulta con la empresa o STR-IG cómo justificar el tiempo necesario para presentarte. Si finalmente actúas como titular, tienes los mismos permisos que la presidencia y las vocalías.';
  } else if (role === 'proxy') {
    title = work ? 'Jornada completa el día de votación' : 'Día de votación en descanso';
    copy = work ? 'Como apoderada o apoderado acreditado, tienes permiso retribuido el día de votación.' : 'Si no te corresponde trabajar, no necesitas permiso para ausentarte ese día.';
    extra = 'Este supuesto no incluye las 5 horas del día siguiente. Avisa a la empresa y acredita tu actuación.';
  } else {
    title = work ? 'Jornada completa + 5 primeras horas del día siguiente' : '5 primeras horas del día siguiente';
    copy = work ? 'El permiso cubre la jornada de trabajo del día de votación y las 5 primeras horas de tu jornada laboral del día inmediatamente posterior.' : 'Aunque el día de votación sea tu descanso, conservas la reducción de las 5 primeras horas de tu jornada laboral del día inmediatamente posterior.';
    extra = 'Avisa a la empresa en cuanto recibas el nombramiento y entrega un justificante de tu actuación efectiva.';
  }
  if (field('shift').value === 'yes') extra += ' Si trabajas de noche, comunica tu turno a la empresa para organizar el permiso electoral y respetar el descanso entre jornadas; consulta con STR-IG su encaje concreto.';
  field('result-title').textContent = title;
  field('result-copy').textContent = copy;
  field('result-extra').textContent = extra;
  field('sheet-link').href = role === 'voter' ? 'voy-a-votar.html' : 'mesa-electoral.html';
  field('result').hidden = false;
  field('result').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
});
