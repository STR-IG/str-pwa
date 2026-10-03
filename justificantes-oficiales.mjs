export const SOURCES = [
  { id: 'meteocat', name: 'Solicitar certificado a Meteocat', description: 'Formulario oficial para pedir un certificado que no aparece publicado. Indica municipio y fecha en la solicitud.', url: 'https://www.meteo.cat/wpweb/serveis/peticio-certificat-de-dades-meteorologiques/', label: 'Abrir solicitud de certificado' },
  { id: 'aemet', name: 'Solicitar certificado a AEMET', description: 'Acceso al trámite de solicitud de certificados y datos. El organismo puede pedir identificación y datos adicionales.', url: 'https://sede.aemet.gob.es/AEMET/es/nuevaSolicitud', label: 'Abrir solicitud en AEMET' },
  { id: 'proteccio', name: 'Protecció Civil / INUNCAT', description: 'Archivo oficial de noticias y activaciones de planes. Consulta aquí avisos y restricciones; no es un certificado localizado para tu fecha.', url: 'https://interior.gencat.cat/ca/arees_dactuacio/proteccio_civil/noticies-xarxes-socials-pc/noticies-de-proteccio-civil/', label: 'Abrir archivo de Protecció Civil' },
  { id: 'transit', name: 'Servei Català de Trànsit', domain: 'transit.gencat.cat', terms: 'incidències restriccions', description: 'Información viaria y restricciones en Catalunya. El mapa de tráfico actual no acredita por sí solo una incidencia pasada.', url: 'https://transit.gencat.cat/es/informacio-viaria/estat-transit/', label: 'Consultar tráfico actual' },
  { id: 'dgt', name: 'DGT', domain: 'dgt.es', terms: 'meteorología incidencias restricciones', description: 'Comunicaciones e incidencias de tráfico. La información en tiempo real puede haber cambiado desde la fecha consultada.', url: 'https://www.dgt.es/conoce-el-estado-del-trafico/index.html', label: 'Consultar tráfico actual' },
  { id: 'generalitat', name: 'Generalitat', domain: 'govern.cat', terms: 'Protecció Civil alerta', description: 'Notas de prensa sobre alertas, activaciones de planes y medidas adoptadas.', url: 'https://govern.cat/salapremsa/', label: 'Consultar sala de prensa' },
  { id: 'municipal', name: 'Ayuntamientos', domain: 'municat.gencat.cat', terms: '', description: 'Localiza el ayuntamiento en el directorio oficial de Catalunya y accede a su web o sede para buscar bandos y avisos de la fecha indicada.', url: 'https://municat.gencat.cat/ca/Temes/els-ens-locals-de-catalunya/consulta-de-dades/', label: 'Abrir directorio de ayuntamientos' }
];


const DOGC_RESTRICTIONS = [{
  id: 'ISP-3175-2026',
  title: 'Resolución ISP/3175/2026 · DOGC 9747A',
  publishedDate: '2026-09-08',
  effectiveDate: '2026-09-09',
  startTime: '07:00',
  endTime: '17:00',
  url: 'https://portaldogc.gencat.cat/utilsEADOP/PDF/9747A/2169708.pdf',
  counties: {
    'Alt Penedès': [
      'Avinyonet del Penedès', 'Les Cabanyes', 'Castellet i la Gornal', 'Castellví de la Marca', 'Font-rubí', 'Gelida', 'La Granada', 'Mediona', 'Olesa de Bonesvalls', 'Olèrdola', 'Pacs del Penedès', 'El Pla del Penedès', 'Pontons', 'Puigdàlber', 'Sant Cugat Sesgarrigues', "Sant Llorenç d'Hortons", 'Sant Martí Sarroca', 'Sant Pere de Riudebitlles', 'Sant Quintí de Mediona', "Sant Sadurní d'Anoia", 'Santa Fe del Penedès', 'Santa Margarida i els Monjos', 'Subirats', 'Torrelavit', 'Torrelles de Foix', 'Vilafranca del Penedès', 'Vilobí del Penedès'
    ],
    'Baix Llobregat': [
      'Abrera', 'Begues', 'Castelldefels', 'Castellví de Rosanes', 'Cervelló', 'Collbató', 'Corbera de Llobregat', 'Cornellà de Llobregat', 'Esparreguera', 'Esplugues de Llobregat', 'Gavà', 'Martorell', 'Molins de Rei', 'Olesa de Montserrat', 'Pallejà', 'La Palma de Cervelló', 'El Papiol', 'El Prat de Llobregat', 'Sant Andreu de la Barca', 'Sant Boi de Llobregat', 'Sant Climent de Llobregat', 'Sant Esteve Sesrovires', 'Sant Feliu de Llobregat', 'Sant Joan Despí', 'Sant Just Desvern', 'Sant Vicenç dels Horts', 'Santa Coloma de Cervelló', 'Torrelles de Llobregat', 'Vallirana', 'Viladecans'
    ],
    'Baix Penedès': [
      'Albinyana', "L'Arboç", 'Banyeres del Penedès', 'Bellvei', 'La Bisbal del Penedès', 'Bonastre', 'Calafell', 'Cunit', 'Llorenç del Penedès', 'Masllorenç', 'El Montmell', 'Sant Jaume dels Domenys', 'Santa Oliva', 'El Vendrell'
    ],
    Garraf: ['Canyelles', 'Cubelles', 'Olivella', 'Sant Pere de Ribes', 'Sitges', 'Vilanova i la Geltrú'],
    'Vallès Occidental': [
      'Badia del Vallès', 'Barberà del Vallès', 'Castellar del Vallès', 'Castellbisbal', 'Cerdanyola del Vallès', 'Gallifa', 'Matadepera', 'Montcada i Reixac', 'Palau-solità i Plegamans', 'Polinyà', 'Rellinars', 'Ripollet', 'Rubí', 'Sabadell', 'Sant Cugat del Vallès', 'Sant Llorenç Savall', 'Sant Quirze del Vallès', 'Santa Perpètua de Mogoda', 'Sentmenat', 'Terrassa', 'Ullastrell', 'Vacarisses', 'Viladecavalls'
    ]
  }
}];

function normalizeMunicipality(value) {
  return String(value || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
    .replace(/[’']/g, ' ').replace(/,/g, ' ').replace(/\s+/g, ' ').trim()
    .replace(/^(el|la|les|l)\s+/, '').replace(/\s+(el|la|les|l)$/, '');
}

export function applicableDogcResolutions({ date, location } = {}) {
  const municipality = normalizeMunicipality(location);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '') || !municipality) return [];
  return DOGC_RESTRICTIONS.flatMap(resolution => {
    if (date !== resolution.effectiveDate) return [];
    const county = Object.entries(resolution.counties).find(([, names]) =>
      names.some(name => normalizeMunicipality(name) === municipality)
    );
    return county ? [{ ...resolution, matchedMunicipality: String(location).trim(), matchedCounty: county[0] }] : [];
  });
}

const INCIDENTS = { all: true, rain: true, wind: true, snow: true, heat: true, traffic: true };

export function localToday(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export function validateSearch({ date, location, incident }, today = localToday()) {
  const parsed = new Date(`${date}T12:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date || date > today) {
    throw new Error('Indica una fecha válida que no sea posterior a hoy.');
  }
  const place = String(location || '').trim().replace(/\s+/g, ' ');
  if (place.length < 2 || place.length > 100) throw new Error('Indica un municipio de entre 2 y 100 caracteres.');
  if (!Object.hasOwn(INCIDENTS, incident)) throw new Error('Selecciona un tipo de incidencia válido.');
  return { date, location: place, incident };
}

export function officialDocumentUrl(value) {
  try {
    const url = new URL(value);
    return url.origin === 'https://www.meteo.cat' && url.pathname === '/serveis/descarregaFitxer' &&
      /^climatologia\/InformesEREM\/\d{4}\/\d{2}\/\d{6}_\d{4}-\d{2}-\d{2}\.pdf$/.test(url.searchParams.get('file_name') || '') ? url.href : null;
  } catch { return null; }
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
