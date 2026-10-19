# Referencia visual de las cards STR

Referencia elegida por el usuario: `revisa-tu-nomina-card.webp`, convertida desde el PNG original del repositorio.

## Formato y composición

- Lienzo horizontal de 1536 × 1024 píxeles, proporción 3:2.
- Margen exterior claro y esquinas amplias y redondeadas.
- Escena fotográfica realista relacionada con la función de la card.
- Objetos que explican la función en primer plano; fondo secundario desenfocado.
- Degradado rojo desde la izquierda hacia el centro que permite leer el texto blanco.
- Título grande, en negrita, alineado a la izquierda y situado en la parte superior.
- Descripción breve debajo del título, con menor tamaño y el mismo eje de alineación.
- Indicador circular rojo con borde blanco en la esquina inferior derecha.
- Candado para accesos privados. Para accesos públicos, usar una flecha coherente con ese mismo estilo.
- Nota de imagen generada por IA en la esquina inferior izquierda cuando corresponda.

## Aplicación a futuras cards

Mantener proporción, márgenes, jerarquía, posición del texto, degradado e indicador. Adaptar la escena y el mensaje a cada función. Evitar texto adicional que compita con el título y revisar la legibilidad al tamaño real de móvil; los detalles de los documentos son decorativos.

El candado dibujado comunica acceso privado; el control de acceso debe seguir implementado en la aplicación.

## Exportación

- WebP, calidad 85 como punto de partida, con revisión visual antes de publicar.
- Esta conversión conserva 1536 × 1024 píxeles.
- PNG original: 1.908.678 bytes. WebP: 151.848 bytes. Reducción: 92 % aproximadamente.
- Objetivo orientativo para imágenes similares: 100–200 KB, ajustado según legibilidad y contenido.
- Conservar el original para futuras ediciones.
- Al sustituir un recurso en la app, actualizar también cualquier selector JavaScript que dependa de su nombre; actualmente `novedades.js` identifica esta card por el nombre del PNG.

Esta referencia no implica modificar automáticamente las demás cards.

## Medida de las flechas de la pantalla principal

Referencia aprobada: círculo de `card-votaciones.png`. Diámetro exterior aproximado del 10,5 % del ancho de la imagen: 162 px sobre un lienzo de 1536 px o 51 px sobre 480 px. Escalar proporcionalmente el borde blanco y la flecha; medir sobre el ancho visible de la card para mantener el mismo tamaño en pantalla. Esta medida sustituye las recomendaciones anteriores de tamaño para flechas. Permisos retribuidos adopta esta referencia. No modifica automáticamente los candados ni el resto de imágenes.
