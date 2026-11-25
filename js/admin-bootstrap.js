import { auth } from './firebase-config.js';
import { isAdministrator, isLeader, isActiveUser, homeFor, readProfile, logout, errorMessage } from './auth-service.js';

const loading = document.querySelector('#access-loading');
window.addEventListener('pageshow', event => { if (event.persisted) window.location.reload(); });
try {
  await auth.authStateReady();
  if (!auth.currentUser) {
    window.location.replace('login.html');
  } else {
    const profile = await readProfile(auth.currentUser);
    if (!isAdministrator(profile) && !isLeader(profile)) {
      if (isActiveUser(profile)) window.location.replace(homeFor(profile));
      else { await logout(); window.location.replace('login.html'); }
    } else {
      if (isLeader(profile) && !['membros','ministerios','celulas'].includes(document.body.dataset.page)) { window.location.replace('inicio-lider.html'); throw new Error("Redirecionando para os vínculos de membros."); }
      if (document.body.dataset.page === 'solicitacoes') {
        const { mountAccessRequests } = await import('./access-requests.js');
        await mountAccessRequests(profile);
      } else {
        const { initializeAdmin } = await import('./community-service.js');
        await initializeAdmin(profile);
        await import('./gestao.js');
      }
      const notifications = document.querySelector('.notification-button');
      if (notifications && isLeader(profile)) notifications.hidden = true;
      if (notifications && !isLeader(profile)) {
        notifications.setAttribute('aria-label', 'Abrir solicitações de acesso');
        notifications.title = 'Solicitações de acesso';
        notifications.onclick = () => { window.location.href = 'solicitacoes.html'; };
      }
      if (document.body.classList.contains('dashboard-page')) await import('./inicio.js');
      if (document.body.dataset.page === 'escalas') {
        await import('./disponibilidades.js');
        await import('./agente-interface.js');
      }
      if (isLeader(profile)) { const {mountLeaderLayout}=await import('./leader-layout.js');mountLeaderLayout(); }
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
      const { mountUserProfile } = await import('./user-profile.js');
      mountUserProfile(profile);
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
