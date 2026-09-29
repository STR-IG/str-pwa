export const SOURCES = [
  { id: 'proteccio', name: 'Protecció Civil / INUNCAT', domain: 'interior.gencat.cat', terms: 'Protecció Civil INUNCAT', description: 'Restricciones de movilidad y comunicaciones de emergencias. Comprueba el episodio y los municipios afectados.', url: 'https://interior.gencat.cat/ca/actualitat/restriccions-de-mobilitat-per-inuncat/', label: 'Consultar restricciones INUNCAT' },
  { id: 'meteocat', name: 'Meteocat', domain: 'meteo.cat', terms: 'episodi meteorològic', description: 'Boletines e informes de episodios meteorológicos. Revisa el período y la zona que cubre cada informe.', url: 'https://www.meteo.cat/wpweb/climatologia/butlletins-i-episodis-meteorologics/', label: 'Consultar boletines y episodios' },
  { id: 'transit', name: 'Servei Català de Trànsit', domain: 'transit.gencat.cat', terms: 'incidències restriccions', description: 'Información viaria y restricciones en Catalunya. El mapa de tráfico actual no acredita por sí solo una incidencia pasada.', url: 'https://transit.gencat.cat/es/informacio-viaria/estat-transit/', label: 'Consultar tráfico actual' },
  { id: 'aemet', name: 'AEMET', domain: 'aemet.es', terms: 'meteorología aviso informe', description: 'Información meteorológica y acceso a la solicitud de certificados emitidos por AEMET.', url: 'https://sede.aemet.gob.es/AEMET/es/home', label: 'Consultar servicios de AEMET' },
  { id: 'dgt', name: 'DGT', domain: 'dgt.es', terms: 'meteorología incidencias restricciones', description: 'Comunicaciones e incidencias de tráfico. La información en tiempo real puede haber cambiado desde la fecha consultada.', url: 'https://www.dgt.es/conoce-el-estado-del-trafico/index.html', label: 'Consultar tráfico actual' },
  { id: 'generalitat', name: 'Generalitat', domain: 'govern.cat', terms: 'Protecció Civil alerta', description: 'Notas de prensa sobre alertas, activaciones de planes y medidas adoptadas.', url: 'https://govern.cat/salapremsa/', label: 'Consultar sala de prensa' },
  { id: 'municipal', name: 'Ayuntamientos', domain: 'municat.gencat.cat', terms: '', description: 'Localiza el ayuntamiento en el directorio oficial de Catalunya y accede a su web o sede para buscar bandos y avisos de la fecha indicada.', url: 'https://municat.gencat.cat/ca/Temes/els-ens-locals-de-catalunya/consulta-de-dades/', label: 'Abrir directorio de ayuntamientos' }
];

const INCIDENTS = {
  all: '(alerta OR avís OR meteorología OR meteorològic)', rain: '(lluvia OR pluja OR inundación OR inundació OR INUNCAT)',
  wind: '(viento OR vent OR VENTCAT)', snow: '(nieve OR neu OR NEUCAT)', heat: 'calor', traffic: '(restricción OR restricció OR mobilitat OR carretera)'
};

export function localToday(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export function validateSearch({ date, location, incident }, today = localToday()) {
  const parsed = new Date(`${date}T12:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date || date > today) {
    throw new Error('Indica una fecha válida que no sea posterior a hoy.');
  }
  const place = String(location || '').trim().replace(/\s+/g, ' ');
  if (place.length < 2 || place.length > 100) throw new Error('Indica un municipio o comarca de entre 2 y 100 caracteres.');
  if (!Object.hasOwn(INCIDENTS, incident)) throw new Error('Selecciona un tipo de incidencia válido.');
  return { date, location: place, incident };
}

export function searchUrl(source, criteria) {
  const { date, location, incident } = validateSearch(criteria);
  // Quotes keep user input from adding search operators or changing the source domain.
  const place = location.replace(/["\\\r\n]/g, ' ').trim();
  const [year, month, day] = date.split('-');
  const query = source.id === 'municipal'
    ? `site:${source.domain} "${place}" ajuntament`
    : `site:${source.domain} "${place}" ("${day}/${month}/${year}" OR "${date}" OR "${day}-${month}-${year}") ${INCIDENTS[incident]}`;
  const url = new URL('https://www.google.com/search');
  url.searchParams.set('q', query);
  return url.href;
}

// Authorization is confirmed by the existing server RPC, never by stored UI state.
export async function privateAccess(client) {
  const { data, error } = await client.auth.getSession();
  if (error) throw error;
  if (!data?.session) return false;
  const [identity, access] = await Promise.all([
    client.auth.getUser(), client.rpc('is_current_user_private_access_allowed')
  ]);
  if (identity.error || access.error) throw identity.error || access.error;
  return Boolean(identity.data?.user) && access.data === true;
}
