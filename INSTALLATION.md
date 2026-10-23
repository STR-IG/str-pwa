# Instalación de STR-IG desde el QR

La URL de los carteles se conserva: https://str-ig.github.io/str-pwa/.

La portada de instalación ofrece Android e iPhone. Android consume beforeinstallprompt cuando está disponible, con instrucciones manuales como alternativa. iPhone abre una guía completa con imágenes, copia y alternativa manual. El enlace copiado añade ?install=iphone; al abrirlo en Safari muestra directamente el paso Compartir, con los tres puntos y las opciones señaladas.

El manifest conserva id /str-pwa/, nombre e iconos oficiales. Su scope es ./ y start_url es ./app.html. app.html contiene la portada completa que había en producción antes de esta integración. Las visitas a index en modo standalone redirigen a esa portada conservando query y fragmento, para mantener las instalaciones existentes. El service worker conserva la política oficial de red primero y cambia solo la versión de caché.

Las imágenes evitan nombres o enlaces de la app de pruebas. Las referencias de Compartir y de confirmación son ilustraciones orientativas; su posición puede variar según iOS.

## Validación

El usuario confirmó en dispositivos físicos que iPhone y Android se instalan en el sitio de pruebas y que el icono abre la app completa. La integración oficial repite las comprobaciones de interfaz a 320 y 390 px: imágenes cargadas, copia y error de portapapeles, entrada por ?install=iphone sin selector, volver, prompt Android y entrada instalada. Los servicios externos se bloquean durante las pruebas; no se realizan escrituras reales.

Ejecutar node tests/install-browser.cjs con Playwright instalado. PLAYWRIGHT_MODULE permite indicar el módulo y BROWSER_EXECUTABLE un Chrome/Chromium local. Las capturas se guardan en el directorio temporal. La prueba de interfaz simula los eventos de instalación y standalone; no sustituye la instalación física ni comprueba instalabilidad del navegador real. Verificar el despliegue público y repetir el QR de un cartel tras publicar.
