import { api, busy, text } from "./survey-api.js";
const $ = (id) => document.getElementById(id), status = $("status");
async function load() {
  const { surveys } = await api("list");
  const list = $("surveys");
  list.replaceChildren();
  for (const survey of surveys) {
    const card = text(list, "article", "", "panel");
    text(card, "h2", survey.title);
    text(
      card,
      "p",
      `${
        ({ draft: "Borrador", active: "Activa", closed: "Cerrada" })[
          survey.state
        ]
      } · ${survey.admin_only ? "Solo administradores" : "Pública"}`,
    );
    text(card, "p", survey.description);
    for (const option of survey.options) text(card, "p", "• " + option.label);
    const actions = survey.state === "draft"
      ? ["activate"]
      : survey.state === "active"
      ? ["close", "results"]
      : ["results"];
    for (const action of actions) {
      const button = text(
        card,
        "button",
        ({
          activate: "Activar encuesta",
          close: "Cerrar definitivamente",
          results: "Consultar resultados",
        })[action],
      );
      button.type = "button";
      button.onclick = () =>
        busy(card, async () => {
          try {
            const result = await api(action, { surveyId: survey.id });
            if (action === "results") {
              const box = $("results");
              box.replaceChildren();
              box.hidden = false;
              text(box, "h2", survey.title);
              text(box, "p", `Total: ${result.total}`);
              for (const option of result.options) {
                const row = text(box, "div", "", "result-row");
                text(row, "span", option.label);
                text(row, "strong", String(option.votes));
              }
              box.scrollIntoView({ behavior: "smooth" });
            } else {
              status.textContent = action === "activate"
                ? "Encuesta activada."
                : "Encuesta cerrada.";
              await load();
            }
          } catch (error) {
            status.textContent = error.message;
          }
        });
    }
  }
}
// authorize via a protected endpoint, not the public list response.
async function init() {
  try {
    await api("authorize");
    $("admin-content").hidden = false;
    await load();
    status.textContent = "Acceso de administrador verificado.";
  } catch (error) {
    status.textContent = error.message;
    const a = text(status, "a", " Iniciar sesión");
    a.href = "acceso-privado.html?next=encuestas-admin.html";
  }
}
$("create-form").onsubmit = async (event) => {
  event.preventDefault();
  await busy(event.currentTarget, async () => {
    try {
      await api("create", {
        title: $("title").value,
        description: $("description").value,
        options: $("new-options").value.split(/\r?\n/).map((v) => v.trim())
          .filter(Boolean),
        adminOnly: $("admin-only").checked,
      });
      $("create-form").reset();
      await load();
      status.textContent =
        "Borrador creado. Revisa las opciones antes de activarlo.";
    } catch (error) {
      status.textContent = error.message;
    }
  });
};
init();
