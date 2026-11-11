import { initializeApp, deleteApp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import { getAuth, setPersistence, inMemoryPersistence, browserSessionPersistence, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, sendPasswordResetEmail } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import { getFirestore, doc, getDocFromServer, runTransaction, serverTimestamp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import { auth, db, firebaseConfig } from './firebase-config.js';

export function isAdministrator(profile) {
  return profile?.perfil === 'administrador' && profile?.status === 'ativo';
}
export function isActiveUser(profile) {
  return profile?.status === 'ativo' && ['administrador', 'membro'].includes(profile?.perfil);
}
export function homeFor(profile) {
  return isAdministrator(profile) ? 'inicio.html' : 'portal-membro.html';
}

export async function readProfile(user) {
  const snapshot = await getDocFromServer(doc(db, 'usuarios', user.uid));
  return snapshot.exists() ? snapshot.data() : null;
}

export async function registerAccount({ nome, email, senha, perfil }) {
  nome = nome.trim();
  email = email.trim().toLowerCase();
  if (nome.length < 2 || nome.length > 120 || !['administrador', 'membro'].includes(perfil) || senha.length < 8) {
    throw new Error('Confira o nome, o tipo de acesso e a senha de pelo menos 8 caracteres.');
  }
  // Uma instância isolada não substitui uma sessão administrativa já aberta.
  const registrationApp = initializeApp(firebaseConfig, 'cadastro-' + crypto.randomUUID());
  const registrationAuth = getAuth(registrationApp);
  try {
    await setPersistence(registrationAuth, inMemoryPersistence);
    let credential;
    try {
      credential = await createUserWithEmailAndPassword(registrationAuth, email, senha);
    } catch (error) {
      if (error.code !== 'auth/email-already-in-use') throw error;
      // Recupera cadastro interrompido entre Authentication e Firestore somente
      // após comprovar a senha da conta. Nunca sobrescreve um perfil existente.
      credential = await signInWithEmailAndPassword(registrationAuth, email, senha);
    }
    const registrationDb = getFirestore(registrationApp);
    const reference = doc(registrationDb, 'usuarios', credential.user.uid);
    await runTransaction(registrationDb, async transaction => {
      const existing = await transaction.get(reference);
      if (existing.exists()) throw new Error('Esta conta já possui cadastro. Use a opção Entrar.');
      transaction.set(reference, {
        nome, email, perfilSolicitado: perfil, perfil: 'membro',
        status: perfil === 'administrador' ? 'pendente' : 'ativo',
        criadoEm: serverTimestamp()
      });
    });
    return { pending: perfil === 'administrador' };
  } finally {
    // Falha de limpeza não deve transformar um cadastro concluído em erro.
    try { await signOut(registrationAuth); } catch { /* instância em memória */ }
    try { await deleteApp(registrationApp); } catch { /* descartada ao sair */ }
  }
}

export async function login(email, password) {
  await setPersistence(auth, browserSessionPersistence);
  const credential = await signInWithEmailAndPassword(auth, email.trim(), password);
  try {
    const profile = await readProfile(credential.user);
    if (!isActiveUser(profile)) {
      await signOut(auth);
      if (!profile) throw new Error('Seu cadastro está incompleto. Volte a Criar conta e utilize o mesmo e-mail e senha para concluir.');
      if (profile.status === 'pendente') throw new Error('Seu pedido de acesso aguarda aprovação do responsável pela comunidade.');
      if (profile.status !== 'ativo') throw new Error('Seu acesso está desativado. Entre em contato com o responsável pela comunidade.');
      throw new Error('Seu perfil de acesso não é reconhecido. Contate o responsável pela comunidade.');
    }
    return profile;
  } catch (error) {
    await signOut(auth);
    throw error;
  }
}

export function logout() { return signOut(auth); }
export function resetPassword(email) { return sendPasswordResetEmail(auth, email.trim()); }

export function errorMessage(error) {
  const messages = {
    'auth/invalid-credential': 'Não foi possível autenticar. Confira o e-mail e a senha.',
    'auth/wrong-password': 'Não foi possível autenticar. Confira o e-mail e a senha.',
    'auth/user-not-found': 'Não foi possível autenticar. Confira o e-mail e a senha.',
    'auth/invalid-email': 'Informe um e-mail válido.',
    'auth/email-already-in-use': 'Este e-mail já tem uma conta. Entre ou recupere sua senha.',
    'auth/weak-password': 'A senha não atende à política de segurança. Use uma senha mais forte.',
    'auth/password-does-not-meet-requirements': 'A senha não atende à política de segurança configurada. Use uma senha mais forte.',
    'auth/operation-not-allowed': 'O cadastro por e-mail ainda não foi habilitado. Contate o responsável pelo sistema.',
    'auth/unauthorized-domain': 'Este endereço do site ainda não foi autorizado. Contate o responsável pelo sistema.',
    'auth/network-request-failed': 'Falha na conexão. Confira sua internet e tente novamente.',
    'auth/too-many-requests': 'Muitas tentativas. Aguarde um pouco antes de tentar novamente.',
    'auth/user-disabled': 'Esta conta está desativada. Contate o responsável pelo sistema.',
    'permission-denied': 'O acesso aos perfis ainda não foi autorizado. Contate o responsável. Depois, repita o cadastro com o mesmo e-mail e senha se necessário.',
    'unavailable': 'O serviço está indisponível. Tente novamente com os mesmos dados.'
  };
  return messages[error.code] || (error.code ? 'Não foi possível concluir. Tente novamente.' : error.message);
}
