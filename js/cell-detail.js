import {cellParticipants, normalize} from './community-model.js';
import {adminIcon} from './admin-icons.js';
import {editMemberAccess} from './member-access.js';

const labels = {nome:'Nome', lider:'Líder', dia:'Dia', horario:'Horário', local:'Local', status:'Status', ministerio:'Ministério', funcao:'Função'};
const show = value => ({membro:'Membro', lider:'Líder'})[value] || value || '—';

export function mountCellDetail({getData, isLeader, editCell, onMemberSaved}) {
  const root = document.querySelector('#cell-detail');
  const list = document.querySelector('#cell-list');
  const $ = selector => root.querySelector(selector);
  const dialogs = {
    dialog: document.querySelector('#record-dialog'), title: document.querySelector('#dialog-title'),
    content: document.querySelector('#dialog-content')
  };
  const filters = $('#participant-filters');
  $('#cell-heading-icon').innerHTML = adminIcon('users');
  let page = 1;
  let cell;
  let opener;
  const pageSize = 5;
  const selected = () => new URLSearchParams(location.hash.slice(1)).get('celula');
  const stats = [['Participantes', 'users'], ['Líder', 'users'], ['Dia', 'calendar'], ['Horário', 'clock'], ['Local', 'pin']];
  const memberNames = new Map();

  function node(tag, text, className) {
    const element = document.createElement(tag);
    element.textContent = text;
    if (className) element.className = className;
    return element;
  }
  function pair(label, value) {
    const row = node('div', '');
    row.append(node('dt', label), node('dd', show(value)));
    return row;
  }
  function setTab(tab, moveFocus = false) {
    root.querySelectorAll('[role="tab"]').forEach(button => {
      const active = button.dataset.cellTab === tab;
      button.setAttribute('aria-selected', String(active));
      button.tabIndex = active ? 0 : -1;
      $('#' + button.getAttribute('aria-controls')).hidden = !active;
      if (active && moveFocus) button.focus();
    });
  }
  function fillSelect(select, values) {
    const previous = select.value;
    select.replaceChildren(new Option('Todos', ''), ...[...new Set(values.filter(Boolean))]
      .sort((a,b) => a.localeCompare(b,'pt-BR')).map(value => new Option(value, value)));
    select.value = values.includes(previous) ? previous : '';
  }
  function participantAction(icon, label, handler) {
    const button = node('button', '', 'icon-button');
    button.type = 'button';
    button.innerHTML = adminIcon(icon);
    button.setAttribute('aria-label', label);
    button.title = label;
    button.addEventListener('click', handler);
    return button;
  }
  function renderTable() {
    const query = normalize(filters.elements.busca.value);
    const ministerio = filters.elements.ministerio.value;
    const status = filters.elements.status.value;
    const matching = [...memberNames.values()].filter(member =>
      (!ministerio || member.ministerio === ministerio) && (!status || member.status === status) &&
      ['nome','ministerio','funcao','status'].some(field => normalize(member[field]).includes(query)))
      .sort((a,b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR'));
    const pages = Math.max(1, Math.ceil(matching.length / pageSize));
    page = Math.min(page, pages);
    const start = (page - 1) * pageSize;
    const tbody = $('#cell-participants-table tbody');
    tbody.replaceChildren();
    for (const member of matching.slice(start, start + pageSize)) {
      const row = node('tr', '');
      const name = node('div', '', 'cell-name');
      const initials = String(member.nome || '').trim().split(/\s+/).slice(0, 2).map(word => word[0]).join('').toUpperCase();
      const avatar = node('span', initials, 'record-avatar');
      avatar.setAttribute('aria-hidden', 'true');
      name.append(avatar, node('strong', show(member.nome)));
      const nameCell = node('td', '');
      nameCell.append(name);
      row.append(nameCell, node('td', show(member.ministerio)), node('td', show(member.funcao)));
      const badge = node('td', '');
      badge.append(node('span', show(member.status), member.status === 'Ativo' ? 'badge' : 'badge neutral'));
      const actions = node('div', '', 'actions');
      actions.append(participantAction('view', 'Visualizar ' + member.nome, () => {
        dialogs.title.textContent = member.nome;
        const fields = node('dl', '', 'details-list');
        fields.append(...['ministerio','funcao','status'].map(field => pair(labels[field], member[field])));
        dialogs.content.replaceChildren(fields);
        dialogs.dialog.showModal();
      }), participantAction('edit', 'Editar ' + member.nome, () => {
        editMemberAccess(member, getData(), {leader: isLeader(), onSaved: onMemberSaved});
      }));
      const actionCell = node('td', '');
      actionCell.append(actions);
      row.append(badge, actionCell);
      tbody.append(row);
    }
    if (!matching.length) {
      const row = node('tr', '');
      const empty = node('td', memberNames.size ? 'Nenhum participante corresponde aos filtros.' : 'Nenhum participante vinculado a esta célula.', 'empty-state');
      empty.colSpan = 5;
      row.append(empty);
      tbody.append(row);
    }
    $('#participant-count').textContent = matching.length
      ? 'Mostrando ' + (start + 1) + ' a ' + Math.min(start + pageSize, matching.length) + ' de ' + matching.length + ' participantes'
      : '0 participantes';
    const nav = $('#participant-pagination');
    nav.replaceChildren();
    for (const [value, text, label] of [[page-1,'‹','Página anterior'],
      ...Array.from({length:pages},(_,i) => i+1).filter(i => i===1 || i===pages || Math.abs(i-page)<=1).map(i => [i,i,'Página '+i]),
      [page+1,'›','Próxima página']]) {
      const button = node('button', text, 'page-button');
      button.type = 'button';
      button.disabled = value < 1 || value > pages;
      button.setAttribute('aria-label', label);
      if (value === page) button.setAttribute('aria-current', 'page');
      button.onclick = () => {
        page = value;
        renderTable();
        nav.querySelector('[aria-current="page"]')?.focus();
      };
      nav.append(button);
    }
  }
  function refresh() {
    const data = getData();
    const id = selected();
    const previous = cell?.id;
    cell = data.celulas.find(row => row.id === id);
    list.hidden = Boolean(id);
    root.hidden = !id;
    $('#cell-missing').hidden = !id || Boolean(cell);
    $('#cell-record').hidden = !cell;
    document.querySelector('#cell-breadcrumb').textContent = cell ? ' / ' + cell.nome : '';
    if (!cell) {
      if (previous) (opener?.isConnected ? opener : list.querySelector('h2'))?.focus();
      return;
    }
    if (previous !== id) {
      filters.reset();
      page = 1;
      setTab('participants');
    }
    $('#cell-title').textContent = cell.nome;
    $('#edit-cell-detail').hidden = isLeader();
    const members = cellParticipants(cell, data.celulas, data.membros);
    memberNames.clear();
    members.forEach(member => memberNames.set(member.id, member));
    const cards = $('#cell-cards');
    cards.replaceChildren();
    [members.length,cell.lider,cell.dia,cell.horario,cell.local].forEach((value,i) => {
      const [label,icon] = stats[i];
      const card = node('div', '', 'stat-card');
      const symbol = node('span', '', 'stat-icon');
      symbol.innerHTML = adminIcon(icon);
      const text = node('div', '');
      text.append(node('span', label), node('strong', value ?? '—'));
      card.append(symbol,text);
      cards.append(card);
    });
    $('#cell-info-list').replaceChildren(...['nome','lider','ministerio','dia','horario','local','status']
      .map(field => pair(labels[field],cell[field])));
    fillSelect(filters.elements.ministerio, members.map(row => row.ministerio));
    fillSelect(filters.elements.status, members.map(row => row.status));
    renderTable();
    if (previous !== id) $('#cell-title').focus();
  }
  root.querySelectorAll('[role="tab"]').forEach(button => {
    button.onclick = () => setTab(button.dataset.cellTab);
    button.onkeydown = event => {
      if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
      event.preventDefault();
      const tab = event.key === 'Home' ? 'participants' : event.key === 'End' ? 'info' :
        button.dataset.cellTab === 'info' ? 'participants' : 'info';
      setTab(tab, true);
    };
  });
  $('#cell-back').onclick = () => {
    history.replaceState(null, '', location.pathname + location.search);
    refresh();
  };
  $('#edit-cell-detail').onclick = () => { if (cell && !isLeader()) editCell(cell); };
  filters.onsubmit = event => event.preventDefault();
  filters.oninput = () => { page = 1; renderTable(); };
  filters.onreset = () => setTimeout(() => { page = 1; renderTable(); }, 0);
  window.addEventListener('hashchange', refresh);
  refresh();
  return {
    refresh,
    open(id, trigger) {
      opener = trigger;
      history.pushState(null, '', '#' + new URLSearchParams({celula:id}));
      refresh();
    }
  };
}
