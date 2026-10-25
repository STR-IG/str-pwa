export function privateAccessMessage(affiliate) {
  const email = String(affiliate?.email || '').trim();
  if (affiliate?.active === false || !/^[^\s@<>?,;:\r\n]+@[^\s@<>?,;:\r\n]+\.[^\s@<>?,;:\r\n]+$/.test(email)) {
    throw new Error('El correo debe tener un acceso activo y una dirección válida.');
  }
  const subject = 'Ya tienes acceso al área privada de STR';
  const body = `Hola:

Hemos autorizado este correo para acceder al área privada de la app de STR y utilizar «Calcula tu V» y «Revisa tu nómina».

No es necesario estar afiliado a STR. La autorización de acceso no implica afiliación sindical.

Para entrar, introduce este mismo correo en la app y recibirás un código temporal de seis dígitos.

TU PRIVACIDAD

Las imágenes se procesan en tu dispositivo, sin enviarlas a servicios externos de inteligencia artificial.

En «Revisa tu nómina», las imágenes, cifras y resultados se utilizan únicamente durante la sesión, sin guardarse en el servidor. Se descartan al finalizar la revisión mediante el botón de borrado o al salir. No se conserva un historial ni se elaboran estadísticas salariales.

En «Calcula tu V», las cifras que confirmas se envían al servidor para realizar el cálculo, sin guardarse como historial. Puedes borrar las capturas temporales, las cifras y el resultado con el botón de borrado. Se conserva un registro mínimo de uso para impedir repetir el cálculo del mismo período.

Para gestionar el acceso se conserva tu correo autorizado y la información técnica necesaria para la cuenta y las sesiones.

Acceder a la app de STR:
https://str-ig.github.io/str-pwa/app.html

Un saludo,
Sección sindical STR`;
  return {
    email, subject, body,
    mailto: `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body.replace(/\n/g, '\r\n'))}`
  };
}
