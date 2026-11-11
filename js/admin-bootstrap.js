import { auth } from './firebase-config.js';
import { isAdministrator, isActiveUser, homeFor, readProfile, logout, errorMessage } from './auth-service.js';

const loading = document.querySelector('#access-loading');
window.addEventListener('pageshow', event => { if (event.persisted) window.location.reload(); });
try {
  await auth.authStateReady();
  if (!auth.currentUser) {
    window.location.replace('login.html');
  } else {
    const profile = await readProfile(auth.currentUser);
    if (!isAdministrator(profile)) {
      if (isActiveUser(profile)) window.location.replace(homeFor(profile));
      else { await logout(); window.location.replace('login.html'); }
    } else {
      const { initializeAdmin } = await import('./community-service.js');
      await initializeAdmin();
      await import('./gestao.js');
      if (document.body.classList.contains('dashboard-page')) await import('./inicio.js');
      if (document.body.dataset.page === 'escalas') await import('./disponibilidades.js');
      document.querySelectorAll('.user-info strong').forEach(node => { node.textContent = profile.nome; });
      document.querySelectorAll('.user-avatar').forEach(node => { node.textContent = profile.nome?.trim().slice(0, 1).toUpperCase() || 'A'; });
      document.querySelectorAll('a[href="login.html"]').forEach(link => {
        link.addEventListener('click', async event => {
          event.preventDefault();
          document.documentElement.classList.add('auth-checking');
          loading.hidden = false;
          loading.textContent = 'Encerrando sessão…';
          try { await logout(); window.location.replace('login.html'); }
          catch { loading.textContent = 'Não foi possível sair. Recarregue a página e tente novamente.'; }
        });
      });
      loading.hidden = true;
      document.documentElement.classList.remove('auth-checking');
    }
  }
} catch (error) {
  loading.textContent = errorMessage(error) + ' Recarregue a página para tentar novamente. ';
  const link = document.createElement('a');
  link.href = 'login.html';
  link.textContent = 'Voltar ao login';
  loading.append(link);
}
