import { permitFetch, showPublicPermitPage, handlePermitError } from './permisos-consultas.js';
import { dutyChoices, dutySections, validDutyFacts, dutyFacts, validDutyGuidance } from './public-duty.js';

const URL = 'https://icneigdnuntzugisexaz.supabase.co';


const DRAFT = 'strPublicDutyDraftV1';
const form = document.getElementById('questionnaire');
const result = document.getElementById('result');
const actions = document.getElementById('send-actions');
const status = document.getElementById('send-status');
const consult = document.getElementById('consult');
const previous = document.getElementById('previous');
let step = 1, busy = false, completed = null;
const state = { obligation: '', overlap: '', outside: '', proof: '' };
const questions = ['¿Qué obligación tienes que atender?', '¿La obligación coincide con tu jornada de trabajo?', '¿Puedes realizarla fuera de tu horario laboral?', '¿Tienes justificante o citación?'];
Object.entries(dutyChoices).forEach(([field, values], i) => {
  const screen = document.createElement('div');
  screen.dataset.field = field;
  screen.className = 'screen'; screen.dataset.step = i === 3 ? '5' : String(i + 1);
  const progress = document.createElement('span'); progress.className = 'step'; progress.textContent = `Paso ${screen.dataset.step} de 6`;
  const heading = document.createElement('h2'); heading.textContent = questions[i]; heading.tabIndex = -1;
  const answers = document.createElement('div'); answers.className = 'answers';
  values.forEach(value => {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'answer';
    button.textContent = value; button.setAttribute('aria-pressed', 'false');
    button.onclick = () => {
      state[field] = value;
      if (field === 'obligation' && value !== 'Mesa electoral / elecciones') { document.getElementById('electoralDayStatus').value = ''; document.getElementById('electoralRole').value = ''; document.getElementById('substituteOutcome').value = ''; }
      answers.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b === button)));
      refresh();
    };
    answers.append(button);
  });
  const next = document.createElement('button'); next.type = 'button'; next.className = 'primary next'; next.textContent = 'Continuar'; next.disabled = true;
  screen.append(progress, heading, answers, next); document.getElementById('steps').append(screen);
});
const screens = [...document.querySelectorAll('.screen')];
screens.forEach(s => { s.querySelector('h2').tabIndex = -1; });
const inputs = ['date', 'time', 'workSchedule', 'electoralDayStatus', 'electoralRole', 'substituteOutcome', 'details'].map(id => document.getElementById(id));
const electoralFields = document.getElementById('electoral-fields');
const substituteFields = document.getElementById('substitute-fields');
function facts() { return { ...state, ...Object.fromEntries(inputs.map(i => [i.id, i.value])) }; }
function saveDraft() { /* Form and result stay in page memory only. */ }
function refresh() {
  const election = state.obligation === 'Mesa electoral / elecciones';
  electoralFields.hidden = !election;
  document.querySelector('label[for="workSchedule"]').textContent = election ? 'Turno del día anterior a la obligación' : 'Turno de trabajo relacionado con la obligación';
  substituteFields.hidden = !(election && document.getElementById('electoralRole').value === 'Suplente');
  const fields = { 1: 'obligation', 2: 'overlap', 3: 'outside', 5: 'proof' };
  screens.forEach(s => {
    const next = s.querySelector('.next'); if (!next) return;
    next.disabled = busy || (s.dataset.step === '4' ? (!inputs.slice(0, 3).every(i => i.value.trim() && i.checkValidity()) || (election && (!document.getElementById('electoralDayStatus').value || !document.getElementById('electoralRole').value || (document.getElementById('electoralRole').value === 'Suplente' && !document.getElementById('substituteOutcome').value)))) : !state[fields[s.dataset.step]]);
  });
  saveDraft();
}
function go(n) {
  step = n; screens.forEach(s => { s.hidden = Number(s.dataset.step) !== step; });
  previous.hidden = step === 1; previous.disabled = busy;
  document.getElementById('back').setAttribute('aria-label', step > 1 ? 'Volver al paso anterior' : 'Volver a Consulta tu caso');
  document.querySelector(`.screen[data-step="${step}"] h2`).focus?.();
  saveDraft();
}
screens.forEach(s => s.querySelector('.next')?.addEventListener('click', () => go(step + 1)));
inputs.forEach(i => { i.addEventListener('input', refresh); i.addEventListener('change', () => { if (i.id === 'electoralRole' && i.value !== 'Suplente') document.getElementById('substituteOutcome').value = ''; refresh(); }); });
previous.onclick = () => go(step - 1);
document.getElementById('back').onclick = e => { if (busy || step > 1) { e.preventDefault(); if (!busy) go(step - 1); } };

function showGuidance() {
  result.hidden = false; result.replaceChildren();
  for (const [key, title] of Object.entries(dutySections)) {
    const heading = document.createElement('h3'); heading.textContent = title;
    const p = document.createElement('p'); p.textContent = completed.guidance[key]; result.append(heading, p);
  }
  actions.hidden = true;
}
form.noValidate = true; // Validate the full questionnaire explicitly, including previous hidden steps.
form.onsubmit = async e => {
  e.preventDefault(); if (busy) return;
  if (!validDutyFacts(facts())) { status.textContent = 'Completa las respuestas, la fecha, la hora y tu horario de trabajo.'; return; }
  const submittedFacts = dutyFacts(facts());
  busy = true; consult.disabled = true; previous.disabled = true; refresh();
  consult.textContent = 'Consultando a STR-IG…'; completed = null; actions.hidden = true; status.textContent = '';
  result.hidden = false; result.textContent = 'Analizando tus respuestas…';
  try {
    const response = await permitFetch(`${URL}/functions/v1/answer-public-duty`, {
      method: 'POST', signal: AbortSignal.timeout(35000), headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(submittedFacts)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'AI_UNAVAILABLE');
    if (!validDutyGuidance(data.guidance)) throw new Error('AI_EMPTY_RESPONSE');
    completed = { guidance: data.guidance };
    saveDraft(); showGuidance();
  } catch (error) {
    if (!handlePermitError(error, result)) result.textContent = 'No se ha podido completar la consulta. Inténtalo de nuevo en unos minutos.';
  } finally {
    busy = false; consult.disabled = false; previous.disabled = false; consult.textContent = completed ? 'Actualizar orientación' : 'Volver a intentarlo'; refresh();
  }
};
try { sessionStorage.removeItem(DRAFT); } catch {}
showPublicPermitPage(true); go(step); refresh(); if (completed) showGuidance();
