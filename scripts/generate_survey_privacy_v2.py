from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    PageBreak,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "docs" / "aviso-privacidad-encuestas-str-v2.0.pdf"

RED = colors.HexColor("#b5121b")
DARK = colors.HexColor("#252525")
MUTED = colors.HexColor("#686868")
LIGHT = colors.HexColor("#f5f2f2")
BORDER = colors.HexColor("#ddd7d7")

pdfmetrics.registerFont(TTFont("DejaVu", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"))
pdfmetrics.registerFont(TTFont("DejaVu-Bold", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"))
pdfmetrics.registerFontFamily(
    "DejaVu",
    normal="DejaVu",
    bold="DejaVu-Bold",
    italic="DejaVu",
    boldItalic="DejaVu-Bold",
)

styles = getSampleStyleSheet()
styles.add(ParagraphStyle(
    name="TitleSTR",
    parent=styles["Title"],
    fontName="DejaVu-Bold",
    fontSize=24,
    leading=28,
    textColor=DARK,
    alignment=TA_CENTER,
    spaceAfter=6,
))
styles.add(ParagraphStyle(
    name="VersionSTR",
    parent=styles["Normal"],
    fontName="DejaVu-Bold",
    fontSize=10.5,
    leading=14,
    textColor=RED,
    alignment=TA_CENTER,
    spaceAfter=16,
))
styles.add(ParagraphStyle(
    name="HeadingSTR",
    parent=styles["Heading2"],
    fontName="DejaVu-Bold",
    fontSize=14,
    leading=17,
    textColor=RED,
    spaceBefore=10,
    spaceAfter=5,
))
styles.add(ParagraphStyle(
    name="BodySTR",
    parent=styles["BodyText"],
    fontName="DejaVu",
    fontSize=9.4,
    leading=13,
    textColor=DARK,
    spaceAfter=6,
))
styles.add(ParagraphStyle(
    name="SmallSTR",
    parent=styles["BodyText"],
    fontName="DejaVu",
    fontSize=8.4,
    leading=11.2,
    textColor=DARK,
    spaceAfter=4,
))
styles.add(ParagraphStyle(
    name="BulletSTR",
    parent=styles["BodyText"],
    fontName="DejaVu",
    fontSize=9.2,
    leading=12.7,
    textColor=DARK,
    leftIndent=12,
    firstLineIndent=-8,
    bulletIndent=2,
    spaceAfter=3,
))


def footer(canvas, doc):
    canvas.saveState()
    width, _ = A4
    canvas.setStrokeColor(BORDER)
    canvas.setLineWidth(0.5)
    canvas.line(18 * mm, 15 * mm, width - 18 * mm, 15 * mm)
    canvas.setFont("DejaVu", 7.8)
    canvas.setFillColor(MUTED)
    canvas.drawString(18 * mm, 9.5 * mm, "STR - Aviso de privacidad de encuestas v2.0")
    canvas.drawRightString(width - 18 * mm, 9.5 * mm, f"Página {doc.page}")
    canvas.restoreState()


doc = BaseDocTemplate(
    str(OUTPUT),
    pagesize=A4,
    rightMargin=18 * mm,
    leftMargin=18 * mm,
    topMargin=17 * mm,
    bottomMargin=20 * mm,
    title="Aviso de privacidad de las encuestas de STR v2.0",
    author="Sindicato de Trabajadores (STR)",
    subject="Privacidad de encuestas con contadores marginales",
)
frame = Frame(
    doc.leftMargin,
    doc.bottomMargin,
    doc.width,
    doc.height,
    leftPadding=0,
    rightPadding=0,
    topPadding=0,
    bottomPadding=0,
)
doc.addPageTemplates(PageTemplate(id="normal", frames=[frame], onPage=footer))

story = [
    Paragraph("Aviso de privacidad de las encuestas de STR", styles["TitleSTR"]),
    Paragraph("Versión 2.0 - 8 de noviembre de 2026", styles["VersionSTR"]),
    Paragraph("Lo esencial", styles["HeadingSTR"]),
]

essential = [
    "<b>Responsable:</b> Sindicato de Trabajadores (STR), que gestiona las encuestas a través de su Sección Sindical en Instituto Grifols. Contacto: str.ig@str.es.",
    "<b>Verificación:</b> usamos un correo personal para enviar un código y generar una huella HMAC que limita la participación a una por dirección. No comprobamos identidad, relación laboral ni afiliación.",
    "<b>Respuestas:</b> cada opción incrementa un contador marginal fijo. No se guarda una fila con las respuestas de una persona, no se pregunta la modalidad de trabajo y no se cruzan preguntas.",
    "<b>Plazo:</b> la encuesta meteorológica puede cerrarse antes y se bloquea como máximo a los 60 días de abrirse. La huella se elimina 15 días después del cierre.",
    "<b>Límite:</b> no se garantiza anonimato absoluto. Un acceso técnico privilegiado que compare contadores antes y después de un envío podría inferir una respuesta reciente.",
]
for item in essential:
    story.append(Paragraph("- " + item, styles["BulletSTR"]))

story += [
    Paragraph("1. Responsable y contacto", styles["HeadingSTR"]),
    Paragraph(
        "El Sindicato de Trabajadores (STR) determina los fines y los medios esenciales de estas encuestas y las gestiona a través de su Sección Sindical en Instituto Grifols. Domicilio: Carrer del Metge Fortuny 2, 1.ª planta, 43201 Reus (Tarragona). Para consultas de privacidad y ejercicio de derechos: <b>str.ig@str.es</b>.",
        styles["BodySTR"],
    ),
    Paragraph(
        "La encuesta no se comunica a la empresa para sus propios fines. El acceso se limita a las personas autorizadas que administran la aplicación y a los proveedores técnicos necesarios en los términos indicados en este aviso.",
        styles["BodySTR"],
    ),
    Paragraph("2. Finalidades y bases jurídicas", styles["HeadingSTR"]),
    Paragraph(
        "<b>Enviar y verificar un código de un solo uso, limitar la participación por correo verificado y prevenir abusos.</b> Base jurídica: interés legítimo de STR en proteger la integridad de la consulta y reducir duplicidades, artículo 6.1.f del RGPD.",
        styles["BodySTR"],
    ),
    Paragraph(
        "<b>Recoger opciones y elaborar resultados agregados.</b> Base jurídica: interés legítimo de STR en conocer opiniones sobre cuestiones laborales y desarrollar su actividad representativa, artículo 6.1.f del RGPD. La participación es voluntaria y puede ejercerse oposición por motivos relacionados con la situación particular.",
        styles["BodySTR"],
    ),
    Paragraph(
        "La encuesta meteorológica no solicita consentimiento para comunicaciones laborales. En una encuesta simple distinta puede aparecer una casilla opcional; solo en ese caso el correo se incorpora a una lista separada sobre la base del consentimiento, artículo 6.1.a del RGPD, y puede retirarse en cualquier momento.",
        styles["BodySTR"],
    ),
    PageBreak(),
    Paragraph("3. Datos utilizados y funcionamiento", styles["HeadingSTR"]),
    Paragraph(
        "Tratamos el correo personal introducido para enviar el código; huellas HMAC-SHA-256 del correo y, temporalmente, de la dirección de red; hashes del código y del permiso; datos técnicos necesarios para limitar envíos; y los contadores por pregunta y opción. Se rechazan direcciones de grifols.com y sus subdominios. La verificación acredita acceso al buzón, no identidad, relación laboral, afiliación ni que una persona carezca de otros correos.",
        styles["BodySTR"],
    ),
    Paragraph(
        "En la encuesta meteorológica no hay campos de texto libre ni pregunta sobre modalidad de trabajo. La base contiene filas fijas de contador. En cada envío se actualizan todas esas filas en una sola sentencia: se suma 1 a las opciones elegidas y 0 a las demás. No se conserva un registro que reúna las respuestas de una persona ni se elaboran cruces entre preguntas.",
        styles["BodySTR"],
    ),
    Paragraph(
        "El código caduca a los 5 minutos. Tras verificarlo se usa un permiso opaco, válido durante 30 minutos, para enviar las opciones sin volver a incluir el correo. Supabase procesa las opciones durante la ejecución necesaria para incrementar los contadores, pero la aplicación no las escribe en una tabla individual ni registra cuerpos de petición.",
        styles["BodySTR"],
    ),
    Paragraph("4. Separación de datos y límites", styles["HeadingSTR"]),
    Paragraph(
        "La huella de participación se guarda separada de los contadores y no contiene la opción elegida. La misma transacción registra que se produjo una participación y actualiza todos los contadores, por lo que sus metadatos no señalan una opción concreta. La huella es un dato seudonimizado, no anónimo.",
        styles["BodySTR"],
    ),
    Paragraph(
        "No se promete anonimato absoluto. Una persona con acceso privilegiado al editor SQL, al entorno de ejecución o a registros técnicos podría comparar el estado inmediatamente anterior y posterior a una participación aislada y deducir el cambio. Los proveedores también tratan metadatos técnicos según su servicio. Los resultados reales permanecen ocultos mientras la encuesta está abierta; con menos de 10 participaciones no se muestra el total, y se omite una pregunta completa si alguna opción tiene de 1 a 4 respuestas.",
        styles["BodySTR"],
    ),
    Paragraph("5. Conservación y cierre", styles["HeadingSTR"]),
]

rows = [
    [Paragraph("<b>Dato</b>", styles["SmallSTR"]), Paragraph("<b>Plazo o criterio</b>", styles["SmallSTR"])],
    [Paragraph("Código", styles["SmallSTR"]), Paragraph("5 minutos; después se elimina mediante la purga periódica.", styles["SmallSTR"])],
    [Paragraph("Permiso de envío", styles["SmallSTR"]), Paragraph("30 minutos; se consume al responder o se elimina al caducar.", styles["SmallSTR"])],
    [Paragraph("Límites técnicos", styles["SmallSTR"]), Paragraph("Hasta 1 hora en la encuesta meteorológica.", styles["SmallSTR"])],
    [Paragraph("Huella de participación", styles["SmallSTR"]), Paragraph("Mientras la encuesta está abierta y 15 días desde el cierre efectivo.", styles["SmallSTR"])],
    [Paragraph("Encuesta meteorológica", styles["SmallSTR"]), Paragraph("Aviso administrativo a los 30 días y bloqueo automático a los 60 días desde la primera apertura. Puede cerrarse antes.", styles["SmallSTR"])],
    [Paragraph("Pruebas", styles["SmallSTR"]), Paragraph("Se eliminan antes de publicar; las abandonadas se purgan a los 30 días.", styles["SmallSTR"])],
    [Paragraph("Contadores", styles["SmallSTR"]), Paragraph("Se conservan para documentar resultados agregados. No contienen respuestas individuales.", styles["SmallSTR"])],
    [Paragraph("Encuestas simples", styles["SmallSTR"]), Paragraph("Las huellas usadas para limitar envíos se eliminan tras 15 días de inactividad; la huella de participación, 15 días después del cierre.", styles["SmallSTR"])],
]
table = Table(rows, colWidths=[48 * mm, 111 * mm], repeatRows=1, hAlign="LEFT")
table.setStyle(TableStyle([
    ("BACKGROUND", (0, 0), (-1, 0), RED),
    ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
    ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ("GRID", (0, 0), (-1, -1), 0.35, BORDER),
    ("BACKGROUND", (0, 1), (-1, -1), colors.white),
    ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, LIGHT]),
    ("LEFTPADDING", (0, 0), (-1, -1), 6),
    ("RIGHTPADDING", (0, 0), (-1, -1), 6),
    ("TOPPADDING", (0, 0), (-1, -1), 5),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
]))
story += [
    table,
    Spacer(1, 4 * mm),
    Paragraph(
        "El proyecto Supabase está en el plan Free: la consola permite consultar un día de logs y el plan no incluye PITR, Log Drains ni copias diarias automáticas recuperables por el cliente. Resend conserva el correo, el contenido del mensaje y sus registros durante 30 días; sus copias de seguridad persisten 7 días adicionales. GitHub registra la dirección IP de las visitas a Pages por motivos de seguridad y no se fija aquí un plazo que su documentación pública no concreta.",
        styles["BodySTR"],
    ),
    PageBreak(),
    Paragraph("6. Proveedores, destinatarios y transferencias", styles["HeadingSTR"]),
    Paragraph(
        "<b>Supabase</b> presta la base de datos y la función de encuesta. El proyecto está configurado en París, Francia, región eu-west-3. Su documentación de transferencias indica tratamientos en Singapur y Estados Unidos y la incorporación de cláusulas contractuales tipo al DPA cuando resultan aplicables.",
        styles["BodySTR"],
    ),
    Paragraph(
        "<b>Resend</b> envía el código. Almacena en Estados Unidos la dirección destinataria, el mensaje y los registros. Su DPA estándar se aplica a las cuentas de todos los planes e incorpora cláusulas contractuales tipo; Resend declara su participación en el Marco de Privacidad de Datos UE-EE. UU.",
        styles["BodySTR"],
    ),
    Paragraph(
        "<b>GitHub Pages</b> aloja la página estática en infraestructura global, incluida la de Estados Unidos, y registra la IP de visita por seguridad. GitHub declara el uso de cláusulas contractuales tipo y del Marco de Privacidad de Datos para las transferencias descritas en su política.",
        styles["BodySTR"],
    ),
    Paragraph(
        "Los proveedores tratan los datos para prestar sus servicios y pueden utilizar subencargados. Puede solicitarse información sobre los acuerdos, las garantías y sus copias en str.ig@str.es. La ubicación europea de la base no significa que todo tratamiento técnico ocurra exclusivamente en la Unión Europea.",
        styles["BodySTR"],
    ),
    Paragraph("7. Derechos y ausencia de respuesta individual", styles["HeadingSTR"]),
    Paragraph(
        "Puedes solicitar acceso, rectificación, supresión, limitación u oposición y, cuando corresponda, portabilidad. También puedes retirar el consentimiento de comunicaciones de una encuesta simple sin afectar al tratamiento anterior. Escribe a str.ig@str.es. Puedes reclamar ante la Agencia Española de Protección de Datos, www.aepd.es.",
        styles["BodySTR"],
    ),
    Paragraph(
        "En la encuesta meteorológica no existe una respuesta individual que pueda localizarse, corregirse o borrarse: al enviar, las opciones solo incrementan contadores colectivos. Conforme al artículo 11 del RGPD, el responsable no está obligado a obtener o conservar información adicional con la única finalidad de identificar a una persona. Mientras exista la huella de participación o un registro de correo del proveedor, los derechos sobre esos datos pueden ejercerse aportando el correo y la información necesaria para localizar la solicitud. No es posible descontar de un contador una opción atribuible a una persona.",
        styles["BodySTR"],
    ),
    Paragraph("8. Decisiones automatizadas y versión", styles["HeadingSTR"]),
    Paragraph(
        "No se elaboran perfiles ni se adoptan decisiones automatizadas con efectos jurídicos o similares sobre participantes. Los resultados no se usan para acreditar identidad, afiliación o conducta individual y no se comunican a la empresa de forma individualizada.",
        styles["BodySTR"],
    ),
    Paragraph(
        "<b>Versión del aviso:</b> 2.0, de 8 de noviembre de 2026. Esta versión corresponde al modelo de contadores marginales sin filas individuales, sin modalidad de trabajo y sin cruces. Se actualizará si cambian las finalidades, el funcionamiento, los plazos, los proveedores o la normativa aplicable.",
        styles["BodySTR"],
    ),
]

OUTPUT.parent.mkdir(parents=True, exist_ok=True)
doc.build(story)
print(OUTPUT)

