# Retirada del almacenamiento documental en Supabase

Aplicado el 27/10/2026 al proyecto STR-IG-APP (icneigdnuntzugisexaz).

Antes y después: payroll-documents contiene 0 objetos y 0 subidas multipart pendientes. No había documentos activos que borrar. No se han descargado ni copiado documentos personales.

Se han retirado las cuatro políticas de acceso anteriores. Una política restrictiva para todas las operaciones impide el acceso de clientes al contenedor, incluso si se añade otra política permisiva. El endpoint admin-payroll-documents v3 devuelve 410 sin leer el cuerpo ni utilizar claves privilegiadas o Storage. Esta protección está desplegada en producción; el contenedor vacío sigue existiendo. Las claves de servicio conservan sus privilegios técnicos: ninguna política RLS puede restringir un rol con BYPASSRLS.

Verificación directa: inserción sintética bajo el rol authenticated rechazada por permisos, dentro de una transacción revertida. Recuento final: 0 objetos y 0 multipart. No se han alterado los dos comunicados internos ni las cuentas o autorizaciones de acceso. v_calculation_usage solo conserva identificador, entorno, mes y fecha de uso; no contiene documentos ni cifras salariales y no se ha eliminado.

La revisión temporal y el límite al mes actual del frontend están preparados localmente y pendientes de publicar. Los clientes antiguos ya no pueden guardar documentos, pero pueden mostrar errores hasta actualizarse.

No se ha verificado ni eliminado contenido de respaldos históricos de Supabase ni copias de navegadores/dispositivos desconectados. No se afirma una supresión física de todas las copias históricas.

Publicación autorizada: frontend con periodo único del mes anterior, sin persistencia documental. Validación de 77 pruebas y pantalla móvil de 390 px con autenticación ficticia, selectores bloqueados y sin llamadas de datos salariales.
