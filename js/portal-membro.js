import { auth } from './firebase-config.js';
import { readProfile, isActiveUser, isAdministrator, logout } from './auth-service.js';
import { readMemberData, saveOwnAvailability, cancelAvailability } from './community-service.js';
import { normalize, eventStart, isOpenWorship, availabilityState, safePaymentUrl } from './community-model.js';
const $ = selector => document.querySelector(selector);
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const date = value => /^\d{4}-\d{2}-\d{2}$/.test(value || '') ? value.split('-').reverse().join('/') : 'Data não informada';
const empty = text => '<p class="empty">' + escape(text) + '</p>';
let data = null;
let busy = false;
let loadedAt = 0;
const groupCache = new Map();
function message(text, target = '#portal-message', success = false) {
  const element = $(target); element.textContent = text; element.hidden = false;
  element.dataset.kind = success ? 'success' : 'error'; element.focus();
}
function errorText(error) {
  return error.code === 'permission-denied' ? 'O acesso ainda não foi liberado. Peça ao administrador para publicar as regras atualizadas do Firebase.' : error.code ? 'Não foi possível conectar. Verifique a internet e tente novamente.' : error.message;
}
function navigate() {
  const section = ['inicio', 'ministerios', 'celulas', 'disponibilidades', 'campanhas'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'inicio';
  document.querySelectorAll('[data-panel]').forEach(panel => { panel.hidden = panel.dataset.panel !== section; });
  document.querySelectorAll('[data-section]').forEach(link => {
    if (link.dataset.section === section) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
  });
}
function worships() { return data.escalas.filter(row => isOpenWorship(row)).sort((a, b) => eventStart(a) - eventStart(b)); }
function participants(field, name) {
  const key = field + ':' + normalize(name);
  if (!groupCache.has(key)) groupCache.set(key, data.comunidadeMembros.filter(row => normalize(row[field]) === normalize(name)).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')));
  return groupCache.get(key);
}
function renderGroups(module, field, searchId, target) {
  const search = normalize($(searchId).value);
  const groups = data[module].filter(row => normalize([row.nome, row.lider, row.local].join(' ')).includes(search));
  $(target).innerHTML = groups.length ? groups.map(row => '<article class="card"><span class="tag">' + escape(row.status) + '</span><h3>' + escape(row.nome) + '</h3><p>Liderança: ' + escape(row.lider || 'Não informada') + '</p>' +
    (module === 'celulas' ? '<p>' + escape(row.dia) + ' · ' + escape(row.horario) + '<br>' + escape(row.local) + '</p>' : '<p>' + escape(row.area) + '</p>') +
    '<p>' + participants(field, row.nome).length + ' participante(s) publicado(s)</p><button class="quiet" type="button" data-group="' + module + '" data-id="' + escape(row.id) + '">Ver participantes</button></article>').join('') : empty('Nenhum grupo encontrado. Os grupos publicados pela administração aparecerão aqui.');
}
function renderHistory() {
  const history = [...data.disponibilidades].sort((a, b) => (b.data + b.horario).localeCompare(a.data + a.horario));
  $('#my-availability').innerHTML = history.length ? history.map(row => {
    const scale = data.escalas.find(item => item.id === row.escalaId);
    const state = availabilityState(row, scale);
    return '<article class="card history-item"><span class="tag">' + escape(state) + '</span><h3>' + escape(scale?.nome || row.cultoNome) + '</h3><p>' + date(row.data) + ' · ' + escape(row.horario) + '<br>' + escape(row.local) + '</p>' +
      (state === 'Reconfirmar' ? '<p>Nova data: ' + date(scale.data) + ' · ' + escape(scale.horario) + '. Confirme novamente se puder participar.</p>' : '') +
      '<p>' + escape(row.observacao || 'Sem observação.') + '</p><div class="actions">' +
      (scale && isOpenWorship(scale) ? '<button type="button" class="quiet" data-select-worship="' + escape(scale.id) + '">' + (row.disponivel ? 'Atualizar resposta' : 'Confirmar novamente') + '</button>' : '') +
      (row.disponivel ? '<button type="button" class="quiet" data-cancel="' + escape(row.id) + '">Cancelar disponibilidade</button>' : '') + '</div></article>';
  }).join('') : empty('Você ainda não informou disponibilidade. Escolha um culto ao lado para começar.');
}
function renderCampaigns() {
  $('#campaign-list').innerHTML = data.campanhas.length ? data.campanhas.map(row => {
    const percent = row.meta > 0 ? Math.round(row.arrecadado / row.meta * 100) : 0;
    const configured = Boolean(safePaymentUrl(row.paymentUrl) || (row.pixChave && row.pixBeneficiario) || row.orientacoesDoacao);
    const open = row.status === 'Em andamento';
    return '<article class="card"><span class="tag">' + escape(row.status) + '</span><h3>' + escape(row.nome) + '</h3><p>' + date(row.inicio) + ' a ' + date(row.fim) + '</p><p>' + escape(row.arrecadado) + ' de ' + escape(row.meta) + ' ' + escape(row.unidade) + '</p><progress max="100" value="' + Math.max(0, Math.min(percent, 100)) + '" aria-label="Progresso da campanha"></progress><p>Entregue: ' + escape(row.entregue) + ' ' + escape(row.unidade) + '</p>' +
      (configured && open ? '<button class="button" type="button" data-donate="' + escape(row.id) + '">Como doar</button>' : '<p class="hint">' + (open ? 'A administração ainda vai informar como doar.' : 'Esta campanha não está recebendo doações no momento.') + '</p>') + '</article>';
  }).join('') : empty('As campanhas publicadas pela congregação aparecerão aqui.');
}
function render() {
  const future = worships();
  $('#portal-stats').innerHTML = [[data.ministerios.length, 'Ministérios'], [data.celulas.length, 'Células'], [data.disponibilidades.filter(row => availabilityState(row, data.escalas.find(s => s.id === row.escalaId)) === 'Confirmada').length, 'Minhas disponibilidades futuras']].map(([count, label]) => '<div class="stat"><strong>' + count + '</strong><span>' + label + '</span></div>').join('');
  $('#worship-list').innerHTML = future.length ? future.map(row => '<article class="card"><span class="tag">' + date(row.data) + ' · ' + escape(row.horario) + '</span><h3>' + escape(row.nome) + '</h3><p>' + escape(row.local) + '</p><p>' + escape(row.ministerio) + '</p><button class="quiet" type="button" data-select-worship="' + escape(row.id) + '">Informar disponibilidade</button></article>').join('') : empty('Nenhum culto futuro publicado. Novos cultos aparecerão assim que a liderança cadastrar.');
  const selected = $('#worship-select').value;
  $('#worship-select').innerHTML = '<option value="">' + (future.length ? 'Selecione um culto' : 'Nenhum culto futuro disponível') + '</option>' + future.map(row => '<option value="' + escape(row.id) + '">' + date(row.data) + ' · ' + escape(row.horario) + ' — ' + escape(row.nome) + '</option>').join('');
  if (future.some(row => row.id === selected)) $('#worship-select').value = selected;
  $('#save-availability').disabled = !future.length;
  $('#worship-select').disabled = !future.length;
  renderGroups('ministerios', 'ministerio', '#ministry-search', '#ministry-list');
  renderGroups('celulas', 'celula', '#cell-search', '#cell-list');
  renderHistory(); renderCampaigns();
}
function selectWorship(id) {
  $('#worship-select').value = id;
  const scale = data.escalas.find(row => row.id === id);
  const previous = data.disponibilidades.find(row => row.escalaId === id);
  $('#availability-note').value = previous?.observacao || '';
  $('#worship-detail').textContent = scale ? date(scale.data) + ' às ' + scale.horario + ' · ' + scale.local + ' (horário de Brasília)' : '';
  $('#availability-message').hidden = true;
}
async function refresh() {
  if (busy) return;
  busy = true; $('#refresh').disabled = true;
  try {
    const next = await readMemberData(auth.currentUser.uid);
    data = next; groupCache.clear(); render(); selectWorship($('#worship-select').value);
    loadedAt = Date.now(); $('#portal-message').hidden = true;
  } catch (error) { message(errorText(error) + (data ? ' A tela mantém a última leitura; atualize antes de agir.' : ' Clique em Atualizar dados para tentar novamente.')); }
  finally { busy = false; $('#refresh').disabled = false; }
}
$('#availability-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (busy || !data) return;
  const scale = data.escalas.find(row => row.id === $('#worship-select').value);
  if (!scale) return;
  busy = true; $('#save-availability').disabled = true;
  try {
    const record = await saveOwnAvailability(scale.id, $('#availability-note').value, scale);
    data.disponibilidades = [...data.disponibilidades.filter(row => row.id !== record.id), record];
    render(); message('Disponibilidade salva! A liderança já pode consultar sua resposta.', '#availability-message', true);
  } catch (error) { message(errorText(error), '#availability-message'); }
  finally { busy = false; $('#save-availability').disabled = !worships().length; }
});
$('#worship-select').addEventListener('change', event => selectWorship(event.target.value));
$('#ministry-search').addEventListener('input', () => { if (data) renderGroups('ministerios', 'ministerio', '#ministry-search', '#ministry-list'); });
$('#cell-search').addEventListener('input', () => { if (data) renderGroups('celulas', 'celula', '#cell-search', '#cell-list'); });
$('#refresh').addEventListener('click', refresh);
$('#close-participants').onclick = () => $('#participants-dialog').close();
$('#close-donation').onclick = () => $('#donation-dialog').close();
document.addEventListener('click', async event => {
  const select = event.target.closest('[data-select-worship]');
  if (select && data) { location.hash = 'disponibilidades'; selectWorship(select.dataset.selectWorship); $('#worship-select').focus(); }
  const group = event.target.closest('[data-group]');
  if (group && data) {
    const row = data[group.dataset.group].find(item => item.id === group.dataset.id);
    const members = participants(group.dataset.group === 'celulas' ? 'celula' : 'ministerio', row.nome);
    $('#participants-title').textContent = row.nome;
    $('#participants-content').innerHTML = members.length ? '<ul class="participant-list">' + members.map(member => '<li><strong>' + escape(member.nome) + '</strong><small>' + escape([member.banda, member.status].filter(Boolean).join(' · ')) + '</small></li>').join('') + '</ul>' : empty('Nenhum participante publicado para este grupo.');
    $('#participants-dialog').showModal();
  }
  const cancel = event.target.closest('[data-cancel]');
  if (cancel && !busy && confirm('Deseja cancelar sua disponibilidade para este culto?')) {
    busy = true; cancel.disabled = true;
    try { await cancelAvailability(cancel.dataset.cancel); data.disponibilidades.find(row => row.id === cancel.dataset.cancel).disponivel = false; render(); message('Disponibilidade cancelada.', '#availability-message', true); }
    catch (error) { message(errorText(error), '#availability-message'); }
    finally { busy = false; cancel.disabled = false; }
  }
  const donate = event.target.closest('[data-donate]');
  if (donate && data) {
    if (Date.now() - loadedAt > 60000) { await refresh(); if (Date.now() - loadedAt > 60000) return; }
    const row = data.campanhas.find(item => item.id === donate.dataset.donate);
    if (!row || row.status !== 'Em andamento') { message('Esta campanha não está mais recebendo doações.'); return; }
    const url = safePaymentUrl(row.paymentUrl);
    $('#donation-title').textContent = row.nome;
    $('#donation-content').innerHTML = '<p class="hint">Confira o beneficiário e o valor no aplicativo do seu banco ou na página de pagamento antes de confirmar.</p>' +
      (row.pixChave && row.pixBeneficiario ? '<h3>Doar por Pix</h3><p class="hint">Beneficiário: ' + escape(row.pixBeneficiario) + '</p><p class="pix-key">' + escape(row.pixChave) + '</p><button type="button" class="quiet" id="copy-pix">Copiar chave Pix</button>' : '') +
      (url ? '<p class="hint">Pagamento externo: ' + escape(new URL(url).hostname) + '</p><a class="button" href="' + escape(url) + '" target="_blank" rel="noopener noreferrer">Abrir página de doação ↗</a>' : '') +
      (row.orientacoesDoacao ? '<p class="donation-instructions">' + escape(row.orientacoesDoacao) + '</p>' : '') +
      '<p class="hint">O pagamento é feito fora do Ekklesia. Abrir o link ou copiar a chave não confirma uma doação; a liderança atualiza a arrecadação após conferir o recebimento.</p>';
    $('#copy-message').textContent = '';
    if ($('#copy-pix')) $('#copy-pix').onclick = async () => {
      try { await navigator.clipboard.writeText(row.pixChave); $('#copy-message').textContent = 'Chave Pix copiada.'; }
      catch { $('#copy-message').textContent = 'Não foi possível copiar automaticamente. Selecione e copie a chave acima.'; }
    };
    $('#donation-dialog').showModal();
  }
});
$('#logout').onclick = async () => {
  $('#logout').disabled = true;
  try { await logout(); location.replace('login.html'); }
  catch { message('Não foi possível sair. Tente novamente.'); $('#logout').disabled = false; }
};
window.addEventListener('hashchange', navigate);
window.addEventListener('pageshow', event => { if (event.persisted) location.reload(); });
try {
  await auth.authStateReady();
  if (!auth.currentUser) location.replace('login.html');
  else {
    const profile = await readProfile(auth.currentUser);
    if (!isActiveUser(profile)) { await logout(); location.replace('login.html'); }
    else if (isAdministrator(profile)) location.replace('inicio.html');
    else {
      $('#member-name').textContent = profile.nome;
      $('#portal-loading').hidden = true; $('#portal').hidden = false;
      navigate(); await refresh();
    }
  }
} catch (error) {
  $('#portal-loading').textContent = errorText(error) + ' Recarregue para tentar novamente. ';
  const link = document.createElement('a'); link.href = 'login.html'; link.textContent = 'Voltar ao login'; $('#portal-loading').append(link);
}
