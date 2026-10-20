# Encuestas STR

## Arquitectura

La PWA mantiene su arquitectura estática. `index.html` enlaza `encuestas.html` con la tarjeta WebP aportada. `encuestas-admin.html` se abre desde el panel existente y admite retorno desde el acceso privado. Los formularios usan `survey-api.js`; únicamente contiene la clave publicable existente.

La función Edge `surveys` es el único punto de acceso. Lista las encuestas públicas activas, emite códigos y registra votos; para administración valida el JWT mediante `auth.getUser()` y consulta en servidor `committee_admins(email, active)`. No usa metadatos editables por el usuario. La verificación pública es independiente de Supabase Auth: no crea usuarios ni sustituye la sesión privada del administrador.

Encuestas de una pregunta y una respuesta entre 2 y 10 opciones. Ciclo irreversible: borrador → activa → cerrada. No se editan opciones después de activar ni se reabre una encuesta. La migración incluye una encuesta activa exclusivamente para administradores; los borradores nuevos también son privados por defecto.

## Datos y seguridad

Todos los datos nuevos residen en `survey_private`, fuera del esquema expuesto por defecto, con RLS habilitada y sin permisos para `anon`/`authenticated`. No añadir este esquema a la Data API. Las RPC de `public` son `SECURITY DEFINER` con `search_path` vacío, referencias cualificadas y EXECUTE revocado a PUBLIC/anon/authenticated y concedido exclusivamente a `service_role`. Se necesita este privilegio para acceder al esquema privado; los parámetros administrativos solo se construyen después de la autorización de la función Edge. Las RPC no deben recibir grants adicionales.

* `surveys` y `options`: definición y contadores agregados, sin filas de respuestas individuales.
* `participation`: clave única `(survey_id, HMAC(correo normalizado))`, sin opción, ID de respuesta ni marca temporal. La normalización elimina espacios exteriores y convierte a minúsculas; no pretende identificar personas distintas, ni unificar alias o proveedores distintos.
* `challenges`: HMAC del código vinculado a un UUID aleatorio, huella del correo y encuesta; caducidad de 10 minutos, máximo cinco intentos y un solo uso. Un reenvío invalida el anterior. No se guardan correo ni código en claro. La duplicidad solo se comunica después de verificar el código, para evitar consultas sobre participación ajena.
* `quotas`: límite persistente de un envío por minuto y diez al día por huella de correo, compartido entre encuestas; mil envíos diarios globales. El límite global también reduce abuso por múltiples correos. No se confía en cabeceras IP aportadas por clientes. Se recomienda revisar el volumen esperado y configurar protección adicional en la infraestructura antes de una campaña grande.
* `contacts`: correo, versión del texto de consentimiento y fecha, sin encuesta/opción. Solo se escribe cuando se marca la casilla, desmarcada por defecto. No marcarla permite votar y no revoca consentimientos previos. No se expone esta tabla desde la API ni el panel.

El voto bloquea la fila de encuesta y el desafío, comprueba estado, restricción administrativa, código y pertenencia de la opción. Inserta la participación y aumenta el contador en una misma transacción. La clave única protege frente a duplicados y el mismo bloqueo serializa cierre/voto. Un fallo revierte toda la transacción; un código incorrecto devuelve un resultado de error para que su intento quede contabilizado.

El panel solo entrega agregados. En encuestas públicas se retienen hasta el cierre y un mínimo de cinco votos; en la prueba administrativa pueden verse antes para verificar el flujo. No hay endpoint de respuestas individuales, participantes ni contactos. No se envían eventos de analítica desde estas páginas y sus llamadas no se cachean. Todos los textos de encuestas se insertan con `textContent`.

**Límites del anonimato:** una transacción modifica el registro de participación y los contadores. Un operador con acceso a base de datos, WAL, copias de seguridad o trazas podría correlacionar operaciones; además la solicitud contiene correo y opción en tránsito TLS. El proveedor de correo recibe la dirección y el código. Esto es separación de datos y minimización, no anonimato criptográfico ni garantía frente a operadores privilegiados. El aviso de la interfaz lo explica sin prometer anonimato absoluto. No activar trazas de cuerpos de petición ni registrar correos, códigos o votos.

## Configuración pendiente y puesta en marcha autorizada

Publicación autorizada por el usuario el 20 de octubre de 2026. Se ha aplicado la migración en producción y desplegado la función `surveys` v1. El archivo local usa la versión que Supabase registró al aplicarla; no se ha modificado el historial remoto. El listado público responde 200 sin encuestas públicas y las llamadas administrativas anónimas se deniegan. La única encuesta creada es privada para administradores.

El envío de códigos sigue pendiente de configurar `SURVEY_HMAC_SECRET`, `SURVEY_RESEND_API_KEY` y `SURVEY_MAIL_FROM`. La conexión MCP no expone gestión de secretos y la CLI no tiene sesión iniciada. No activar encuestas públicas hasta configurar y probar el correo. Las siguientes comprobaciones describen lo necesario para habilitar el flujo completo:

1. Revisar/aplicar `supabase/migrations/20261020105925_anonymous_surveys.sql` en pruebas. Requiere roles estándar Supabase. Revisar asesores de seguridad del proyecto real, grants efectivos y exposición de esquemas antes de producción.
2. Configurar secretos **solo en el servidor**: `SURVEY_HMAC_SECRET` (aleatorio, al menos 32 caracteres), `SURVEY_RESEND_API_KEY` y `SURVEY_MAIL_FROM` (remitente verificado en Resend). Supabase proporciona `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY`. No ponerlos en HTML ni repositorio. Mantener la clave HMAC estable: cambiarla sin migración rompe la detección de duplicados y los códigos existentes.
3. Revisar proveedor de correo, contrato/configuración de privacidad, remitente y canal efectivo de baja. Acordar conservación de contactos y huellas con STR. Borrar huellas durante una encuesta permite repetir participación. Los desafíos caducados se eliminan al solicitar código en la misma encuesta; conviene una tarea operativa de limpieza periódica para desafíos expirados y cuotas antiguas, sin eliminar participación activa. No se ha creado ninguna tarea programada.
4. Desplegar la función `surveys` únicamente en pruebas con la sección `verify_jwt = false` de `config.toml`; la función realiza autorización propia para acciones privadas. Configurar orígenes permitidos para la URL de pruebas si difiere de localhost:8000/str-ig.github.io. Apuntar `survey-api.js` al proyecto de pruebas y a su clave publicable para validar el correo real sin tocar producción.
5. Validar con administrador activo, usuario no administrador y visitante: prueba privada invisible y bloqueada por ID directo; código correcto/incorrecto/caducado/reutilizado; dos solicitudes concurrentes de voto; cierre concurrente; voto sin consentimiento y con consentimiento; denegación de RPC/tablas con claves públicas. No enviar correos reales a terceros durante estas pruebas.
6. La migración no necesita modificar políticas previas. Revisar también RLS de `committee_admins` y las funciones antiguas mediante asesores del proyecto: el repositorio no contiene su definición completa. La inspección local no certifica toda la configuración remota.

La verificación remota confirma el listado, la denegación de RPC a roles públicos y RLS en las tablas nuevas. El asesor de seguridad solo añade avisos informativos de RLS sin políticas, intencionados para denegar todo acceso directo. El correo real y la concurrencia multiconexión siguen pendientes. La autorización del usuario permite publicar la sección; no se ha activado ninguna encuesta pública.

## Validación local reproducible

* `node --test tests/surveys.test.mjs`: normalización, validación, HMAC y códigos.
* Instalar `@electric-sql/pglite@0.3.14` en una carpeta de herramientas de pruebas; definir `PGLITE_MODULE` con la ruta absoluta a su `dist/index.js`; ejecutar `node tests/surveys-database.mjs`. Ejecuta SQL real en PostgreSQL WASM aislado y prueba migración, ACL/RLS, prueba privada, caducidad, cinco intentos, reenvíos, duplicados, consentimiento y agregados. No sustituye las pruebas de concurrencia en PostgreSQL/Supabase de pruebas.
* `deno check supabase/functions/surveys/index.ts`: tipos de la función Edge; dependencias Supabase fijadas.
* `deno test --allow-env --lock=supabase/functions/surveys/deno.lock tests/surveys-edge.ts`: cliente Supabase real con frontera HTTP simulada; autorización, flags administrativos falsificados, código no devuelto, HMAC, consentimiento y errores de correo/configuración.
* Definir `PLAYWRIGHT_MODULE` con la ruta al paquete Playwright instalado; `node tests/surveys-browser.cjs`: servidor local y API simulada, Edge headless, anchos 320/390/768/1280, consentimiento activado/desactivado, fallo de correo, listado vacío, denegación administrativa, creación/activación/cierre/resultados y carga de la tarjeta. Guarda capturas fuera del repositorio (o en `SURVEY_SCREENSHOTS`).
* `node --experimental-vm-modules --test tests/*.test.mjs`: suite existente. Hay fallos anteriores en main; comparar con la misma revisión base y documentar los resultados en la PR.

Resultado en la base `27b0f4d`: main 360/370 pruebas correctas; rama 363/373 correctas, con los mismos diez fallos previos (reinicio de revisión, comunicados, navegación de Actualidad, tarjeta Estadísticas, justificantes, prueba del handler de horas extra, dos expectativas antiguas de caché y navegación sindical). Las pruebas nuevas de SQL, Edge y navegador pasan por separado. Comprobación visual realizada en móvil y escritorio; los servicios remotos siguen pendientes.
