# Consulta pública de deber inexcusable

La nueva card en `preguntale-str-permisos.html` reutiliza `card-deber-inexcusable.png`. No se modifican `permisos.html`, la imagen, `permiso-deber-inexcusable.html` ni su ficha gráfica para este trabajo.

## Arquitectura reutilizada

- `permisos-consultas.js`: acceso público, `permitFetch`, identificador anónimo del navegador, saldo y mensajes de error.
- `_shared/permit-quota.ts` y `permit-quota-core.js`: reserva, límite mensual compartido de dos consultas y devolución de crédito ante errores.
- Misma API OpenAI Responses, secreto `OPENAI_API_KEY`, modelo `gpt-5.4-mini`, `store:false`, razonamiento bajo, identificador de seguridad y respuesta JSON estructurada que los otros permisos. Máximo de 900 tokens y timeout de 25 segundos.
- Supabase Auth y RPC `is_current_user_private_access_allowed` para el estado del botón; en el envío se verifica el token con `getUser` y se consulta de nuevo `private_access_allowlist.active` en el servidor. Nunca se autoriza mediante datos editables del usuario.
- `committee_admins.active` y panel de administración existentes para consultar la bandeja privada. No se envían correos ni notificaciones automáticas.
- `public-duty.js` comparte opciones y validación entre navegador y servidor; está en la raíz para que GitHub Pages pueda servirlo también con Jekyll.

La orientación distingue el deber público y personal general del deber electoral. Para el primero aplica el art. 37.3.d ET y, cuando corresponda, el art. 50.7 del XXI Convenio colectivo de la industria química, incluido el turno nocturno previo si la citación es antes de las 14:00. Para procesos electorales consulta la LOREG (arts. 28.1, 76.4 y 78.4) y el RD 605/1999 (art. 13): separa el permiso de mesa/interventoría/apoderamiento/voto, y limita la reducción de cinco horas del día siguiente a los supuestos respaldados por la norma. La interfaz recoge la función electoral, turno anterior/coincidente y jornada del día natural posterior. Se citan las fuentes BOE en la respuesta. Los campos libres se tratan como datos, no como instrucciones; el contenido de la IA se muestra como texto y se valida antes de completar el crédito.

## Preparación de producción

Estos cambios de código no publican la PWA ni despliegan automáticamente Supabase.

1. Aplicar `supabase/schema/permit-cases.sql` al proyecto existente. La tabla tiene RLS y no concede acceso directo a `anon` ni `authenticated`; solo las funciones acceden con la clave de servidor.
2. Desplegar `answer-public-duty` y `submit-permit-case` con los módulos importados, incluido **`public-duty.js` de la raíz** y los módulos de cuota existentes. Mantener `verify_jwt=false` según `supabase/config.toml`: el primer endpoint es público y el segundo valida sesión y afiliación dentro del handler. Reutilizar los secretos existentes, sin añadir claves al cliente.
3. Publicar los HTML y JS cambiados mediante el mecanismo habitual de la PWA. El service worker existente carga primero desde la red y no requiere una lista nueva de recursos.
4. Confirmar con un caso de prueba que la bandeja «Consultas de permisos» del panel de administración recibe el caso. Solo usuarios con `committee_admins.active=true` pueden leerla. Muestra los 100 últimos casos y permite actualizar.

La bandeja guarda las respuestas y la orientación aportada por la persona, asociadas al usuario verificado y a su correo. La orientación se identifica como automática y pendiente de revisión por STR; no se trata como una decisión jurídica ni como contenido firmado por el servidor. Los reintentos con el mismo identificador no crean duplicados. El envío es una acción explícita del usuario, no consume créditos de IA y no exige subir documentos.

## Prueba manual de los tres estados

Después de desplegar las funciones y preparar la tabla:

1. **Público/sin sesión:** abrir en ventana privada, entrar en Consulta tu caso y pulsar Deber inexcusable. Completar los seis pasos, incluyendo una citación a las 10:00 y jornada 08:00–16:00. Comprobar los cinco apartados y «Iniciar sesión para enviar tu caso a STR». La consulta no debe requerir sesión. Iniciar sesión con una cuenta de prueba afiliada debe devolver al resultado sin volver a consumir un crédito.
2. **Autenticado no afiliado:** usar una cuenta de prueba con sesión válida cuyo correo no tenga entrada activa en `private_access_allowlist`. Si el acceso OTP solo admite afiliados, iniciar primero sesión con una cuenta de prueba y desactivar únicamente su entrada de prueba, conservando la sesión. No modificar cuentas reales. Consultar de nuevo: debe aparecer únicamente «El envío directo de consultas al equipo de STR está disponible para personas afiliadas.» en el área de envío, sin botón. Una llamada directa al endpoint con ese token debe devolver 403. El análisis automático sigue siendo público.
3. **Afiliado:** usar una cuenta de prueba con entrada activa. Tras obtener orientación, debe aparecer «Enviar mi caso a STR». Pulsar y comprobar la confirmación, después abrir el panel con una cuenta administradora y verificar los datos del caso en «Consultas de permisos». Recargar el resultado y comprobar que no permite duplicar el mismo envío. Si se revoca la afiliación después de mostrar el botón, el servidor debe rechazar el envío.

En los tres estados comprobar el botón superior de volver, «Volver al paso anterior», regreso a la lista y al inicio, y ausencia de «Afíliate a STR» en el flujo. Probar un deber general con una citación judicial a las 08:00 y turno nocturno 18:00–06:00, además de descanso, jornada partida y documentación pendiente. Probar por separado presidente/a o vocal de mesa, interventor/a, apoderado/a y solo votar, con los turnos del día de votación y del día natural siguiente. Verificar que solo mesa e interventoría reciben la regla de reducción de cinco horas, que el permiso general de tiempo indispensable no se confunde con los derechos electorales y que turnos que cruzan medianoche no se tratan como un turno de mañana convencional. Si falta hora o turno, la orientación debe pedir el dato y no concluir el horario exacto. Agotar los créditos: el mensaje y el enlace a Guía rápida deben coincidir con los demás permisos. Un fallo de IA no debe consumir una consulta completada.

## Verificación automatizada

`node --experimental-vm-modules --test tests/public-duty.test.mjs tests/permit-functions.test.mjs tests/permit-quota.test.mjs tests/admin-panel.test.mjs tests/service-worker-update.test.mjs`

`tests/public-duty-browser.mjs` usa Playwright con API y autenticación simuladas para los tres estados, seis pasos, navegación hacia atrás, restauración del resultado sin otra consulta, envío, ausencia de promoción de afiliación y ancho móvil. Configurar `PLAYWRIGHT_PACKAGE` si no está instalado en el proyecto y opcionalmente `PLAYWRIGHT_CHANNEL=msedge`.

Las pruebas simuladas no acreditan despliegue ni recepción real en producción.
