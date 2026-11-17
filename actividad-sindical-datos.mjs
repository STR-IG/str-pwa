// Fuente única de contenido. Fechas ISO (AAAA-MM-DD), o '' si no se conocen.
// Los resúmenes usan tipo 'resumen' para compartir esta fuente con el listado mensual.
// relacionado contiene el id de otra entrada. Los enlaces de fichas existentes se conservan.
export const CONTENIDOS = [
  {
    id: 'resumen-octubre-2026', tipo: 'resumen',
    titulo: 'Octubre 2026 · En un minuto', fecha: '2026-10-31',
    estado: '', categoria: '',
    resumen: 'Resumen visual de octubre: comedor, pluses de Navidad, movilidad sostenible, emergencias climáticas y nuevas encuestas en la app.',
    enlace: 'octubre-en-un-minuto.html', relacionado: ''
  },
  {
    id: 'resumen-septiembre-2026', tipo: 'resumen',
    titulo: 'Septiembre 2026 · En un minuto', fecha: '2026-09-30',
    estado: '', categoria: '',
    resumen: 'Resumen de septiembre: datos de afiliación sindical, encuestas tras una baja médica, coeficientes reductores de jubilación, movilidad sostenible y presentación de la app STR.',
    enlace: 'septiembre-en-un-minuto.html', relacionado: ''
  },
  {
    id: 'sharepoint', tipo: 'tema',
    titulo: 'Filtración de datos en SharePoint: qué ocurrió y dónde estamos',
    fecha: '2026-11-01', estado: 'abierto', categoria: '',
    resumen: '',
    enlace: 'cronologia-sharepoint.html', relacionado: '',
    aviso: { categoria: 'documentation-info', id: 'documentation-explanation-2026-09-30' }
  },
  {
    id: 'precio-recarga', tipo: 'proyecto',
    titulo: 'Bajar el precio del kWh en los puntos de recarga',
    fecha: '', estado: 'en curso', categoria: 'Movilidad sostenible',
    resumen: 'Proponemos reducir el precio por kWh de los puntos de recarga.',
    enlace: 'actividad-informacion-sindical.html?ficha=precio-recarga',
    relacionado: 'puntos-recarga', precioActualKwh: '',
    ficha: {
      objetivo: 'Proponemos que la empresa reduzca el precio por kWh de los puntos de recarga, que consideramos muy alto.',
      actuaciones: '', proximoPaso: '', cuando: ''
    }
  },
  {
    id: 'reunion-comedor-2026-09', tipo: 'reunión',
    titulo: 'Resumen reunión comedor', fecha: '2026-09-07', estado: '', categoria: '',
    resumen: 'Nos reunimos con la empresa y Sodexo para conocer la propuesta de mejora del servicio, la encuesta que se realizará a la plantilla y trasladar nuestras aportaciones.',
    enlace: 'comunicado-comedor.html', relacionado: ''
  },
  {
    id: 'prima-covid', tipo: 'logro', titulo: 'Prima COVID', fecha: '',
    estado: 'conseguido', categoria: 'Condiciones laborales y reconocimiento económico',
    resumen: '', enlace: 'actividad-informacion-sindical.html?ficha=prima-covid', relacionado: '',
    ficha: {
      objetivo: 'La empresa aprobó el pago de una prima a las personas que siguieron trabajando durante la pandemia.',
      actuaciones: 'Durante la pandemia propusimos a la empresa que se reconociera con una prima a quienes acudían a trabajar. Defendimos que ese esfuerzo debía compensarse. No hubo unanimidad entre las secciones sindicales, ya que otras planteaban que la prima debía cobrarla toda la plantilla. La empresa aceptó nuestra propuesta y se abonó la prima.',
      cuando: ''
    }
  },
  {
    id: 'pluses-especiales', tipo: 'logro', titulo: 'Pluses de días especiales de Navidad', fecha: '2025-07',
    estado: 'conseguido', categoria: 'Condiciones laborales y reconocimiento económico',
    resumen: 'Las plantillas de los departamentos de servicio a producción quedan incluidas en los días especiales de Navidad.',
    enlace: 'actividad-informacion-sindical.html?ficha=pluses-especiales', relacionado: 'resumen-octubre-2026',
    textoRelacionado: 'En la última reunión trimestral con la Dirección de la empresa, STR preguntó si este año se abonarían los pluses de días especiales de Navidad acordados en el pacto de julio de 2025. La Dirección confirmó que sí se pagarán conforme a lo pactado.',
    ficha: {
      objetivo: 'En julio de 2025 la empresa incorporó la fórmula de días especiales de Navidad que proponía STR. Con ella, los departamentos que dan servicio a producción (Mantenimiento, Calibraciones, Aguas, SAF, CAP y CI) quedan incluidos en el reconocimiento de esos días.',
      actuaciones: 'El pacto de 19 de septiembre de 2016 sobre modificación del esquema de vacaciones dejó fuera a esos departamentos. Desde entonces, STR llevó esta reivindicación a todas las reuniones con la empresa y al comité, año tras año, hasta que la empresa aceptó nuestra fórmula.',
      cuando: 'Julio de 2025'
    }
  },
  {
    id: 'puntos-recarga', tipo: 'logro', titulo: 'Puntos de recarga para coches eléctricos', fecha: '',
    estado: 'conseguido', categoria: 'Movilidad sostenible',
    resumen: 'Se instalaron puntos de recarga para vehículos eléctricos.',
    enlace: 'nuestros-logros.html', relacionado: 'precio-recarga',
    imagen: 'card-puntos-recarga.webp',
    ficha: {
      objetivo: 'Se instalaron puntos de recarga para vehículos eléctricos.',
      actuaciones: 'Nuestra sección sindical propuso instalar puntos de recarga para vehículos eléctricos e insistió tras la negativa inicial de la empresa.',
      cuando: ''
    }
  },
  {
    id: 'ropa-laboral', tipo: 'logro', titulo: 'Mejoras de ropa laboral', fecha: '',
    estado: 'conseguido', categoria: 'Seguridad y salud laboral',
    resumen: 'Cazadoras amarillas de alta visibilidad y calzado de seguridad.',
    enlace: 'actividad-informacion-sindical.html?ficha=ropa-laboral', relacionado: '',
    ficha: {
      objetivo: 'Cazadoras amarillas de alta visibilidad y calzado de seguridad.',
      actuaciones: '', cuando: ''
    }
  }
];

export function ordenarPorFecha(entradas) {
  return [...entradas].sort((a, b) => b.fecha.localeCompare(a.fecha));
}
