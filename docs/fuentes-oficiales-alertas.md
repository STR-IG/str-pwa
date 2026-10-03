# Alertas oficiales y estado viario: fuentes y límites

## Fuentes comprobadas (3 de octubre de 2026)

| Organismo | Endpoint / datos | Acceso y cadencia | Integración |
|---|---|---|---|
| Protecció Civil / CECAT | `https://analisi.transparenciacatalunya.cat/resource/wj9c-j6vf.json` — planes en prealerta, alerta o emergencia | JSON público del portal oficial, comprobado sin autenticación. Página de Interior: dataset vacío cuando no hay planes activos. No consta SLA/cuota ni periodicidad exacta publicada. | Integrado con caché server-side 2 min. La fila incluye nombre/acrónimo, fase, activación, `fasedatahora`, descripción y a veces comunicado CECAT. No todos los registros incluyen territorio/medidas/fin. |
| Servei Català de Trànsit | RSS `https://www.gencat.cat/transit/opendata/incidenciesRSS.xml`; GML `https://www.gencat.cat/transit/opendata/incidenciesGML.xml` | Catálogo público; frecuencia catalogada continua. El RSS respondió HTTP 200 y `pubDate` 3/10/2026 21:57 CEST. Sin CORS anunciado; no se consulta desde navegador. | RSS agregado integrado detrás de Edge Function. El Socrata `uyam-bs37` es un recurso `href`, no una tabla JSON; su endpoint resource respondió 403. MCT/CIT siguen como mapas oficiales de consulta manual. |
| Meteocat | SMP `https://api.meteo.cat/pronostic/v2/smp/episodis-oberts?data=AAAA-MM-DDZ`; referencias `/referencia/v1/comarques`, `/referencia/v1/municipis`; horaria municipal `/pronostic/v1/municipalHoraria/{codi}` | `X-Api-Key` obligatoria y CORS desactivado; la consulta sin clave devolvió 403. El formulario oficial ofrece acceso gratuito a administración y uso personal/educativo/investigación, con registro; tras enviar, indica hasta 7 días para formalizar el alta. | Proxy server-side preparado, pendiente de alta y clave. Los términos de acceso limitan difusión: piden atribución e informar al SMC de la publicación y prohíben redistribuir los datos recibidos a terceros. Confirmar por escrito la categoría de STR-IG y permiso/condiciones de una PWA pública antes de activar Meteocat. Contacto oficial: `api.meteocat@gencat.cat`. |
| ACA | API REST Sentilo para caudales/niveles/pluviometría y panel en tiempo real | Datos estructurados de sensores; no son instrucciones ni activaciones de Protección Civil. Cobertura, acceso y límites por sensor no verificados en esta fase. | Segunda fase; no se presenta como alerta de movilidad. |

### Reutilización y fuentes descartadas

- Los catálogos de CECAT y SCT enlazan a la Llicència oberta d’ús d’informació - Catalunya. Esta permite reutilizar, distribuir/comunicar y transformar, con condiciones: no alterar ni desnaturalizar la información, citar procedencia y mostrar fecha de última actualización. Una licencia específica del conjunto, si la hubiera, prevalece.
- Publicaciones de `@emergenciescat`, `@transit` y `@meteocat` quedan como consulta complementaria, no backend.
- Páginas HTML del MCT/CIT no se scrapean. No se integraron feeds no documentados ni mapas de radar de terceros.

## Modelo y actualización

La Edge Function normaliza cada fila/aviso/incidencia con fuente, tipo, severidad, título, descripción, territorio/vía cuando exista, periodo, hora de actualización y enlace oficial. `checkedAt` es la hora de consulta de STR; `updatedAt` mantiene la hora que reporta la fuente. Una respuesta inválida o fallo no reutiliza el dato activo anterior. Se conserva solo la hora de la última respuesta válida en la memoria del isolate.

Protección Civil: un array JSON válido vacío se interpreta como “sin planes activos” porque la página oficial documenta ese significado. Si el endpoint falla, el estado es desconocido, nunca verde. El TTL del isolate es 2 min; referencias Meteocat, 24 h. No existe caché compartida entre isolates. La interfaz tiene actualización manual y limita llamadas del cliente a 2 min salvo acción explícita. No se persiste ubicación ni municipio.

El conjunto CECAT no siempre publica campos separados de territorio, restricciones ni finalización. En esos casos la interfaz muestra que faltan en el registro y enlaza el comunicado oficial. No se extrae automáticamente texto del PDF ni se infieren instrucciones.

## Prueba real: episodio 3–4 de octubre de 2026

Lectura viva del recurso JSON oficial el 3 de octubre devolvió una fila: `plaacronim=INUNCAT`, `plaactivat=SI`, `plafase=EMERGÈNCIA`, `fasedatahora=03/10/2026 12:59`, `descripcio=Pas a ALERTA SMP Intensitat 1 i 2 d'Octubre`, y un enlace de comunicado CECAT publicado/actualizado a las 21:23. La automatización sí detecta la activación, la fase y la hora.

El comunicado/nota oficial del episodio anunció restricciones de desplazamiento no esencial desde las 20:00 del sábado hasta las 14:00 del domingo 4 en 20 comarcas y teletrabajo cuando sea posible. Esos detalles no aparecen como campos separados en la fila JSON comprobada; la card enlaza el PDF CECAT y no los inventa. Meteocat no se pudo verificar sin clave. El RSS SCT respondió con datos, pero no demuestra por sí solo que se hayan captado todas las incidencias de ese episodio. La prueba es **parcial, no una confirmación completa de seguridad**.

## Paso a producción

La consulta sobre modalidad, cuota y condiciones de difusión de datos Meteocat se ha enviado al contacto oficial `api.meteocat@gencat.cat`; respuesta pendiente. No desplegar esa fuente hasta completar el alta y confirmar por escrito el permiso/condiciones de publicación en STR-IG. Mantener atribución y fecha de actualización de CECAT/SCT conforme a la licencia. La caché por isolate es best effort; si se requiere consistencia global habrá que añadir almacenamiento compartido o un proceso periódico. La función no está desplegada y no se publicó la PWA.
