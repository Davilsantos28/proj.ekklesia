import { login, homeFor, resetPassword, errorMessage } from './auth-service.js';
const form = document.querySelector('#login-form');
const submit = document.querySelector('#submit-auth');
const reset = document.querySelector('#reset-password');
const feedback = document.querySelector('#auth-feedback');
let busy = false;
submit.disabled = reset.disabled = false;
document.querySelector('#connection-note').hidden = true;
function show(message, kind = 'error') {
  feedback.textContent = message;
  feedback.dataset.kind = kind;
  feedback.hidden = false;
  feedback.focus();
}
form.addEventListener('submit', async event => {
  event.preventDefault();
  if (busy || !form.reportValidity()) return;
  busy = true;
  submit.disabled = reset.disabled = true;
  submit.textContent = 'Entrando…';
  feedback.hidden = true;
  try {
    const profile = await login(form.elements.email.value, form.elements.senha.value);
    window.location.replace(homeFor(profile));
  } catch (error) { show(errorMessage(error)); }
  finally {
    busy = false;
    submit.disabled = reset.disabled = false;
    submit.textContent = 'Entrar';
  }
});
reset.addEventListener('click', async () => {
  if (busy || !form.elements.email.reportValidity()) return;
  busy = true;
  submit.disabled = reset.disabled = true;
  try {
    await resetPassword(form.elements.email.value);
    show('Se houver uma conta para este e-mail, você receberá instruções para redefinir a senha.', 'success');
  } catch (error) { show(error.code === 'auth/user-not-found' ? 'Se houver uma conta para este e-mail, você receberá instruções para redefinir a senha.' : errorMessage(error)); }
  finally { busy = false; submit.disabled = reset.disabled = false; }
});
