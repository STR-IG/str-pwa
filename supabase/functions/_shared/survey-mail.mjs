export const SURVEY_PRIVACY_URL = 'https://str-ig.github.io/str-pwa/docs/aviso-privacidad-encuestas-str.pdf?v=20261030-2';

export function surveyCodeMessage(
  code,
  { minutes = 10, subject = 'Tu código para participar en la encuesta de STR' } = {},
) {
  if (!/^\d{6}$/.test(String(code))) throw new Error('INVALID_CODE');
  const text = `Encuesta STR

Tu código de verificación es: ${code}

Introdúcelo en la app de STR para participar. Caduca en ${minutes} minutos y solo puede usarse una vez.

Tu voto se añade a un recuento por opción. El control de participación se guarda por separado, mediante una huella del correo, sin la opción elegida.

Si no has pedido este código, ignora este mensaje. No compartas el código.

Información de privacidad: ${SURVEY_PRIVACY_URL}
Contacto para privacidad y ejercicio de derechos: str.ig@str.es

Sección sindical de STR en Instituto Grifols`;
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;line-height:1.6;color:#222">
<h2>Encuesta STR</h2>
<p>Tu código de verificación es:</p>
<p style="font-size:32px;font-weight:bold;letter-spacing:6px">${code}</p>
<p>Introdúcelo en la app de STR para participar. <strong>Caduca en ${minutes} minutos</strong> y solo puede usarse una vez.</p>
<p>Tu voto se añade a un recuento por opción. El control de participación se guarda por separado, mediante una huella del correo, sin la opción elegida.</p>
<p>Si no has pedido este código, ignora este mensaje. No compartas el código.</p>
<p><a href="${SURVEY_PRIVACY_URL}">Información de privacidad de las encuestas</a></p>
<p>Contacto para privacidad y ejercicio de derechos: <a href="mailto:str.ig@str.es">str.ig@str.es</a></p>
<p>Sección sindical de STR en Instituto Grifols</p>
</div>`;
  return { subject, text, html };
}
