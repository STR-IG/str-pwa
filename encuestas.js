import { api, busy, text } from "./survey-api.js";

const $ = (id) => document.getElementById(id);
const status = $("status");
const list = $("surveys");
const blockTitles = {
  1: "Trabajo durante las alertas",
  2: "Información recibida",
  3: "Desplazamientos y alternativas",
  4: "Valoración de la gestión",
  5: "Protocolos y puestos esenciales",
};
let selected = null;
let email = "";
let challengeId = "";
let permit = "";

function reset() {
  selected = null;
  email = "";
  challengeId = "";
  permit = "";
  $("email-form").reset();
  $("vote-form").reset();
  $("weather-vote-form").reset();
  $("vote-form").hidden = true;
  $("weather-vote-form").hidden = true;
  $("email-form").hidden = false;
  $("weather-questions").replaceChildren();
}

async function load() {
  list.replaceChildren();
  try {
    const [genericResult, weatherResult] = await Promise.all([
      api("list"),
      api("weather_list"),
    ]);
    const surveys = [
      ...genericResult.surveys.map((survey) => ({ ...survey, kind: "simple" })),
      ...weatherResult.surveys.map((survey) => ({ ...survey, kind: "weather" })),
    ].filter((survey) => {
      if (survey.kind === "weather") {
        return !survey.closed && ["publicada", "solo_admin"].includes(survey.state);
      }
      return ["active"].includes(survey.state);
    });
    status.textContent = surveys.length
      ? "Elige una encuesta para participar."
      : "No hay encuestas activas en este momento.";
    for (const survey of surveys) {
      const card = text(list, "article", "", "panel");
      text(card, "h2", survey.title);
      if (survey.description) text(card, "p", survey.description);
      if (survey.admin_only || survey.state === "solo_admin") {
        text(card, "p", "Prueba exclusiva para administradores", "badge");
      }
      const button = text(card, "button", "Participar");
      button.type = "button";
      button.onclick = () => open(survey);
    }
    const urlSurveyId = new URLSearchParams(location.search).get("surveyId");
    if (urlSurveyId) {
      const requested = surveys.find((survey) => survey.id === urlSurveyId);
      if (requested) await open(requested);
    }
  } catch (error) {
    status.textContent = error.message;
  }
}

async function open(survey) {
  reset();
  selected = survey;
  list.hidden = true;
  $("participate").hidden = false;
  if (survey.kind === "weather") {
    try {
      selected = { ...await api("weather_get", { surveyId: survey.id }), kind: "weather" };
      renderWeatherQuestions(selected.questions);
    } catch (error) {
      status.textContent = error.message;
      return;
    }
  }
  $("survey-title").textContent = selected.title;
  $("survey-description").textContent = selected.description ||
    (selected.kind === "weather"
      ? "Cuestionario sobre información, desplazamientos y seguridad durante las alertas meteorológicas."
      : "");
  const isWeatherTest = selected.kind === "weather" && selected.state !== "publicada";
  $("email-note").textContent = selected.kind === "weather"
    ? "Te enviaremos un código de un solo uso, válido durante 5 minutos."
    : "Te enviaremos un código de un solo uso, válido durante 10 minutos.";
  $("weather-code-note").textContent = isWeatherTest
    ? "Prueba privada de administración. El código caduca en 5 minutos."
    : "El código caduca en 5 minutos. Verificaremos el código antes de registrar tus respuestas.";
  status.textContent = "Introduce tu correo para recibir el código.";
  $("email").focus();
}

function renderWeatherQuestions(questions) {
  const root = $("weather-questions");
  root.replaceChildren();
  let currentBlock = null;
  let group = null;
  for (const question of questions || []) {
    if (question.block !== currentBlock) {
      currentBlock = question.block;
      group = text(root, "section", "", "question-block");
      text(group, "h3", blockTitles[currentBlock] || `Bloque ${currentBlock}`);
    }
    const fieldset = text(group, "fieldset", "", "weather-question");
    const legend = text(fieldset, "legend", question.title);
    legend.id = `legend-${question.id}`;
    if (question.max > 1) {
      text(fieldset, "p", `Puedes elegir hasta ${question.max}.`, "hint");
    }
    for (const option of question.options) {
      const label = text(fieldset, "label", "", "choice");
      const input = document.createElement("input");
      input.type = question.max === 1 ? "radio" : "checkbox";
      input.name = question.id;
      input.value = option;
      input.required = question.max === 1;
      input.setAttribute("aria-labelledby", legend.id);
      input.addEventListener("change", () => updateWeatherChoices(fieldset, question, input));
      label.append(input);
      text(label, "span", option);
    }
  }
}

function updateWeatherChoices(fieldset, question, changed) {
  const inputs = [...fieldset.querySelectorAll("input")];
  const exclusive = new Set(question.exclusive || []);
  if (changed?.checked && exclusive.has(changed.value)) {
    for (const input of inputs) if (input !== changed) input.checked = false;
  } else if (changed?.checked) {
    for (const input of inputs) if (exclusive.has(input.value)) input.checked = false;
  }
  const chosen = inputs.filter((input) => input.checked);
  const hasExclusive = chosen.some((input) => exclusive.has(input.value));
  for (const input of inputs) {
    input.disabled = !input.checked && (hasExclusive || chosen.length >= question.max);
  }
}

function weatherAnswers() {
  const answers = {};
  for (const question of selected.questions || []) {
    const values = [...$("weather-questions").querySelectorAll(
      `input[name="${CSS.escape(question.id)}"]:checked`,
    )].map((input) => input.value);
    const exclusive = new Set(question.exclusive || []);
    if (
      !values.length || values.length > question.max ||
      (values.some((value) => exclusive.has(value)) && values.length > 1)
    ) {
      return null;
    }
    answers[question.id] = values;
  }
  return answers;
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
      if (selected.kind === "weather") {
        const result = await api("weather_request", { surveyId: selected.id, email });
        challengeId = result.challengeId;
        $("email-form").hidden = true;
        $("weather-vote-form").hidden = false;
      } else {
        const result = await api("request", { surveyId: selected.id, email });
        challengeId = result.challengeId;
        $("email-form").hidden = true;
        $("vote-form").hidden = false;
        const options = $("options");
        options.replaceChildren();
        text(options, "legend", "Selecciona una respuesta");
        for (const option of selected.options) {
          const label = text(options, "label", "", "choice");
          const input = document.createElement("input");
          input.type = "radio";
          input.name = "option";
          input.value = option.id;
          input.required = true;
          label.append(input);
          text(label, "span", option.label);
        }
      }
      status.textContent = "Código enviado. Revisa tu correo, incluida la carpeta de spam.";
      $(selected.kind === "weather" ? "weather-code" : "code").focus();
    } catch (error) {
      status.textContent = error.message;
    }
  });
};

async function changeEmail(weather) {
  if (weather && challengeId && !permit && selected) {
    try {
      await api("weather_cancel", { surveyId: selected.id, challengeId });
    } catch {
      // The challenge expires automatically; changing the address must still work.
    }
  }
  challengeId = "";
  permit = "";
  $(weather ? "weather-vote-form" : "vote-form").reset();
  $(weather ? "weather-vote-form" : "vote-form").hidden = true;
  $("email-form").hidden = false;
  status.textContent = "Puedes solicitar otro código después de un minuto.";
  $("email").focus();
}

$("change-email").onclick = () => changeEmail(false);
$("weather-change-email").onclick = () => changeEmail(true);

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

$("weather-vote-form").onsubmit = async (event) => {
  event.preventDefault();
  await busy(event.currentTarget, async () => {
    try {
      const answers = weatherAnswers();
      if (!answers) {
        status.textContent = "Responde cada pregunta y respeta el máximo indicado.";
        return;
      }
      if (!permit) {
        const verified = await api("weather_verify", {
          surveyId: selected.id,
          email,
          challengeId,
          code: $("weather-code").value,
        });
        permit = verified.permit;
      }
      await api("weather_submit", {
        surveyId: selected.id,
        permit,
        answers,
        consent: $("weather-consent").checked,
        ...( $("weather-consent").checked ? { email } : {} ),
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
