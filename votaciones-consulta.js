const form = document.getElementById('form');
const field = id => document.getElementById(id);
function updateFields() {
  const voter = field('role').value === 'voter';
  const substitute = field('role').value === 'substitute';
  field('voter-fields').hidden = !voter;
  field('substitute-fields').hidden = !substitute;
  field('night-fields').hidden = voter || !field('role').value;
  field('shift').required = !voter && !!field('role').value;
  field('shift').disabled = voter || !field('role').value;
  field('overlap').required = voter && field('work').value === 'yes';
  field('overlap').disabled = !field('overlap').required;
  field('serves').required = substitute;
  field('result').hidden = true;
}
form.addEventListener('change', updateFields);
form.addEventListener('input', () => { field('result').hidden = true; });
form.addEventListener('reset', () => setTimeout(updateFields, 0));
updateFields();
form.addEventListener('submit', event => {
  event.preventDefault();
  const role = field('role').value;
  const work = field('work').value === 'yes';
  let title, copy, extra;
  if (role === 'voter') {
    const hours = Number(field('overlap').value);
    const permission = !work || hours <= 2 ? 0 : hours < 4 ? 2 : 4;
    title = permission ? `${permission} horas de permiso para votar` : 'No te corresponde permiso laboral para ir a votar';
    copy = !work ? 'El día de votación tienes descanso, por lo que no necesitas permiso para ausentarte del trabajo.' : permission ? `Tu jornada coincide ${hours} horas con la votación. El permiso es retribuido y no recuperable; la empresa determina cuándo disfrutarlo dentro del horario de votación.` : hours === 0 ? 'Tu jornada no coincide con el horario de votación. Puedes ejercer tu derecho al voto fuera de tu horario de trabajo.' : `Tu jornada coincide ${hours} horas con la votación. Según la referencia catalana de 2023, una coincidencia de dos horas o menos no genera este permiso. Puedes votar fuera de tu horario de trabajo.`;
    extra = permission ? 'Avisa a la empresa con antelación y solicita a la mesa un justificante de haber votado.' : 'No tener permiso laboral no limita tu derecho a votar.';
    if (permission && field('part').value === 'yes') {
      title = 'Permiso para votar: ajustar a tu jornada';
      extra += ' La duración debe reducirse proporcionalmente si tu jornada es inferior a la habitual; las horas de la tabla son la referencia antes de ese ajuste. Consulta con STR-IG la duración concreta.';
    }
  } else if (role === 'substitute' && field('serves').value !== 'yes') {
    const unknown = field('serves').value === 'unknown';
    title = unknown ? 'El permiso depende de si finalmente actúas' : 'Suplente que no actúa como titular';
    copy = 'Debes presentarte en el colegio electoral a las 08:00 para la constitución de la mesa. El nombramiento por sí solo no da derecho a la jornada completa ni a las 5 horas del día siguiente.';
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
  if (role !== 'voter' && field('shift').value === 'yes') {
    extra += role === 'substitute' && field('serves').value !== 'yes'
      ? ' Si tienes turno la noche anterior, consulta con STR-IG cómo gestionar tu asistencia como suplente; no se presupone que vayas a actuar como titular.'
      : ' Según la referencia catalana de 2023, puedes solicitar a la empresa el cambio del turno de la noche inmediatamente anterior para poder descansar antes de la jornada electoral.';
  }
  if (role === 'member' || role === 'substitute') {
    extra += ' Como miembro de mesa o suplente, debes presentarte a las 08:00. Si trabajas de noche, ponte en contacto con la empresa con antelación para revisar tus horarios y organizar el descanso de 12 horas entre jornadas. Esta consulta no calcula automáticamente ese descanso ni una hora de reincorporación.';
  }
  field('result-title').textContent = title;
  field('result-copy').textContent = copy;
  field('result-extra').textContent = extra;
  field('sheet-link').href = role === 'voter' ? 'voy-a-votar.html' : 'mesa-electoral.html';
  field('result').hidden = false;
  field('result').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
});
