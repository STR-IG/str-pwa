import { api, busy, text } from "./survey-api.js";
const $ = (id) => document.getElementById(id),
  status = $("status"),
  list = $("surveys");
let selected = null, email = "", challengeId = "";
function reset() {
  selected = null;
  email = "";
  challengeId = "";
  $("email-form").reset();
  $("vote-form").reset();
  $("vote-form").hidden = true;
  $("email-form").hidden = false;
}
async function load() {
  list.replaceChildren();
  try {
    const { surveys } = await api("list");
    const active = surveys.filter((s) => s.state === "active");
    status.textContent = active.length
      ? "Elige una encuesta para participar."
      : "No hay encuestas activas en este momento.";
    for (const survey of active) {
      const card = text(list, "article", "", "panel");
      text(card, "h2", survey.title);
      text(card, "p", survey.description);
      if (survey.admin_only) {
        text(card, "p", "Prueba exclusiva para administradores", "badge");
      }
      const button = text(card, "button", "Participar");
      button.type = "button";
      button.onclick = () => open(survey);
    }
  } catch (error) {
    status.textContent = error.message;
  }
}
function open(survey) {
  reset();
  selected = survey;
  list.hidden = true;
  $("participate").hidden = false;
  $("survey-title").textContent = survey.title;
  $("survey-description").textContent = survey.description;
  status.textContent = "Introduce tu correo para recibir el código.";
  $("email").focus();
}
$("back").onclick = () => {
  reset();
  $("participate").hidden = true;
  list.hidden = false;
  load();
};
$("email-form").onsubmit = async (event) => {
  event.preventDefault();
  await busy(event.currentTarget, async () => {
    try {
      email = $("email").value.trim().toLowerCase();
      const result = await api("request", { surveyId: selected.id, email });
      challengeId = result.challengeId;
      $("email-form").hidden = true;
      $("vote-form").hidden = false;
      const options = $("options");
      options.replaceChildren();
      text(options, "legend", "Selecciona una respuesta");
      for (const option of selected.options) {
        const label = text(options, "label", "", "choice"),
          input = document.createElement("input");
        input.type = "radio";
        input.name = "option";
        input.value = option.id;
        input.required = true;
        label.append(input);
        text(label, "span", option.label);
      }
      status.textContent =
        "Código enviado. Revisa tu correo, incluida la carpeta de spam.";
      $("code").focus();
    } catch (error) {
      status.textContent = error.message;
    }
  });
};
$("change-email").onclick = () => {
  challengeId = "";
  $("vote-form").reset();
  $("vote-form").hidden = true;
  $("email-form").hidden = false;
  status.textContent = "Puedes solicitar otro código después de un minuto.";
  $("email").focus();
};
$("vote-form").onsubmit = async (event) => {
  event.preventDefault();
  await busy(event.currentTarget, async () => {
    try {
      const optionId = new FormData($("vote-form")).get("option");
      await api("vote", {
        surveyId: selected.id,
        email,
        challengeId,
        code: $("code").value,
        optionId,
        consent: $("consent").checked,
      });
      reset();
      $("participate").hidden = true;
      list.hidden = false;
      await load();
      status.textContent = "Gracias. Tu participación ha quedado registrada.";
    } catch (error) {
      status.textContent = error.message;
    }
  });
};
load();
