# Accesos a tarjetas sin identidad

Cambio preparado y verificado el 26 de octubre de 2026.

## Datos conservados

`app_card_counts` tiene exclusivamente mes, tarjeta y número de accesos. La tarjeta debe existir en un catálogo fijo de destinos públicos de la app. No hay filas por visita ni columnas para cuenta, correo, visitante, sesión, IP, fecha y hora individual, respuestas o resultados de consultas.

El cliente solo envía `{p_card: clave_del_catalogo}` al contador público. No transmite el JWT de la cuenta, cookies, parámetros de búsqueda, fragmentos, textos de las tarjetas o respuestas del formulario. No cuenta cargas de páginas; solo las pulsaciones de las tarjetas reconocidas. El service worker deja de generar una segunda analítica de navegación. No hay identificación para deduplicar personas o combatir inflación de contadores: son accesos, no usuarios únicos ni una auditoría de actividad.

El panel «Accesos a tarjetas» permite seleccionar un mes. La lectura de totales requiere sesión y rol activo de administrador en el servidor. Las tablas tienen RLS y carecen intencionadamente de permisos o políticas para clientes anónimos/autenticados: la función pública solo puede incrementar una tarjeta del catálogo, y la función administrativa lee con comprobación de rol. El aviso informativo del asesor de seguridad sobre RLS sin políticas en estas tablas corresponde a este bloqueo intencional.

## Retirada del historial anterior

Se borran todos los eventos anteriores de `app_analytics_events` y todos los casos de `permit_cases`; se revocan sus permisos de escritura. No se conserva una exportación ni una copia de esos datos. El antiguo endpoint de casos responde 410 sin consultar ni escribir datos. Se retiran la bandeja del panel, el envío de casos y el guardado/restauración de borradores del cuestionario de deber inexcusable. Las páginas actualizadas eliminan los identificadores analíticos antiguos del navegador y el borrador de ese formulario. La caché del service worker cambia de versión.

Los contadores nuevos comienzan desde cero. No se han reconstruido recorridos ni estadísticas personales a partir de los datos antiguos.

## Alcance y límites

Se conserva el funcionamiento de las consultas y sus límites de uso. La autenticación, los códigos de acceso, los registros técnicos de proveedores y los identificadores técnicos de control de cuota de consultas son sistemas independientes de estas estadísticas y no se eliminan en este cambio. No se afirma ausencia total de registros en la infraestructura, ni se han verificado o eliminado respaldos históricos del proveedor.

## Verificación

Pruebas del cliente: cero eventos al cargar una página; un contador por pulsación; sin cuenta, cookies, parámetros o etiquetas libres; destinos privados/arbitrarios rechazados; retirada de identificadores locales; ausencia de la segunda analítica del worker.

Prueba SQL transaccional revertida: incrementos desde rol anónimo, permisos de tablas cerrados y rechazo de tarjetas arbitrarias. Verificación posterior: cero casos y eventos antiguos, cero contadores ficticios, RLS activo y solo tres columnas en los contadores.

Pruebas de navegador Edge con datos sintéticos: panel de recuentos, cuestionario operativo sin envío de casos ni borradores persistidos, una pulsación contada, cero eventos de página y ausencia de errores JavaScript. Comprobaciones de API: lectura anónima bloqueada, etiqueta inválida rechazada y endpoint de casos retirado.
