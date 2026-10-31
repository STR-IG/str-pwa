# Encuestas STR

## Arquitectura

La PWA mantiene su arquitectura estática. `index.html` enlaza `encuestas.html` con la tarjeta WebP aportada. `encuestas-admin.html` se abre desde el panel existente y admite retorno desde el acceso privado. Los formularios usan `survey-api.js`; únicamente contiene la clave publicable existente.

La función Edge `surveys` es el único punto de acceso. Lista las encuestas públicas activas, emite códigos y registra votos; para administración valida el JWT mediante `auth.getUser()` y consulta en servidor `committee_admins(email, active)`. No usa metadatos editables por el usuario. La verificación pública es independiente de Supabase Auth: no crea usuarios ni sustituye la sesión privada del administrador.

Encuestas de una pregunta y una respuesta entre 2 y 10 opciones. Ciclo irreversible: borrador → activa → cerrada. No se editan opciones después de activar ni se reabre una encuesta. La migración incluye una encuesta activa exclusivamente para administradores; los borradores nuevos también son privados por defecto.

## Datos y seguridad

Todos los datos nuevos residen en `survey_private`, fuera del esquema expuesto por defecto, con RLS habilitada y sin permisos para `anon`/`authenticated`. No añadir este esquema a la Data API. Las RPC de `public` son `SECURITY DEFINER` con `search_path` vacío, referencias cualificadas y EXECUTE revocado a PUBLIC/anon/authenticated y concedido exclusivamente a `service_role`. Se necesita este privilegio para acceder al esquema privado; los parámetros administrativos solo se construyen después de la autorización de la función Edge. Las RPC no deben recibir grants adicionales.

* `surveys` y `options`: definición y contadores agregados, sin filas de respuestas individuales.
* `participation`: clave única `(survey_id, HMAC(correo normalizado))`, sin opción, ID de respuesta ni marca temporal.
* La función Edge rechaza en servidor las direcciones del dominio `grifols.com` y sus subdominios. La interfaz solicita un correo personal y muestra un error genérico cuando se intenta usar uno corporativo; el alcance exacto de la restricción se explica en el aviso de privacidad descargable. La normalización elimina espacios exteriores y convierte a minúsculas; no pretende identificar personas distintas, ni unificar alias o proveedores distintos.
* `challenges`: HMAC del código vinculado a un UUID aleatorio, huella del correo y encuesta; caducidad de 10 minutos, máximo cinco intentos y un solo uso. Un reenvío invalida el anterior. No se guardan correo ni código en claro. La duplicidad solo se comunica después de verificar el código, para evitar consultas sobre participación ajena.
* `quotas`: límite persistente de un envío por minuto y diez al día por huella de correo, compartido entre encuestas; mil envíos diarios globales. El límite global también reduce abuso por múltiples correos. No se confía en cabeceras IP aportadas por clientes. Se recomienda revisar el volumen esperado y configurar protección adicional en la infraestructura antes de una campaña grande.
* `contacts`: correo, versión del texto de consentimiento y fecha, sin encuesta/opción. Solo se escribe cuando se marca la casilla, desmarcada por defecto. No marcarla permite votar y no revoca consentimientos previos. La versión vigente es `str-laboral-v2-2026-10-30`; las pruebas privadas ocultan la casilla y nunca modifican esta lista. La tabla no se expone desde la API ni se muestra en el panel.

El voto bloquea la fila de encuesta y el desafío, comprueba estado, restricción administrativa, código y pertenencia de la opción. Inserta la participación y aumenta el contador en una misma transacción. La clave única protege frente a duplicados y el mismo bloqueo serializa cierre/voto. Un fallo revierte toda la transacción; un código incorrecto devuelve un resultado de error para que su intento quede contabilizado.

El panel solo entrega agregados. En encuestas públicas se retienen hasta el cierre y un mínimo de cinco votos; en la prueba administrativa pueden verse antes para verificar el flujo. No hay endpoint de respuestas individuales, participantes ni contactos. No se envían eventos de analítica desde estas páginas y sus llamadas no se cachean. Todos los textos de encuestas se insertan con `textContent`.

**Límites del anonimato:** una transacción modifica el registro de participación y los contadores. Un operador con acceso a base de datos, WAL, copias de seguridad o trazas podría correlacionar operaciones; además la solicitud contiene correo y opción en tránsito TLS. El proveedor de correo recibe la dirección y el código. Esto es separación de datos y minimización, no anonimato criptográfico ni garantía frente a operadores privilegiados. El aviso de privacidad descargable lo explica sin prometer anonimato absoluto. No activar trazas de cuerpos de petición ni registrar correos, códigos o votos.

El formulario fuerza la ejecución de la función `surveys` en `eu-west-3`, la misma región de París donde reside la base de datos. Supabase conserva los registros técnicos de API y base de datos durante un día con el plan gratuito vigente; ese plan no incluye copias automáticas recuperables por la sección. Resend envía desde Irlanda, pero almacena en Estados Unidos los datos de cuenta, dirección, contenido, metadatos y registros de API durante 30 días con su configuración estándar. GitHub Pages aloja la página estática en infraestructura global y solo recibe los datos técnicos de la visita, no el correo ni las respuestas enviados directamente a Supabase.

El aviso público completo se publica en `docs/aviso-privacidad-encuestas-str.pdf`. La interfaz muestra únicamente la primera capa: responsable, finalidad, base jurídica y enlace al PDF. La ponderación detallada del interés legítimo se mantiene como documentación interna de cumplimiento; la validación técnica del borrado se registra más abajo en esta documentación del proyecto.

La retirada del consentimiento se solicita en `str.ig@str.es`. El panel administrativo ofrece una acción específica que llama a `survey_contact_withdraw`: elimina únicamente el correo de `contacts`, sin tocar respuestas ni agregados, y no permite listar contactos.

## Despliegue y configuración

Las migraciones de encuestas y retención están aplicadas en producción. La migración `20261031071600_survey_consent_v2` versiona el consentimiento meteorológico y añade una RPC de retirada restringida a `service_role`. La función Edge `surveys` está en versión 6 con `verify_jwt = false` porque realiza su propia autorización para acciones administrativas. Para OTP reutiliza la clave `RESEND_API_KEY` y el remitente STR ya configurado. Las claves HMAC usan `SURVEY_HMAC_SECRET` si está configurada; si no, derivan una clave separada de `SUPABASE_SERVICE_ROLE_KEY`. Esa derivación cambia si se rota la clave de servicio, por lo que una clave `SURVEY_HMAC_SECRET` estable puede evitar que una rotación rompa la detección de duplicados.

La cuenta administradora designada consta activa en la lista privada y en `committee_admins`. La encuesta “Alertas meteorológicas” mantiene el estado `solo_admin` y `closed = false`: solo se muestra en el panel autenticado y no se abre al público hasta que una persona administradora confirme “Publicar encuesta”. El listado anónimo en producción responde sin encuestas públicas; las acciones administrativas requieren autorización del servidor.

La tarea programada ejecuta `survey_private.weather_purge_expired()` cada minuto. Una prueba transaccional en producción creó datos sintéticos con cierre de 16 días: la función eliminó la huella de participación, mantuvo intacto el contador agregado y eliminó los datos sintéticos dentro de la misma operación. El historial previo de ejecución del cron mostró actividad regular sin fallos.

La auditoría automática de Supabase confirma que las RPC nuevas de consentimiento y retirada no son ejecutables por `anon` ni por `authenticated`, y que las tablas de `survey_private` tienen RLS sin políticas para acceso directo. También señala funciones ajenas a encuestas y recomendaciones de configuración global de Auth; deben revisarse aparte antes de ampliar el uso público de la app. Los acuerdos de tratamiento y los datos de ubicación/retención de Supabase, Resend y GitHub deben revisarse si cambia su configuración.

La prueba de envío de correo real, la comprobación visual en navegador y la prueba multiconexión siguen pendientes. No se ha activado ninguna encuesta pública.

## Validación local reproducible

* `node --test tests/surveys.test.mjs`: normalización, validación, HMAC y códigos.
* Instalar `@electric-sql/pglite@0.3.14` en una carpeta de herramientas de pruebas; definir `PGLITE_MODULE` con la ruta absoluta a su `dist/index.js`; ejecutar `node tests/surveys-database.mjs`. Ejecuta SQL real en PostgreSQL WASM aislado y prueba migración, ACL/RLS, prueba privada, caducidad, cinco intentos, reenvíos, duplicados, consentimiento y agregados. No sustituye las pruebas de concurrencia en PostgreSQL/Supabase de pruebas.
* `deno check supabase/functions/surveys/index.ts`: tipos de la función Edge; dependencias Supabase fijadas.
* `deno test --allow-env --lock=supabase/functions/surveys/deno.lock tests/surveys-edge.ts`: cliente Supabase real con frontera HTTP simulada; autorización, flags administrativos falsificados, código no devuelto, HMAC, consentimiento y errores de correo/configuración.
* Definir `PLAYWRIGHT_MODULE` con la ruta al paquete Playwright instalado; `node tests/surveys-browser.cjs`: servidor local y API simulada, Edge headless, anchos 320/390/768/1280, consentimiento activado/desactivado, fallo de correo, listado vacío, denegación administrativa, creación/activación/cierre/resultados y carga de la tarjeta. Guarda capturas fuera del repositorio (o en `SURVEY_SCREENSHOTS`).
* `node --experimental-vm-modules --test tests/*.test.mjs`: suite existente. Hay fallos anteriores en main; comparar con la misma revisión base y documentar los resultados en la PR.

Resultado en la base `27b0f4d`: main 360/370 pruebas correctas; rama 363/373 correctas, con los mismos diez fallos previos (reinicio de revisión, comunicados, navegación de Actualidad, tarjeta Estadísticas, justificantes, prueba del handler de horas extra, dos expectativas antiguas de caché y navegación sindical). Las pruebas nuevas de SQL, Edge y navegador pasan por separado. Comprobación visual realizada en móvil y escritorio; los servicios remotos siguen pendientes.
