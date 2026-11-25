import { initializeApp, deleteApp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import { getAuth, setPersistence, inMemoryPersistence, browserSessionPersistence, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, sendPasswordResetEmail } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import { getFirestore, collection, doc, getDoc, getDocFromServer, getDocs, limit, query, runTransaction, serverTimestamp, where } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import { auth, db, firebaseConfig } from './firebase-config.js';

export function isAdministrator(profile) {
  return profile?.perfil === 'administrador' && profile?.status === 'ativo';
}
export function isLeader(profile) { return profile?.perfil === 'lider' && profile?.status === 'ativo'; }
export function isActiveUser(profile) {
  return profile?.status === 'ativo' && ['administrador', 'membro', 'lider'].includes(profile?.perfil);
}
export function homeFor(profile) {
  return isAdministrator(profile) ? 'inicio.html' : profile?.perfil === 'lider' ? 'inicio-lider.html' : 'portal-membro.html';
}

export async function readProfile(user) {
  const snapshot = await getDocFromServer(doc(db, 'usuarios', user.uid));
  return snapshot.exists() ? snapshot.data() : null;
}

const normalizeChurchName = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').trim().replace(/\s+/g, ' ');

export async function searchChurches(term) {
  const normalized = normalizeChurchName(String(term || ''));
  if (normalized.length < 2) return [];
  const snapshots = await Promise.all(['ativa', 'ativo'].map(status =>
    getDocs(query(collection(db, 'igrejas'), where('status', '==', status), limit(100)))
  ));
  const churches = snapshots.flatMap(snapshot => snapshot.docs
    .map(item => ({ id: item.id, nome: item.data().nome })));
  return [...new Map(churches.map(church => [church.id, church])).values()]
    .filter(church => normalizeChurchName(church.nome).includes(normalized))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
    .slice(0, 10);
}

export async function searchChurchMinistries(churchId) {
  if (!churchId) return [];
  const snapshot = await getDoc(doc(db, 'catalogoMinisterios', churchId));
  const data = snapshot.exists() ? snapshot.data() : null;
  if (!data || data.igrejaId !== churchId || !Array.isArray(data.nomes)) return [];
  return [...new Set(data.nomes.filter(name => typeof name === 'string' && name.trim()).map(name => name.trim()))]
    .sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

export async function registerAccount({ nome, email, senha, perfil, tipoIgreja, igrejaId, nomeIgreja, ministerio }) {
  nome = nome.trim();
  email = email.trim().toLowerCase();
  ministerio = String(ministerio || '').trim();
  nomeIgreja = String(nomeIgreja || '').trim();
  if (nome.length < 2 || nome.length > 120 || !['administrador', 'membro'].includes(perfil) || senha.length < 8 || !ministerio || !['existente', 'nova'].includes(tipoIgreja)) {
    throw new Error('Confira o nome, o tipo de acesso, o ministério e a senha de pelo menos 8 caracteres.');
  }
  if ((tipoIgreja === 'existente' && !igrejaId) || (tipoIgreja === 'nova' && (nomeIgreja.length < 2 || nomeIgreja.length > 150))) {
    throw new Error(tipoIgreja === 'existente' ? 'Pesquise e selecione sua igreja.' : 'Informe o nome da igreja (de 2 a 150 caracteres).');
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
    const uid = credential.user.uid;
    const reference = doc(registrationDb, 'usuarios', uid);
    const churchReference = tipoIgreja === 'nova' ? doc(collection(registrationDb, 'igrejas')) : doc(registrationDb, 'igrejas', igrejaId);
    const requestReference = doc(registrationDb, 'solicitacoes', uid);
    const initialAdmin = tipoIgreja === 'nova';
    await runTransaction(registrationDb, async transaction => {
      const existing = await transaction.get(reference);
      if (existing.exists()) throw new Error('Esta conta já possui cadastro. Use a opção Entrar.');
      if (!initialAdmin) {
        const church = await transaction.get(churchReference);
        if (!church.exists() || !['ativa', 'ativo'].includes(church.data().status)) throw new Error('Esta igreja não está disponível. Pesquise novamente.');
      }
      const profile = {
        nome, email, ministerio, igrejaId: churchReference.id,
        perfilSolicitado: initialAdmin ? 'administrador' : perfil,
        perfil: initialAdmin ? 'administrador' : 'membro',
        status: initialAdmin ? 'ativo' : 'pendente',
        criadoEm: serverTimestamp()
      };
      if (initialAdmin) {
        transaction.set(churchReference, {
          nome: nomeIgreja, nomeNormalizado: normalizeChurchName(nomeIgreja),
          status: 'ativa', criadoEm: serverTimestamp()
        });
      } else {
        transaction.set(requestReference, {
          usuarioId: uid, igrejaId: churchReference.id, nome, email, ministerio,
          perfilSolicitado: perfil, status: 'pendente', criadoEm: serverTimestamp()
        });
      }
      transaction.set(reference, profile);
    });
    return { pending: !initialAdmin, initialAdmin, churchName: initialAdmin ? nomeIgreja : undefined };
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
      if (profile.status === 'pendente') throw new Error('Seu pedido de entrada na igreja aguarda aprovação de um administrador.');
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
    'permission-denied': 'O cadastro ou o vínculo com a igreja não foi autorizado pelas regras do Firestore. Confirme se as regras atualizadas foram publicadas e tente novamente.',
    'unavailable': 'O serviço está indisponível. Tente novamente com os mesmos dados.'
  };
  return messages[error.code] || (error.code ? 'Não foi possível concluir. Tente novamente.' : error.message);
}
