# Encuestas STR-IG

## Estado de producción

La encuesta meteorológica usa desde la versión 2.0 un modelo de **contadores marginales fijos**:

- no existe una tabla de respuestas individuales;
- no se pregunta la modalidad de trabajo;
- no se calculan cruces entre preguntas;
- cada envío actualiza todas las filas de contador del sondeo en una única sentencia: suma 1 a las opciones elegidas y 0 a las demás;
- la huella HMAC del correo se conserva en una tabla separada, sin opción elegida;
- la encuesta se puede cerrar manualmente y se bloquea automáticamente a los 60 días desde su primera publicación;
- las huellas de participación se eliminan 15 días después del cierre;
- los resultados reales no se muestran mientras la encuesta está abierta, no se muestra el total si hay menos de 10 participaciones y se omite una pregunta completa si alguna opción tiene de 1 a 4 respuestas.

La encuesta meteorológica no tiene casilla ni tabla de consentimiento para comunicaciones laborales. Las encuestas simples mantienen su casilla opcional independiente.

## Flujo meteorológico

1. La persona introduce un correo personal. El servidor rechaza `grifols.com` y sus subdominios.
2. La función Edge normaliza el correo, calcula una huella HMAC y solicita a Resend un código de seis cifras.
3. El código caduca a los 5 minutos. Tras validarlo se emite un permiso opaco de 30 minutos.
4. El navegador envía el permiso y las respuestas. La base valida todas las preguntas y opciones.
5. En una transacción se inserta la huella de participación y se actualizan todos los contadores fijos. No se inserta ningún registro con el conjunto de respuestas.
6. Se consumen los permisos y desafíos restantes del correo.

La actualización conjunta evita que `xmin`, `ctid` o el orden de inserción señalen una opción concreta. No impide que una persona con acceso privilegiado que observe los contadores justo antes y después de un único envío deduzca el cambio; por ello no se promete anonimato absoluto y deben limitarse los accesos al editor SQL.

## Tablas meteorológicas

- `weather_surveys`: definición, estado, apertura y cierre.
- `weather_counters`: filas fijas `survey_id × question_id × option_label × is_test` y una fila especial de total. No contiene correo, huella, permiso, identificador de participante ni marca de tiempo.
- `weather_participation`: `survey_id`, huella HMAC e indicador de prueba.
- `weather_challenges`: código y correo en forma de huella, con caducidad.
- `weather_permits`: permiso y correo en forma de huella, con caducidad.
- `weather_limits`: controles temporales de envío.
- `weather_test_retention`: fecha de purga de pruebas abandonadas.

No deben volver a crearse tablas `weather_responses`, `weather_answers` ni equivalentes.

## Conservación

| Dato | Plazo o criterio |
|---|---|
| Código meteorológico | 5 minutos; purga periódica |
| Permiso de envío | 30 minutos; purga periódica |
| Límites técnicos | Hasta 1 hora |
| Huella de participación | Mientras esté abierta y 15 días desde el cierre |
| Apertura meteorológica | Aviso administrativo a los 30 días; bloqueo automático a los 60 |
| Pruebas | Se limpian al publicar y, si se abandonan, a los 30 días |
| Contadores agregados | Se conservan para documentar resultados |
| Límites de encuestas simples | 15 días de inactividad |

El cron ejecuta `survey_private.weather_purge_expired()` cada minuto.

## Proveedores

- Supabase: proyecto `STR-IG-APP`, región `eu-west-3` (París), plan Free. El plan permite consultar un día de logs y no incluye PITR, Log Drains ni copias diarias automáticas recuperables por el cliente.
- Resend: envía los códigos. Sus términos estándar indican 30 días de conservación de correo y registros y 7 días de copias de seguridad.
- GitHub Pages: aloja la interfaz estática y registra la IP de visita por motivos de seguridad.

El aviso público vigente es `docs/aviso-privacidad-encuestas-str-v2.0.pdf`; la ruta estable `docs/aviso-privacidad-encuestas-str.pdf` contiene la misma versión.

## Comprobaciones obligatorias antes de cambios futuros

1. Confirmar que la encuesta está en `solo_admin` y que no existen participaciones reales.
2. Comprobar que no existen tablas de respuestas individuales ni columnas de consentimiento meteorológico.
3. Verificar que todas las filas de `weather_counters` cambian de `xmin` en una misma prueba.
4. Confirmar que `anon` y `authenticated` no tienen privilegios directos sobre las tablas privadas.
5. Revisar la tarea de purga, el límite de 60 días y la lista de personas con editor SQL.
6. Ejecutar los asesores de seguridad y rendimiento después de cada migración.

