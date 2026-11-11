import { cancelAvailability, refreshAdminAvailability } from './community-service.js';
import { availabilityState } from './community-model.js';
(() => {
  'use strict';
  if (document.body.dataset.page !== 'escalas') return;
  const { store, schedule } = window.Ekklesia;
  const $ = selector => document.querySelector(selector);
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const formatDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value) ? value.split('-').reverse().join('/') : 'Data inválida';
  const pageSize = 8;
  let page = 1;
  let entries = [];
  let loadFailed = false;
  let scales = [];
  const states = {
    available: ['Disponível',''], cancelled: ['Cancelada','neutral'],
    changed: ['Reconfirmar','amber'], past: ['Data passada','neutral'],
    unavailable: ['Cadastro indisponível','amber']
  };
  function entryState(record, member, scale) {
    const label = availabilityState(record, scale);
    return ({ 'Confirmada': 'available', 'Cancelada': 'cancelled', 'Reconfirmar': 'changed', 'Data passada': 'past' })[label] || 'unavailable';
  }
  function scaleLabel(scale) {
    return scale.nome + ' • ' + formatDate(scale.data) + ' • ' + scale.horario + ' • ' + scale.local;
  }
  function loadFilters() {
    const select = $('#availability-scale-filter');
    const previous = select.value;
    const options = [...scales].sort((a,b)=>(a.data+a.horario).localeCompare(b.data+b.horario));
    select.innerHTML = '<option value="">Todas as escalas</option>' + options.map(scale=>'<option value="'+escape(scale.id)+'">'+escape(scaleLabel(scale))+'</option>').join('');
    const missing = [...new Set(entries.filter(entry=>!entry.scale).map(entry=>entry.record.id_escala))];
    select.innerHTML += missing.map(id=>'<option value="'+escape(id)+'">Escala removida ('+escape(id)+')</option>').join('');
    if (previous && ![...select.options].some(option=>option.value===previous)) select.add(new Option('Escala não encontrada ('+previous+')',previous));
    select.value = previous;
  }
  function render() {
    if (loadFailed) return;
    const scaleId = $('#availability-scale-filter').value;
    const state = $('#availability-state-filter').value;
    const query = normalize($('#availability-search').value.trim());
    const rows = entries.filter(entry=>(!scaleId || entry.record.id_escala===scaleId) && (!state || entry.state===state) &&
      (!query || normalize([entry.member?.nome,entry.member?.ministerio,entry.record.observacao,entry.scale?.nome].join(' ')).includes(query)));
    const pages = Math.max(1,Math.ceil(rows.length/pageSize));
    page = Math.max(1,Math.min(page,pages));
    const offset = (page-1)*pageSize;
    $('#availabilities-table tbody').innerHTML = rows.length ? rows.slice(offset,offset+pageSize).map(entry=>{
      const { record, member, scale, state } = entry;
      const [label,color] = states[state];
      const memberName = member?.nome || 'Membro removido ('+record.id_membro+')';
      const scaleName = scale?.nome || 'Escala removida ('+record.id_escala+')';
      const updated = state==='changed' ? '<span class="cell-sub">Atual: '+formatDate(scale.data)+' às '+escape(scale.horario)+'</span>' : '';
      return '<tr><td><strong>'+escape(memberName)+'</strong>'+(member?.status==='Inativo'?'<span class="cell-sub">Membro inativo</span>':'')+'</td>'+
        '<td>'+escape(scaleName)+'<span class="cell-sub">'+escape(scale?.local || 'Cadastro não encontrado')+'</span></td>'+
        '<td>'+formatDate(record.data)+' • '+escape(record.horario)+updated+'</td><td>'+escape(member?.ministerio || 'Não informado')+'</td>'+
        '<td class="availability-observation">'+escape(record.observacao || 'Sem observação')+'</td>'+
        '<td><span class="badge '+color+'">'+label+'</span></td><td>'+(record.disponivel?'<button type="button" class="button secondary danger" data-cancel-availability="'+escape(record.id)+'" aria-label="Cancelar disponibilidade de '+escape(memberName)+' para '+escape(scaleName)+'">Cancelar</button>':'—')+'</td></tr>';
    }).join('') : '<tr><td colspan="7" class="empty-state"><strong>Nenhuma disponibilidade encontrada</strong>'+ (entries.length?'Ajuste os filtros ou atualize a lista.':'As respostas enviadas pelos membros aparecerão aqui.')+'</td></tr>';
    const valid = entries.filter(entry=>entry.state==='available' && (!scaleId || entry.record.id_escala===scaleId));
    const total = new Set(valid.map(entry=>entry.record.id_membro)).size;
    const scale = scales.find(row=>row.id===scaleId);
    $('#availability-scale-summary').textContent = (scale ? scaleLabel(scale)+'. ' : scaleId ? 'Escala removida. ' : 'Todas as escalas. ') + total + ' membro(s) com disponibilidade válida para '+(scaleId?'esta escala.':'escalas futuras.');
    $('#availability-result-count').textContent = rows.length ? 'Mostrando '+(offset+1)+' a '+Math.min(offset+pageSize,rows.length)+' de '+rows.length+' registros' : 'Nenhum registro encontrado';
    $('#availability-pagination').innerHTML = '<button type="button" class="page-button" data-availability-page="'+(page-1)+'" aria-label="Página anterior" '+(page===1?'disabled':'')+'>‹</button><span class="availability-page-label">'+page+' / '+pages+'</span><button type="button" class="page-button" data-availability-page="'+(page+1)+'" aria-label="Próxima página" '+(page===pages?'disabled':'')+'>›</button>';
  }
  function refresh() {
    try {
      const data = store.load();

      scales = data.escalas;
      const scaleMap = new Map(scales.map(scale=>[scale.id,scale]));
      entries = store.loadAvailability().map(record=>{
        record.id_membro = record.usuarioId;
        record.id_escala = record.escalaId;
        const member = { nome: record.nome, ministerio: 'Conta de membro', status: 'Ativo' };
        const scale = scaleMap.get(record.escalaId);
        return {record,member,scale,state:entryState(record,member,scale)};
      }).sort((a,b)=>(a.record.data+a.record.horario).localeCompare(b.record.data+b.record.horario) || (a.member?.nome || '').localeCompare(b.member?.nome || '','pt-BR'));
      loadFailed = false;
      $('#availability-list-error').hidden = true;
      loadFilters(); render();
    } catch {
      loadFailed = true;
      $('#availability-list-error').textContent = 'Não foi possível ler as disponibilidades da comunidade. Os registros salvos não foram alterados. Reabra a aba para tentar novamente.';
      $('#availability-list-error').hidden = false;
      $('#availabilities-table tbody').innerHTML = '';
      $('#availability-result-count').textContent = 'Dados indisponíveis';
      $('#availability-pagination').innerHTML = '';
      $('#availability-scale-summary').textContent = '';
    }
  }
  function showAvailabilities(show) {
    $('#schedules-view').hidden = show;
    $('#availabilities-view').hidden = !show;
    $('#calendar-toggle').hidden = show;
    $('#add-record').hidden = show;
    $('#show-schedules').setAttribute('aria-pressed',String(!show));
    $('#show-availabilities').setAttribute('aria-pressed',String(show));
    if (show) refresh();
  }
  function requestCancellation(id) {
    const entry = entries.find(item=>item.record.id===id);
    if (!entry) return;
    const dialog = $('#record-dialog');
    $('#dialog-title').textContent = 'Cancelar disponibilidade';
    $('#dialog-content').innerHTML = '<p class="context-note">Cancelar a disponibilidade de '+escape(entry.member?.nome || 'membro removido')+' para '+escape(entry.scale?.nome || 'escala removida')+', em '+formatDate(entry.record.data)+' às '+escape(entry.record.horario)+'? O registro continuará no histórico como cancelado.</p><p class="form-error" id="cancellation-error" role="alert"></p><div class="dialog-actions"><button type="button" class="button secondary" id="keep-availability">Voltar</button><button type="button" class="button danger secondary" id="confirm-cancellation">Cancelar disponibilidade</button></div>';
    $('#keep-availability').onclick = ()=>dialog.close();
    $('#confirm-cancellation').onclick = async ()=>{
      $('#confirm-cancellation').disabled = true;
      try { await cancelAvailability(id); await refreshAdminAvailability(); dialog.close(); refresh(); }
      catch (error) { $('#cancellation-error').textContent = 'Não foi possível cancelar. Confira a conexão e tente novamente.'; $('#confirm-cancellation').disabled = false; }
    };
    dialog.showModal();
    $('#keep-availability').focus();
  }
  $('#show-schedules').addEventListener('click',()=>showAvailabilities(false));
  $('#show-availabilities').addEventListener('click',()=>showAvailabilities(true));
  function openScaleAvailability(id) {
    showAvailabilities(true);
    $('#availability-search').value='';
    $('#availability-state-filter').value='';
    const select = $('#availability-scale-filter');
    if (id && ![...select.options].some(option=>option.value===id)) select.add(new Option('Escala não encontrada ('+id+')',id));
    select.value=id || '';
    page=1;render();$('#show-availabilities').focus();
  }
  document.addEventListener('click',event=>{
    const shortcut = event.target.closest('[data-availability-scale]');
    if (shortcut) openScaleAvailability(shortcut.dataset.availabilityScale);
  });
  $('#availability-filters').addEventListener('submit',event=>event.preventDefault());
  $('#availability-filters').addEventListener('input',()=>{page=1;render();});
  $('#availability-filters').addEventListener('change',()=>{page=1;render();});
  $('#availability-filters').addEventListener('reset',()=>setTimeout(()=>{page=1;render();},0));
  $('#availability-pagination').addEventListener('click',event=>{
    const button = event.target.closest('[data-availability-page]');
    if (button && !button.disabled) { page=Number(button.dataset.availabilityPage);render(); }
  });
  $('#availabilities-table').addEventListener('click',event=>{
    const button = event.target.closest('[data-cancel-availability]');
    if (button) requestCancellation(button.dataset.cancelAvailability);
  });
  store.subscribe(refresh);
  $('#refresh-availabilities').addEventListener('click', async event => {
    const button = event.currentTarget;
    button.disabled = true;
    try { await refreshAdminAvailability(); refresh(); }
    catch { $('#availability-list-error').hidden = false; $('#availability-list-error').textContent = 'Não foi possível atualizar. A lista mantém a última leitura.'; }
    finally { button.disabled = false; }
  });
  refresh();
  if (window.location.hash === '#disponibilidades') openScaleAvailability(new URLSearchParams(window.location.search).get('escala'));
})();
