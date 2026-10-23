# Alertas oficiales y estado viario: fuentes y límites

## Alcance de esta integración

Esta versión consulta exclusivamente dos fuentes oficiales: Protecció Civil/CECAT y el Servei Català de Trànsit. Meteocat queda fuera de la integración: STR-IG comunicó el 22 de octubre de 2026 que no contratará el acceso profesional ni activará ni publicará esa fuente. El código no conserva llamadas a su API, secretos, opción de activación ni previsión municipal.

## Fuentes integradas

| Organismo | Endpoint / datos | Acceso y cadencia | Integración |
|---|---|---|---|
| Protecció Civil / CECAT | `https://analisi.transparenciacatalunya.cat/resource/wj9c-j6vf.json` — planes en prealerta, alerta o emergencia | JSON público del portal oficial, comprobado sin autenticación. Interior documenta que el conjunto queda vacío cuando no hay planes activos. No consta SLA/cuota ni periodicidad exacta publicada. | Edge Function con caché server-side de 2 min. La fila incluye nombre/acrónimo, fase, activación, `fasedatahora`, descripción y, a veces, comunicado CECAT. No todos los registros incluyen territorio, medidas o finalización. |
| Servei Català de Trànsit | RSS `https://www.gencat.cat/transit/opendata/incidenciesRSS.xml`; GML `https://www.gencat.cat/transit/opendata/incidenciesGML.xml` | Catálogo público; frecuencia catalogada continua. El RSS respondió HTTP 200. Sin CORS anunciado; no se consulta desde navegador. | RSS integrado detrás de Edge Function. El Socrata `uyam-bs37` es un recurso `href`, no una tabla JSON; su endpoint resource respondió 403. MCT/CIT siguen disponibles como mapas oficiales para consulta manual. |

## Reutilización, presentación y límites

- Los catálogos de CECAT y SCT enlazan a la Llicència oberta d’ús d’informació - Catalunya. Esta permite reutilizar, distribuir/comunicar y transformar, con condiciones: no alterar ni desnaturalizar la información, citar procedencia y mostrar la fecha de última actualización. Si el conjunto tiene una licencia específica, prevalece.
- No se scrapean páginas HTML del MCT/CIT ni se integran feeds no documentados o mapas de radar de terceros.
- La Edge Function normaliza cada aviso/incidencia con fuente, tipo, severidad, título, descripción, territorio o vía cuando exista, periodo y enlace oficial. `checkedAt` indica la hora de consulta de STR. En SCT, `pubDate` se guarda como `publishedAt`: fecha de publicación, no confirma cuándo empezó, se actualizó por última vez ni cuándo termina la incidencia. La interfaz lo etiqueta como publicación y pide comprobar la vigencia en el CIT.
- Una respuesta inválida o un fallo no reutiliza datos activos anteriores. Se conserva solo la hora de la última respuesta válida en la memoria del isolate.
- Un array CECAT vacío y válido se interpreta como “sin planes activos”, según la documentación del conjunto. Si el endpoint falla, el estado es desconocido, nunca verde. Si falla cualquiera de las dos fuentes, el estado general es incompleto.
- CECAT no siempre publica territorio, restricciones ni finalización en campos separados. La interfaz enlaza el comunicado oficial cuando existe; no extrae automáticamente el texto de un PDF ni infiere instrucciones.
- La instantánea de CECAT y SCT usa caché de 2 min por isolate y agrupa peticiones simultáneas. La caché entre isolates es best effort. La interfaz también limita las consultas del cliente a una cada 2 min, salvo actualización manual.

## Muestra del RSS del SCT

Los tests incluyen cuatro elementos copiados del RSS oficial el 03/10/2026 a las 22:47 CEST: cierre explícito de calzada en la A-2/Jorba; calzada restringida en la A-2/Bruc; tráfico lento en la C-32/Esplugues; y tráfico intenso en la C-35/Vidreres. El último incluye `TALLADA SORTIDA 87` en el campo de sentido; no significa que la carretera esté cortada. Las pruebas verifican que solo se clasifique como cierre una indicación explícita.

## Prueba de CECAT del episodio del 3–4 de octubre de 2026

La lectura del recurso JSON oficial el 3 de octubre devolvió una fila: `plaacronim=INUNCAT`, `plaactivat=SI`, `plafase=EMERGÈNCIA`, `fasedatahora=03/10/2026 12:59`, una descripción y un enlace de comunicado CECAT. La card detecta activación, fase y hora del cambio. El comunicado anunció restricciones de desplazamiento no esencial y teletrabajo; esos detalles no aparecían como campos separados en la fila JSON comprobada. La card enlaza el comunicado y no los inventa. Esta comprobación fue parcial y no confirma que las fuentes cubrieran todas las afectaciones del episodio.

## Estado de despliegue

La función y la PWA no están desplegadas desde este PR. Antes de publicar, mantener la atribución y la fecha de actualización para CECAT/SCT conforme a sus condiciones de reutilización y revisar el resultado en la interfaz.
