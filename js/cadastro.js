import { registerAccount, searchChurches, searchChurchMinistries, errorMessage } from './auth-service.js';
const form = document.querySelector('#registration-form');
const submit = document.querySelector('#submit-auth');
const feedback = document.querySelector('#auth-feedback');
const description = document.querySelector('#role-description');
const existingChurchArea = document.querySelector('#igreja-existente-area');
const newChurchArea = document.querySelector('#nova-igreja-area');
const churchSearch = document.querySelector('#igreja-pesquisa');
const churchId = document.querySelector('#igrejaId');
const churchName = document.querySelector('#nome-igreja');
const churchResults = document.querySelector('#igreja-resultados');
const ministrySelect = document.querySelector('#ministerio');
const ministryHelp = document.querySelector('#ministerio-ajuda');
const memberRole = form.querySelector('input[name="perfil"][value="membro"]');
let searchTimer;
let ministryRequest = 0;
let busy = false;
submit.disabled = false;
document.querySelector('#connection-note').hidden = true;

function updateChurchMode() {
  const creating = form.elements.tipoIgreja.value === 'nova';
  existingChurchArea.hidden = creating;
  newChurchArea.hidden = !creating;
  churchSearch.required = !creating;
  churchName.required = creating;
  if (creating) {
    form.querySelector('input[name="perfil"][value="administrador"]').checked = true;
    memberRole.disabled = true;
    description.textContent = 'Você será o administrador inicial da nova igreja.';
  } else {
    memberRole.disabled = false;
    description.textContent = form.elements.perfil.value === 'administrador'
      ? 'Seu pedido de acesso como administrador precisará ser aprovado por um administrador da igreja.'
      : 'Depois da aprovação, você poderá visualizar os grupos, informar sua disponibilidade e apoiar as campanhas.';
  }
  ministryRequest++;
  ministrySelect.replaceChildren(new Option(creating ? 'Administração' : 'Selecione uma igreja primeiro', creating ? 'Administração' : ''));
  ministrySelect.value = creating ? 'Administração' : '';
  ministrySelect.disabled = !creating;
  ministryHelp.textContent = creating
    ? 'O administrador inicial representa a liderança da nova igreja.'
    : 'Escolha uma igreja para ver os ministérios cadastrados nela.';
  churchId.value = '';
  churchSearch.value = '';
  churchResults.textContent = 'Digite o nome da igreja para pesquisar.';
  churchSearch.setCustomValidity('');
  churchName.setCustomValidity('');
}

function updateRoleDescription() {
  if (form.elements.tipoIgreja.value === 'nova') return;
  description.textContent = form.elements.perfil.value === 'administrador'
    ? 'Seu pedido de acesso como administrador precisará ser aprovado por um administrador da igreja.'
    : 'Depois da aprovação, você poderá visualizar os grupos, informar sua disponibilidade e apoiar as campanhas.';
}

async function loadChurchMinistries(id) {
  const request = ++ministryRequest;
  ministrySelect.disabled = true;
  ministrySelect.replaceChildren(new Option('Carregando ministérios…', ''));
  ministryHelp.textContent = 'Buscando a lista desta igreja.';
  try {
    const names = await searchChurchMinistries(id);
    if (request !== ministryRequest || churchId.value !== id || form.elements.tipoIgreja.value !== 'existente') return;
    ministrySelect.replaceChildren(new Option(names.length ? 'Selecione seu ministério' : 'Nenhum ministério cadastrado', ''));
    for (const name of names) ministrySelect.add(new Option(name, name));
    ministrySelect.disabled = false;
    ministryHelp.textContent = names.length
      ? `${names.length} ministério(s) disponível(is) nesta igreja.`
      : 'Esta igreja ainda não cadastrou ministérios. Peça ao administrador para atualizar o sistema.';
  } catch (error) {
    if (request !== ministryRequest) return;
    ministrySelect.replaceChildren(new Option('Não foi possível carregar', ''));
    ministrySelect.disabled = false;
    ministryHelp.textContent = errorMessage(error);
  }
}

async function searchChurchesNow(term) {
  churchResults.textContent = 'Pesquisando igrejas…';
  try {
    const churches = await searchChurches(term);
    if (churchSearch.value.trim() !== term.trim() || form.elements.tipoIgreja.value !== 'existente') return;
    churchResults.replaceChildren();
    if (!churches.length) {
      churchResults.textContent = 'Nenhuma igreja encontrada. Confira o nome ou escolha cadastrar uma nova.';
      return;
    }
    const prompt = document.createElement('span');
    prompt.textContent = 'Selecione sua igreja: ';
    churchResults.append(prompt);
    for (const church of churches) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'quiet';
      button.textContent = church.nome;
      button.addEventListener('click', () => {
        churchId.value = church.id;
        churchSearch.value = church.nome;
        churchSearch.setCustomValidity('');
        churchResults.textContent = 'Igreja selecionada: ' + church.nome;
        loadChurchMinistries(church.id);
      });
      churchResults.append(button);
    }
  } catch (error) {
    churchResults.textContent = errorMessage(error);
  }
}

form.querySelectorAll('input[name="tipoIgreja"]').forEach(input => input.addEventListener('change', updateChurchMode));
churchSearch.addEventListener('input', () => {
  churchId.value = '';
  ministryRequest++;
  ministrySelect.replaceChildren(new Option('Selecione uma igreja primeiro', ''));
  ministrySelect.disabled = true;
  ministryHelp.textContent = 'Escolha uma igreja para ver os ministérios cadastrados nela.';
  churchSearch.setCustomValidity('');
  const term = churchSearch.value.trim();
  clearTimeout(searchTimer);
  if (term.length < 2) {
    churchResults.textContent = 'Digite ao menos 2 letras para pesquisar.';
    return;
  }
  searchTimer = setTimeout(() => searchChurchesNow(term), 250);
});
churchName.addEventListener('input', () => churchName.setCustomValidity(''));
ministrySelect.addEventListener('change', () => ministrySelect.setCustomValidity(''));
updateChurchMode();

form.querySelectorAll('input[name="perfil"]').forEach(input => input.addEventListener('change', updateRoleDescription));
form.elements.confirmacao.addEventListener('input', () => form.elements.confirmacao.setCustomValidity(''));
form.elements.senha.addEventListener('input', () => form.elements.confirmacao.setCustomValidity(''));
form.addEventListener('submit', async event => {
  event.preventDefault();
  if (busy) return;
  form.elements.confirmacao.setCustomValidity(form.elements.senha.value === form.elements.confirmacao.value ? '' : 'As senhas precisam ser iguais.');
  if (form.elements.tipoIgreja.value === 'existente' && !churchId.value) churchSearch.setCustomValidity('Pesquise e selecione uma igreja da lista.');
  if (form.elements.tipoIgreja.value === 'existente' && !ministrySelect.value) ministrySelect.disabled = false;
  ministrySelect.setCustomValidity(form.elements.tipoIgreja.value === 'existente' && !ministrySelect.value ? 'Selecione um ministério da igreja.' : '');
  if (form.elements.tipoIgreja.value === 'nova' && churchName.value.trim().length < 2) churchName.setCustomValidity('Informe o nome da igreja.');
  if (!form.reportValidity()) return;
  busy = true;
  submit.disabled = true;
  submit.textContent = 'Criando conta…';
  feedback.hidden = true;
  const input = Object.fromEntries(new FormData(form));
  try {
    const result = await registerAccount(input);
    feedback.dataset.kind = 'success';
    feedback.textContent = result.initialAdmin
      ? 'Igreja cadastrada e conta de administrador criada. Entre para acessar o Ekklesia.'
      : 'Conta criada! Seu pedido de entrada na igreja aguarda aprovação de um administrador.';
    form.reset();
    churchId.value = '';
    churchResults.textContent = 'Digite o nome da igreja para pesquisar.';
    updateChurchMode();
  } catch (error) {
    feedback.dataset.kind = 'error';
    feedback.textContent = errorMessage(error);
  } finally {
    feedback.hidden = false;
    feedback.focus();
    busy = false;
    submit.disabled = false;
    submit.textContent = 'Criar conta';
  }
});
