# Justificantes oficiales

La card existente aparece una sola vez en el bloque Área privada de la portada. Abre `acceso-privado.html?next=justificantes-oficiales.html`; el destino está incluido en la lista permitida. La pantalla nueva conserva el estilo de STR y verifica sesión, usuario y `is_current_user_private_access_allowed` antes de mostrar el contenido. También revalida al recuperar la visibilidad o volver desde la caché de navegación. Un fallo de verificación mantiene el contenido oculto y permite reintentar.

El formulario prepara enlaces a Google restringidos al dominio de cada organismo, con municipio/comarca, fecha (varios formatos) y tipo de incidencia. No consulta una API de archivo ni muestra supuestos documentos encontrados. Los enlaces directos abren los portales oficiales sin filtros. La opción municipal localiza el ayuntamiento mediante Municat; la fecha se consulta después en su web. No se garantiza cobertura completa ni coincidencia exacta. No se generan PDFs, certificados ni decisiones sobre permisos laborales.

Fuentes: Interior/Protecció Civil e INUNCAT, boletines de Meteocat, Servei Català de Trànsit, sede de AEMET, DGT, sala de prensa de Generalitat y directorio municipal oficial. Los mapas actuales de tráfico están identificados como información actual, no como archivo histórico. Enlaces revisados el 29/09/2026.

No hay cambios de base de datos, funciones ni secretos. Como el resto del sitio estático, el HTML y los enlaces a fuentes públicas son descargables; el control de afiliación protege el recorrido de la interfaz, no convierte esos recursos públicos en documentos confidenciales. La consulta no se guarda en STR; al abrir Google se envían los criterios al buscador.

## Verificación y publicación

- `node --test tests/justificantes-oficiales.test.mjs tests/service-worker-update.test.mjs tests/comunicados-internos.test.mjs`
- Verificado en Edge con autenticación simulada: acceso sin sesión, afiliación denegada, fallo de red y reintento, acceso autorizado, cierre de sesión, validación, generación de enlaces y actualización al cambiar criterios. Revisión visual a 390 y 1280 px. No se ha utilizado una cuenta real de afiliado.
- Publicar los tres archivos `justificantes-oficiales.{html,js,mjs}`, la portada, la lista de destinos y el service worker v51 juntos sobre la última versión de main. La imagen ya existe en el repositorio.
- No se requiere despliegue de Supabase.
