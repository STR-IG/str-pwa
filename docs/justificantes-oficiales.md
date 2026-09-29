# Justificantes oficiales

Acceso desde el Área privada, con el control de afiliación existente. No modifica el cuestionario de Emergencia climática ni la pantalla de tráfico.

## Consulta directa

La pantalla llama a official-weather-documents con fecha, municipio y tipo de incidencia. La función verifica el JWT con Auth y la afiliación mediante is_current_user_private_access_allowed, usando el token del solicitante y sin permisos de servicio. verify_jwt=false delega la validación a esas comprobaciones explícitas; no permite consultas anónimas.

El servidor lee el catálogo público de Meteocat, resuelve el nombre exacto del municipio (ignorando mayúsculas y acentos), envía el código oficial y filtra los archivos por municipio y fecha. Solo devuelve una URL PDF si su nombre figura en el listado oficial. No ejecuta scripts ni acepta URLs del cliente. Caché: municipios una hora; catálogos cinco minutos, máximo cien municipios.

Distingue documento encontrado, no publicado, municipio desconocido, fenómeno no cubierto y fallo del servicio. Un fallo nunca se interpreta como ausencia de documentos. El navegador cancela consultas obsoletas y descarta respuestas de criterios anteriores.

## Cobertura

Búsqueda automática de certificados de lluvia y viento en municipios de Catalunya, en el catálogo de Meteocat. El organismo publica el año actual y anterior y puede tardar entre 3 y 5 días laborables. No encontrar certificado no significa ausencia de incidencia. El certificado describe datos meteorológicos, no acredita por sí mismo restricciones de movilidad. STR no fabrica documentos ni usa IA para generar enlaces.

Se ofrecen enlaces directos al formulario de certificados no publicados de Meteocat y a la solicitud de AEMET. Otros avisos, restricciones, tráfico actual y directorio municipal están en un bloque complementario, sin presentarse como resultados de la consulta. Se eliminan Google y el enlace fijo de INUNCAT de noviembre de 2024.

Fuentes verificadas el 29/09/2026:
- https://www.meteo.cat/serveis/descarregues
- https://www.meteo.cat/wpweb/serveis/peticio-certificat-de-dades-meteorologiques/
- https://sede.aemet.gob.es/AEMET/es/nuevaSolicitud

## Verificación y despliegue

node --test tests/justificantes-oficiales.test.mjs tests/official-weather-documents.test.mjs tests/service-worker-update.test.mjs

Prueba real: Sabadell 09/09/2026 devuelve un PDF HTTP 200, application/pdf y firma PDF. Sabadell 28/09/2026 no figura en el catálogo consultado. Edge: sesión autorizada/denegada/ausente, fallo y reintento, documento encontrado y no publicado, enlaces de solicitud, móvil y escritorio. Autenticación simulada; no se ha usado una cuenta real de afiliado.

Desplegar primero supabase/functions/official-weather-documents/index.ts y lookup.mjs. No requiere claves adicionales ni cambios de base de datos. Publicar después la interfaz y el service worker v52.
