import { registerAccount, errorMessage } from './auth-service.js';
const form = document.querySelector('#registration-form');
const submit = document.querySelector('#submit-auth');
const feedback = document.querySelector('#auth-feedback');
const description = document.querySelector('#role-description');
let busy = false;
submit.disabled = false;
document.querySelector('#connection-note').hidden = true;
form.addEventListener('change', () => {
  description.textContent = form.elements.perfil.value === 'administrador'
    ? 'O acesso de administrador depende da aprovação do responsável pela comunidade.'
    : 'Você poderá visualizar os grupos, informar sua disponibilidade e apoiar as campanhas.';
});
form.elements.confirmacao.addEventListener('input', () => form.elements.confirmacao.setCustomValidity(''));
form.elements.senha.addEventListener('input', () => form.elements.confirmacao.setCustomValidity(''));
form.addEventListener('submit', async event => {
  event.preventDefault();
  if (busy) return;
  form.elements.confirmacao.setCustomValidity(form.elements.senha.value === form.elements.confirmacao.value ? '' : 'As senhas precisam ser iguais.');
  if (!form.reportValidity()) return;
  busy = true;
  submit.disabled = true;
  submit.textContent = 'Criando conta…';
  feedback.hidden = true;
  const input = Object.fromEntries(new FormData(form));
  try {
    const result = await registerAccount(input);
    feedback.dataset.kind = 'success';
    feedback.textContent = result.pending
      ? 'Conta criada! Seu pedido de acesso como Administrador aguarda aprovação do responsável pela comunidade.'
      : 'Conta de Membro criada! Entre para acessar sua comunidade.';
    form.reset();
    form.dispatchEvent(new Event('change'));
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
