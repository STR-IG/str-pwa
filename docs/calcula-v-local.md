# Calcula tu V: lectura local, borrado y uso por periodo

La herramienta lee las capturas con Tesseract en el dispositivo y ofrece revisión manual antes de calcular. También permite introducir las cifras sin seleccionar archivos. El navegador envía al cálculo determinista de Supabase los conceptos y números confirmados; no envía imágenes, nombres de archivo ni texto OCR completo. No utiliza servicios de IA para leer las nóminas.

El OCR solo sugiere filas conocidas con cantidades e importes legibles. Las filas repetidas o ambiguas se dejan sin sugerencia. El usuario revisa las tres nóminas anteriores y confirma cada una; un campo vacío no se interpreta como un valor leído de cero.

El botón de borrado libera archivos, URLs de vista previa, el editor de recorte, las cifras introducidas y el resultado de esta pantalla. Los archivos originales del dispositivo y las nóminas de la revisión mensual no se eliminan desde esta herramienta. Las capturas de Calcula tu V no tienen un archivo independiente persistido en Supabase que haya que borrar.

## Una comprobación por mes

Se conserva el control existente en `v_calculation_usage`: UUID de cuenta, entorno, mes de la V y fecha de cálculo. No contiene capturas ni importes. Su clave primaria `(user_id, environment, v_month)` impide que dos cálculos válidos del mismo usuario y mes consuman dos usos o devuelvan dos resultados satisfactorios.

La nueva operación `action: status` de `calculate-v-payrolls` consulta únicamente el marcador del usuario autenticado para el periodo solicitado. No consume un uso ni permite borrar la marca. Se mantiene la comprobación de afiliación activa y la excepción administrativa existente. No se han cambiado los criterios aritméticos de cálculo ni la estructura de la tabla.

Borrar documentos o el historial mensual no borra este marcador. La interfaz consulta su estado al seleccionar el mes, tras calcular y después de borrar las capturas. Un fallo o una pérdida de conexión obliga a comprobar de nuevo el servidor antes de reintentar. El bloqueo no depende de localStorage: persiste al recargar o utilizar otro dispositivo con la misma cuenta.

La limitación sigue siendo por mes de la V, como antes; no es un veto de por vida a todos los meses. El borrado integral de una cuenta de Auth afecta a su marcador por la relación de base de datos existente; no hay una operación de eliminación de cuenta ofrecida por este flujo.

## Retirada de endpoints antiguos

`read-v-payroll`, `lab-read-v-payroll`, `calculate-v` y `lab-calculate-v` responden con HTTP 410 y una indicación de actualizar la app. No procesan el contenido de la petición, no llaman a IA ni permiten eludir el endpoint actual. Esto también impide que un cliente antiguo siga usando esos lectores de imágenes.

## Verificación

Pruebas con datos ficticios: OCR local simulado, revisión de números, confirmación y cancelación, cálculo correcto, dos solicitudes simultáneas, borrado y bloqueo al recargar el mismo mes, disponibilidad de otro periodo, errores de autorización y de almacenamiento y retirada de lectores antiguos. No se han calculado V reales ni eliminado documentos reales para probar el cambio. La precisión de OCR debe seguir contrastándose con capturas ficticias representativas del formato utilizado.
