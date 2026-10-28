import { api, busy, text } from "./survey-api.js";

const $ = (id) => document.getElementById(id);
const status = $("status");

function stateLabel(survey) {
  if (survey.state === "solo_admin") return "Solo administración · prueba";
  if (survey.state === "publicada" && survey.closed) return "Cerrada";
  if (survey.state === "publicada") return "Publicada";
  return survey.state;
}

async function showWeatherResults(survey, test) {
  const [result, detail] = await Promise.all([
    api("weather_results", { surveyId: survey.id, test }),
    api("weather_get", { surveyId: survey.id }),
  ]);
  const box = $("results");
  box.replaceChildren();
  box.hidden = false;
  text(box, "h2", `${survey.title} · ${test ? "prueba" : "resultados"}`);
  text(box, "p", `Participaciones: ${result.total}`);
  const labels = new Map(detail.questions.map((question) => [question.id, question.title]));
  for (const [questionId, counts] of Object.entries(result.counts || {})) {
    const section = text(box, "section", "", "result-question");
    text(section, "h3", labels.get(questionId) || questionId);
    for (const [label, count] of Object.entries(counts)) {
      const row = text(section, "div", "", "result-row");
      text(row, "span", label);
      text(row, "strong", String(count));
    }
  }
  if (Array.isArray(result.groups) && result.groups.length) {
    text(box, "h3", "Desglose por tipo de trabajo");
    for (const group of result.groups) {
      const section = text(box, "section", "", "result-group");
      text(section, "h4", `${group.modality} · ${group.total} respuestas`);
      for (const [questionId, counts] of Object.entries(group.counts || {})) {
        const row = text(section, "div", "", "result-row");
        text(row, "span", labels.get(questionId) || questionId);
        text(row, "strong", Object.values(counts).reduce((sum, n) => sum + n, 0));
      }
    }
  }
  box.scrollIntoView({ behavior: "smooth" });
}

async function loadWeather() {
  const list = $("weather-surveys");
  list.replaceChildren();
  const { surveys } = await api("weather_list");
  for (const survey of surveys) {
    const card = text(list, "article", "", "survey-admin-card");
    text(card, "h3", survey.title);
    text(card, "p", stateLabel(survey), "badge");
    if (survey.state === "solo_admin") {
      const preview = text(card, "a", "Vista previa privada");
      preview.href = `encuestas.html?surveyId=${encodeURIComponent(survey.id)}`;
      preview.className = "admin-action-link";
      const resultsButton = text(card, "button", "Resultados de prueba");
      resultsButton.type = "button";
      resultsButton.onclick = () => busy(card, async () => {
        try {
          await showWeatherResults(survey, true);
        } catch (error) {
          status.textContent = error.message;
        }
      });
      const cleanup = text(card, "button", "Limpiar respuestas de prueba");
      cleanup.type = "button";
      cleanup.className = "secondary";
      cleanup.onclick = () => busy(card, async () => {
        if (!confirm("Se borrarán las respuestas de prueba y los códigos pendientes. ¿Continuar?")) return;
        try {
          const result = await api("weather_cleanup", { surveyId: survey.id });
          status.textContent = `Prueba limpiada: ${result.test_responses_deleted || 0} respuestas y ${result.test_participations_deleted || 0} participaciones eliminadas.`;
          await loadWeather();
        } catch (error) {
          status.textContent = error.message;
        }
      });
      const publish = text(card, "button", "Publicar para la plantilla");
      publish.type = "button";
      publish.onclick = () => busy(card, async () => {
        if (!confirm("La publicación borrará los datos de prueba y permitirá responder a toda la plantilla. ¿Publicar ahora?")) return;
        try {
          await api("weather_publish", { surveyId: survey.id, confirm: true });
          status.textContent = "Encuesta publicada para la plantilla.";
          await loadWeather();
        } catch (error) {
          status.textContent = error.message;
        }
      });
    } else if (survey.state === "publicada" && !survey.closed) {
      text(card, "p", "Los resultados se mostrarán al cerrar la encuesta.");
      const close = text(card, "button", "Cerrar definitivamente");
      close.type = "button";
      close.onclick = () => busy(card, async () => {
        if (!confirm("El cierre es definitivo. ¿Cerrar esta encuesta?")) return;
        try {
          await api("weather_close", { surveyId: survey.id });
          status.textContent = "Encuesta cerrada definitivamente.";
          await loadWeather();
        } catch (error) {
          status.textContent = error.message;
        }
      });
    } else {
      const resultsButton = text(card, "button", "Consultar resultados");
      resultsButton.type = "button";
      resultsButton.onclick = () => busy(card, async () => {
        try {
          await showWeatherResults(survey, false);
        } catch (error) {
          status.textContent = error.message;
        }
      });
    }
  }
  if (!surveys.length) text(list, "p", "No hay encuestas meteorológicas.");
}

async function loadSimpleSurveys() {
  const { surveys } = await api("list");
  const list = $("surveys");
  list.replaceChildren();
  for (const survey of surveys) {
    const card = text(list, "article", "", "panel");
    text(card, "h2", survey.title);
    text(
      card,
      "p",
      `${({ draft: "Borrador", active: "Activa", closed: "Cerrada" })[survey.state]} · ${survey.admin_only ? "Solo administradores" : "Pública"}`,
    );
    text(card, "p", survey.description);
    for (const option of survey.options) text(card, "p", `• ${option.label}`);
    const actions = survey.state === "draft"
      ? ["activate"]
      : survey.state === "active"
      ? ["close", "results"]
      : ["results"];
    for (const action of actions) {
      const button = text(
        card,
        "button",
        ({ activate: "Activar encuesta", close: "Cerrar definitivamente", results: "Consultar resultados" })[action],
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
              await loadSimpleSurveys();
            }
          } catch (error) {
            status.textContent = error.message;
          }
        });
    }
  }
}

async function load() {
  await Promise.all([loadWeather(), loadSimpleSurveys()]);
}

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
        options: $("new-options").value.split(/\r?\n/).map((value) => value.trim())
          .filter(Boolean),
        adminOnly: $("admin-only").checked,
      });
      $("create-form").reset();
      await loadSimpleSurveys();
      status.textContent = "Borrador creado. Revisa las opciones antes de activarlo.";
    } catch (error) {
      status.textContent = error.message;
    }
  });
};

init();
