# Alertas oficiales y estado viario: fuentes y límites

## Fuentes comprobadas (3 de octubre de 2026)

| Organismo | Mecanismo oficial | Actualización / acceso | Decisión |
|---|---|---|---|
| Servei Català de Trànsit | RSS `https://www.gencat.cat/transit/opendata/incidenciesRSS.xml`; feed GML complementario `https://www.gencat.cat/transit/opendata/incidenciesGML.xml` | El catálogo de datos abiertos lo cataloga como actualización continua y acceso público. El RSS respondió HTTP 200 y se observó un `pubDate` de 3/10/2026 21:57 CEST. No anuncia `Access-Control-Allow-Origin`; no consumir desde navegador. No requiere clave según el catálogo/feed. | Integrado mediante Edge Function. Se usa un único feed agregado, no consultas por carretera. `MCT` sigue disponible como mapa oficial. Clasificación de texto heurística y conservadora; revisar antes de representar corte. |
| Meteocat | API oficial SMP `https://api.meteo.cat/pronostic/v2/smp/episodis-oberts?data=AAAA-MM-DDZ`; referencias `/referencia/v1/comarques`, `/referencia/v1/municipis`; previsión `/pronostic/v1/municipalHoraria/{codi}` | Requiere `X-Api-Key`; la documentación desaconseja la llamada directa del navegador por exposición de clave y CORS. Prueba anónima devolvió HTTP 403. Avisos SMP cambian varias veces durante el episodio. Pronóstico horario municipal, 72 h, con actualizaciones publicadas aproximadamente dos veces al día (documentación). | Integrado como proxy server-side, condicionado a configurar el secreto `METEOCAT_API_KEY`. Sin secreto/errores muestra indisponibilidad, nunca “sin avisos”. El usuario elige municipio para una consulta; no usa GPS ni persiste el término. |
| Protecció Civil / Interior | Sala de prensa y comunicados oficiales HTML; consulta complementaria de canales oficiales | No se encontró un API, RSS, JSON, XML ni dataset documentado para leer estado INUNCAT, instrucciones, ES-Alert, territorio y periodo de vigencia. La sala HTML no se scrapea por fragilidad. X no se usa como dependencia. | No automatizado. La card enlaza la fuente y declara expresamente que no hay confirmación automática; no permite un estado global verde. La integración fiable requiere un feed/API oficial documentado o un acuerdo de suministro. |
| ACA | API REST oficial Sentilo para sensores hidrológicos y pluviometría; panel en tiempo real | Datos estructurados con cobertura de sensores, no equivalentes a medidas/restricciones de Protección Civil. Acceso y límites deben verificarse por sensor/servicio antes de incorporarlos. | Reservado para fase 2; no debe presentarse como alerta oficial de movilidad. |

### Fuentes contrastadas y descartadas

- Socrata `uyam-bs37` se anuncia como conjunto de incidencias en tiempo real pero `assetType=href`; no es una tabla consultable `/resource/*.json` (la prueba JSON respondió 403). El registro dirige al RSS oficial y se usa ese feed en su lugar.
- La página MCT y el CIT son mapas/visores HTML apropiados para consulta manual, pero no se tratan como API ni se scrapean.
- Publicaciones de `@emergenciescat`, `@transit` y `@meteocat` pueden ser rápidas y útiles para la comprobación humana. No constituyen el backend de producción ni sustituyen registros estructurados.
- No se integraron mapas de radar ajenos o endpoints no documentados.

## Modelo y actualización

La Edge Function devuelve estado por fuente y, para cada aviso/incidencia, procedencia, tipo, severidad, título, texto, territorio/vía, sentido, vigencia, hora de actualización y enlace oficial. `checkedAt` indica cuándo consultó STR; `updatedAt` conserva la marca de la fuente. Si falla una fuente, no se reutiliza el último aviso como actual. Se conserva solamente la hora de la última consulta válida disponible en la memoria del proceso.

El TTL del proceso de Edge Function es de 2 minutos (metadatos de municipios/comarcas: 24 h). El navegador no consulta más de una vez cada 2 minutos, salvo acción del botón. Esta memoria es local a cada isolate y no es una caché compartida; no se hace una promesa de frecuencia global. Para despliegue con varios isolates conviene un cron/almacenamiento compartido con vencimiento, sin guardar localización personal. Respuestas del endpoint no se almacenan en cachés HTTP o Service Worker.

El agregado “sin avisos” solo se permitiría cuando las tres fuentes requeridas reporten éxito. Hoy Protección Civil carece de integración estructurada, así que el estado general permanece incompleto aunque Meteocat no tenga avisos.

## Episodio de prueba: 3–4 de octubre de 2026

Comprobación documental en el comunicado oficial de Protección Civil publicado el 3 de octubre: activación de INUNCAT en fase de emergencia durante el mediodía; restricciones de desplazamiento no esencial y otras medidas desde las 20:00 del sábado hasta las 14:00 del domingo 4; afectación anunciada en 20 comarcas: Alt Empordà, Baix Empordà, Alt Penedès, Baix Llobregat, Barcelonès, Garraf, Garrotxa, Gironès, Pla de l’Estany, Vallès Occidental, Vallès Oriental, Maresme, Selva, Alt Camp, Baix Camp, Baix Penedès, Osona, Ripollès, Tarragonès y Moianès. El mismo comunicado indica teletrabajo cuando sea posible. STR debe enlazar y resumir literalmente, sin convertirlo en consejo jurídico ni en “puedes/no puedes ir a trabajar”.

El sistema propuesto no pudo detectar automáticamente esa activación ni las restricciones: no se halló feed estructurado oficial de Protección Civil. La API SMP de Meteocat exige clave y la consulta sin ella fue HTTP 403, por lo que la capa climática se marca no disponible hasta configurar la clave. Se comprobó el RSS del SCT en vivo y respondió con feed XML actualizado; dicho feed permite alertas de tráfico, pero no demuestra automáticamente todas las incidencias del episodio ni reemplaza la consulta MCT. Por ello, la prueba real es **parcial y no apta como confirmación de seguridad**.

## Reutilización / paso a producción

El catálogo de incidencias SCT señala condiciones de reutilización mediante `SEE_TERMS_OF_USE`; hay que validar y documentar esas condiciones (atribución, redistribución y restricciones) antes de operación pública. Confirmar también términos y límites de la clave/API Meteocat y política operativa de caché. No hay despliegue en Supabase ni publicación desde este cambio. El secreto Meteocat debe incorporarse al proyecto por el canal seguro de secretos, nunca a código o frontend.
