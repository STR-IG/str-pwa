# Revisión mensual sin conservar nóminas

Preparado localmente el 25 de octubre de 2026. Pendiente de publicación.

La revisión utiliza `payroll-session.mjs`: imágenes, cifras y resultados permanecen en memoria de la página. La interfaz de almacenamiento que necesita el cálculo mensual ya no llama a Supabase Storage, tampoco en el contexto administrativo. Se mantiene la comparación de varios recibos del mismo mes con un único registro de jornada. No se persisten los ajustes salariales en localStorage.

El botón «Finalizar revisión y borrar datos temporales» cierra la sesión de documentos y recarga la página. Salir también cierra el almacén; volver desde la caché de navegación fuerza una recarga. Cerrar impide que una operación pendiente vuelva a introducir documentos. No se borran los originales del dispositivo.

Se retiran la entrada del historial y sus parches, la tarjeta de estadísticas, su inserción dinámica y el destino de acceso a estadísticas. La URL antigua muestra un aviso sin ejecutar consultas. Se incrementan las versiones de la entrada y la caché.

La autenticación y los registros técnicos de acceso siguen existiendo. Este cambio no significa que toda la app funcione sin servidores. Tampoco elimina objetos históricos, sus copias o las funciones y permisos de almacenamiento del backend: los clientes antiguos pueden seguir usándolos hasta actualizarse. La limpieza de datos históricos y el cierre de escrituras desde clientes antiguos quedan pendientes; no se han borrado documentos de usuarios en esta tarea.

Verificación: pruebas del almacén temporal, descarte e integración de entradas, más los flujos existentes de recibos, comparación mensual y lectura local. No se han utilizado nóminas reales ni publicado cambios.
