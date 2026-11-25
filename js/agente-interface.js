import {analyzeScale, AgentError, assertAdmin} from './agente-escalas.mjs';
import {appCheckSiteKey} from './firebase-config.js';

const $ = selector => document.querySelector(selector);
const dialog = $('#schedule-agent');
const status = $('#agent-status');
const analyze = $('#agent-analyze');
const submit = $('#agent-submit');
const result = $('#agent-result');
const scaleSelect = $('#agent-scale');
let gateway;
let busy = false;

function message(text, error = false) {
  status.textContent = text;
  status.classList.toggle('form-error', error);
}

function describe(error) {
  if (error instanceof AgentError) return error.message;
  const code = String(error.code || '');
  const details = String(error.message || '');
  if (/resource-exhausted|quota|429/i.test(code + ' ' + details)) return 'Limite do Firebase ou do Gemini atingido. Tente novamente mais tarde.';
  if (/unavailable|network|deadline-exceeded|failed to fetch|timed?\s*out|failed to load|timeout/i.test(code + ' ' + details)) {
    return 'Não foi possível conectar ao Firebase ou ao Gemini. Verifique a conexão e tente novamente.';
  }
  if (/permission-denied|unauthenticated/.test(code)) return 'O Firebase recusou o acesso. Verifique as permissões da sua conta e as regras da igreja.';
  if (/invalid-credential|wrong-password|user-not-found/.test(code)) return 'O Firebase não reconheceu esse e-mail e senha.';
  if (/app.check|recaptcha/i.test(code + ' ' + details)) return 'Não foi possível validar este app com o App Check.';
  return 'Falha de integração com o Firebase ou Gemini. Verifique a configuração do projeto e do modelo.';
}

async function run(action) {
  if (busy) return;
  busy = true;
  dialog.setAttribute('aria-busy', 'true');
  const controls = [...dialog.querySelectorAll('button, input, select')].filter(control => !control.closest('[method="dialog"]'));
  try {
    controls.forEach(control => { control.disabled = true; });
    await action();
  } catch (error) {
    message(describe(error), true);
  } finally {
    busy = false;
    dialog.removeAttribute('aria-busy');
    controls.forEach(control => { control.disabled = false; });
    submit.disabled = !scaleSelect.value;
  }
}

async function loadOptions(preferred = '') {
  analyze.hidden = false;
  scaleSelect.replaceChildren(new Option('Selecione uma escala', ''));
  message('Consultando as escalas da sua igreja…');
  const scales = await gateway.listScales();
  for (const scale of scales) {
    scaleSelect.add(new Option(scale.nome + ' · ' + scale.data.split('-').reverse().join('/') + ' às ' + scale.horario, scale.id));
  }
  const selected = scales.some(scale => scale.id === preferred);
  scaleSelect.value = selected ? preferred : !preferred && scales.length === 1 ? scales[0].id : '';
  message(!scales.length ? 'Nenhuma escala futura foi encontrada na sua igreja.' :
    preferred && !selected ? 'A escala escolhida não está mais aberta. Selecione outra escala.' :
    'Selecione uma escala para consultar as disponibilidades registradas.');
}

function node(tag, value) {
  const element = document.createElement(tag);
  element.textContent = value;
  return element;
}

function section(title, entries) {
  if (!entries.length) return;
  const list = node('ul', '');
  list.append(...entries.map(entry => node('li', entry)));
  result.append(node('h3', title), list);
}

function render(analysis) {
  const {scale, metrics: m} = analysis;
  result.replaceChildren(node('h3', scale.name), node('p', scale.date.split('-').reverse().join('/') + ' às ' + scale.time));
  const metrics = node('dl', '');
  metrics.className = 'agent-metrics';
  for (const [label, value] of [
    ['Serviços previstos', m.demand], ['Disponíveis', m.available], ['Indisponíveis registrados', m.unavailable],
    ['Pessoas escaladas', m.assigned], ['Vagas preenchidas', m.filled], ['Vagas abertas', m.gaps],
    ['Disponibilidade potencial', m.coverage === null ? null : m.coverage + '%'],
    ['Conflitos entre disponíveis', m.conflicts], ['A reconfirmar', m.reconfirm]
  ]) {
    const card = node('div', '');
    card.append(node('dt', label), node('dd', value ?? '—'));
    metrics.append(card);
  }
  result.append(metrics);
  if (m.available === 0) result.append(node('p', 'Nenhuma disponibilidade válida registrada para esta escala.'));
  if (m.gaps > m.candidates) result.append(node('p', 'Os candidatos sem conflitos são insuficientes para preencher as vagas abertas.'));
  result.append(node('h3', 'Análise do Gemini'), node('p', analysis.analysis));
  section('Recomendações', analysis.recommendations);
  section('Sugestões de distribuição', analysis.suggestions.map(item => item.member + ' · ' + item.slot + ' — ' + item.reason));
  section('Limitações dos dados', analysis.limitations);
  result.append(node('p', 'Revise as recomendações antes de definir a escala.'));
  result.hidden = false;
}

function open(preferred = '') {
  if (dialog.open || busy) return;
  result.hidden = true;
  analyze.hidden = true;
  submit.textContent = 'Analisar escala';
  message('');
  dialog.showModal();
  if (!appCheckSiteKey) {
    message('A análise está indisponível porque a chave pública do App Check não foi configurada para este app.');
    return;
  }
  run(async () => {
    message('Carregando a integração com o Firebase…');
    gateway ??= await import('./agente-firebase.js');
    assertAdmin(await gateway.getSession());
    await loadOptions(preferred);
  });
}

$('#open-schedule-agent').addEventListener('click', () => open());
document.addEventListener('click', event => {
  const shortcut = event.target.closest('[data-analyze-scale]');
  if (shortcut) open(shortcut.dataset.analyzeScale);
});

scaleSelect.addEventListener('change', () => {
  result.hidden = true;
  submit.disabled = !scaleSelect.value;
  submit.textContent = 'Analisar escala';
  message('');
});
analyze.addEventListener('submit', event => {
  event.preventDefault();
  const scaleId = scaleSelect.value;
  if (!scaleId) return;
  run(async () => {
    result.hidden = true;
    message('Consultando registros e solicitando a análise ao Gemini…');
    render(await analyzeScale({scaleId, ...gateway}));
    message('Análise concluída.');
    submit.textContent = 'Analisar novamente';
  });
});
