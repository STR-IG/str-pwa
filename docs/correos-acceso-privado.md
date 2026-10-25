# Alta de correo y envío manual

El panel de administración incluye «Usuarios del área privada». Guardar un correo lo añade activo a la lista existente sin enviar mensajes ni pedir nombre, teléfono o número de afiliado. Si ya existe, se conserva su ficha; un acceso inactivo no se reactiva de forma implícita.

Después del alta se muestra la vista previa. Los correos ya existentes se abren desde la lista y tienen el botón «Preparar correo de acceso». Solo «Enviar correo de acceso» llama al servicio de envío. El remitente es `STR-IG <acceso@str-ig.es>`, usando la configuración de Resend existente. No se ha enviado ningún correo real al desarrollar o desplegar esta función.

`manage-private-access` valida el JWT mediante Auth y comprueba el administrador activo en `committee_admins` antes de procesar altas o envíos. El servidor fija destinatario autorizado, remitente y texto; no acepta mensajes arbitrarios. No se añade ninguna tabla o campo ni se altera la configuración de RLS.

Un bloqueo de interfaz evita dobles pulsaciones. Los reintentos de una solicitud reutilizan una clave de idempotencia de Resend. El indicador de envío refleja la aceptación del proveedor, no una confirmación de lectura o entrega. El estado y la clave se conservan solo durante la visita; una recarga puede iniciar una nueva solicitud. No se crea un historial adicional de envíos en Supabase.

Verificación: seis pruebas de autenticación, autorización, altas sin envío, accesos inactivos, contenido fijado en servidor, idempotencia y fallos del proveedor; pruebas existentes del panel y contactos. Prueba en Edge a 390 px con usuarios ficticios: alta sin envío, vista previa, envío solo al pulsar, doble clic bloqueado, acceso inactivo y ausencia de desbordamiento. La función desplegada responde a OPTIONS y rechaza POST sin sesión. El envío real queda para la prueba que realizará el usuario.

## Retirar autorización

La ficha incluye «Borrar usuario autorizado». Un diálogo muestra el correo y permite cancelar antes de borrar. La confirmación llama a la acción administrativa `delete` existente en `manage-affiliates`, que valida sesión y rol y verifica que se ha eliminado una fila de la lista de acceso. No borra cuentas de Auth ni registros técnicos, ni garantiza cerrar inmediatamente sesiones ya abiertas. No se han eliminado usuarios reales durante el desarrollo o publicación. La prueba de navegador con usuarios ficticios verifica cancelación sin petición, destinatario correcto, doble pulsación bloqueada y retirada de la lista tras confirmar.
