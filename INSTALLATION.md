# Instalación desde el QR

El QR sigue apuntando a https://str-ig.github.io/str-pwa/. No hay redirecciones ni servicios adicionales.

- La primera pantalla ofrece dos botones grandes para elegir Android o iPhone, como en el flujo probado en la web de pruebas. Cada elección abre sus pasos y un botón «Volver» permite cambiar de guía. La portada completa sigue debajo para quien quiera continuar sin instalar.
- Android: la portada captura `beforeinstallprompt` y ofrece «Instalar STR-IG» solo cuando el navegador entrega ese evento. El diálogo requiere pulsar el botón; escanear el QR no puede instalar automáticamente. Si el evento tarda o no está disponible, se muestran los pasos del menú del navegador y cómo salir de un navegador integrado.
- iPhone/iPad: instrucciones de Safari → Compartir → Añadir a pantalla de inicio → Añadir, con «Abrir como app web» si aparece. Se incluye la URL para copiar en Safari. No se promete que un enlace web fuerce la apertura de Safari desde cualquier aplicación.
- La guía se oculta en modo standalone y tras `appinstalled`. El aviso inicial de notificaciones se reserva a la app instalada para que no tape la instalación; el control de avisos sigue disponible en la web.

## Revisión técnica

El manifest ya tenía nombre, identidad `/str-pwa/`, inicio `./`, modo standalone e iconos PNG de 192 y 512. Solo se explicita el scope `./` para conservar la ruta de GitHub Pages. Se mantienen los iconos y su identidad.

El service worker se registra en `./service-worker.js`, por tanto su ámbito es `/str-pwa/`. La política existente pide primero la red con `cache: no-store` y usa caché como respaldo. La portada y el nuevo script se obtienen actualizados al volver a cargar con conexión; no hace falta cambiar el worker para esta mejora. No se modifica su política de caché ni se garantiza disponibilidad completa sin conexión.

## Validación realizada (22 de octubre de 2026)

- GET público: portada, manifest, service worker y ambos iconos responden HTTP 200 con tipos adecuados.
- Chrome local con perfil normal: worker activo/controlando la portada bajo `/str-pwa/`; `Page.getInstallabilityErrors` sin errores; tamaños reales de los dos iconos correctos.
- Pruebas de interfaz en Chromium con identificación Android, iPhone Safari e iPhone integrado, y simulación de `navigator.standalone`: guía adecuada, sin desbordamiento horizontal a 390 px y oculta en modo instalado.
- Evento de instalación simulado: aceptación, cancelación, error y `appinstalled`; el evento se consume una sola vez, el botón se retira y quedan instrucciones manuales.
- Comprobación de sintaxis y `git diff --check` correctas.

La emulación no sustituye la instalación real en Android ni Safari/iOS. Antes de fusionar, comprobar en dispositivos físicos: QR → Chrome Android → instalar → abrir desde el icono; QR → Safari iPhone → Compartir → Añadir → abrir desde el icono; QR en una app integrada → seguir los pasos para abrir en Safari. Verificar que la guía desaparece en la app instalada. No se ha desplegado esta rama ni modificado producción.

## Repetir las pruebas

Con Node y Playwright instalados, ejecutar `node tests/install-browser.cjs`. Si Playwright no está en la resolución de paquetes, indicar su ruta mediante `PLAYWRIGHT_MODULE`; opcionalmente indicar Chrome/Chromium mediante `BROWSER_EXECUTABLE`. La prueba sirve el repositorio en localhost, bloquea peticiones externas (sin escrituras en APIs reales) y crea perfiles temporales y capturas en el directorio padre del repositorio.

Referencias: [criterios de Chrome](https://web.dev/articles/install-criteria), [instalación en Safari según Apple](https://support.apple.com/en-lamr/guide/iphone/iphea86e5236/ios).

## Revisión de la integración con la prueba validada

Se ha contrastado `str-pwa-pruebas/main` (commit `c1d1d337986cf405141b4e9d983db900b5facafb`) con esta rama. `install.js` es idéntico al probado (blob `cba7908699798e67ec27eaf1815c92510d93b996`). Se incorpora la guía a la portada completa; no se copia el index ni el worker simplificado del repositorio de pruebas.

La identidad oficial sigue siendo `/str-pwa/`, y `start_url: ./` resuelve a la portada oficial, con sus accesos públicos y privados. El manifest no contiene rutas a `str-pwa-pruebas`. Las pruebas comprueban estos accesos, el título STR-IG, la URL de inicio, el ámbito y script activo del worker, y que el aviso de notificaciones no tape la guía en una primera visita web. El modo instalado conserva la portada completa y oculta la guía.

Repetición local sobre el repositorio completo: pasan Android, iPhone Safari, iPhone integrado y modo instalado en Chrome, con servicios externos bloqueados. Se espera explícitamente a que termine la recarga inicial al tomar control el worker para evitar comprobar un documento aún vacío. Estas comprobaciones de iPhone son simulaciones en Chromium; la prueba física comunicada corresponde al sitio de pruebas y sigue pendiente repetirla con la integración oficial antes de fusionar.
