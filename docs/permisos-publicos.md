# Permisos públicos

La card `card-permisos-retribuidos.png` abre `permisos-publicos.html`, que reúne fichas libres y consultas guiadas. Los antiguos enlaces `preguntale-*.html` también funcionan sin autenticación y no cierran la sesión del área privada.

Las seis funciones `answer-*` comparten un máximo de dos respuestas de IA por navegador y mes natural, calculado en Europe/Madrid. Matrimonio y emergencia climática no llaman a IA y no consumen saldo. Las fichas no usan el contador.

No se pide correo ni se utiliza la condición de afiliado. Se guarda una clave aleatoria de 256 bits en localStorage; el servidor guarda únicamente su hash, mes, identificador de reserva y estado. No se guarda el cuestionario ni la respuesta en la tabla del cupo. Borrar el almacenamiento o cambiar de navegador permite obtener otro cupo: este mecanismo no constituye un límite por persona ni protección contra abuso automatizado.

El servidor reserva una plaza de forma atómica antes de procesar una consulta y confirma su consumo solo al obtener orientación. Los fallos liberan la reserva y las reservas abandonadas expiran a los cinco minutos. La llamada a IA tiene un tiempo máximo de 25 segundos. Los clientes no pueden leer ni modificar la tabla ni ejecutar la función SQL del contador.

## Activación en producción

1. Aplicar `supabase/schema/permit-query-quota.sql` a la base del proyecto. Aplicado y verificado en producción.
2. Desplegar `permit-query-quota` y los seis `answer-*` con sus dependencias `_shared/permit-quota.ts` y `_shared/permit-quota-core.js`. El archivo `supabase/config.toml` configura `verify_jwt = false` para estas funciones; usan la clave anónima del navegador y el contador del servidor. No cambiar la autenticación de las demás funciones.
3. Publicar los archivos web juntos, incluida la nueva card, el módulo `permisos-consultas.js` y el service worker v50. Durante una publicación parcial, los clientes antiguos de IA pueden requerir recargar la página.
4. Comprobar en producción: fichas sin sesión, saldo inicial de dos, dos respuestas y tercera bloqueada con HTTP 429; error de IA sin consumo. No enviar datos personales para probar.

## Verificación local

- `node --test tests/permit-quota.test.mjs tests/permit-functions.test.mjs`
- Con `PGLITE_MODULE` apuntando al módulo instalado `@electric-sql/pglite`: `node tests/permit-quota-db.mjs`.
- Recorridos del navegador comprobados con Edge: apertura pública de los 44 cuestionarios/menús, diseño móvil y escritorio y consulta de traslado con API simulada.

## Comprobación en producción

El contador y los siete endpoints se han desplegado. Con un identificador exclusivo de prueba y un caso ficticio de traslado, se obtuvieron dos respuestas HTTP 200 (saldo 1 y 0) y un tercer intento HTTP 429 MONTHLY_LIMIT_REACHED. La publicación web se realiza sobre la última versión de main para conservar los cambios ajenos.

