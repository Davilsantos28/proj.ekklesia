import './dados.js';
import { db, auth } from './firebase-config.js';
import { collection, doc, getDoc, getDocs, onSnapshot, query, where, writeBatch, runTransaction, serverTimestamp, Timestamp, setDoc } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import { publicMember, eventStart, isOpenWorship, safePaymentUrl } from './community-model.js';

const modules = ['membros', 'bandas', 'ministerios', 'celulas', 'escalas', 'campanhas'];
let cache = {};
let availabilityCache = [];
let activeChurchId = null;
let leaderMode = false;
export function isLeaderMode() { return leaderMode; }
let tenancyReady = true;
const listeners = new Set();
const clone = value => structuredClone(value);
const rows = snapshot => snapshot.docs.map(item => ({ ...item.data(), id: item.id }));
function publish() { for (const listener of listeners) listener(); }
export async function readCollection(name, ...conditions) {
  const scopedConditions = activeChurchId ? [...conditions, where('igrejaId', '==', activeChurchId)] : conditions;
  return rows(await getDocs(query(collection(db, name), ...scopedConditions)));
}
export async function readLeaderWorships() {
 if(!auth.currentUser)throw new Error('Entre novamente.');
 const snapshot=await getDoc(doc(db,'usuarios',auth.currentUser.uid));
 const profile=snapshot.exists()?snapshot.data():null;
 if(profile?.perfil!=='lider'||profile?.status!=='ativo'||!profile?.igrejaId)throw new Error('Sua conta precisa estar ativa como Líder e vinculada à igreja.');
 const result=await getDocs(query(collection(db,'escalas'),where('igrejaId','==',profile.igrejaId)));
 return rows(result).filter(row=>row.igrejaId===profile.igrejaId&&isOpenWorship(row)).sort((a,b)=>eventStart(a)-eventStart(b));
}
export async function initializeAdmin(profile) {
  if (!profile && auth.currentUser) {
    const snapshot = await getDoc(doc(db, 'usuarios', auth.currentUser.uid));
    profile = snapshot.exists() ? snapshot.data() : null;
  }
  leaderMode = profile?.perfil === 'lider';
  activeChurchId = profile?.igrejaId || null;
  tenancyReady = await readTenancyReady();
  const results = await Promise.all(modules.map(async name => [name, leaderMode && !['membros','ministerios','celulas','bandas'].includes(name) ? [] : await readCollection(name)]));
  cache = Object.fromEntries(results);
  if (activeChurchId && tenancyReady && !leaderMode) await syncMinistryCatalog(cache.ministerios);
  if (document.body.dataset.page === 'escalas') availabilityCache = await readCollection('disponibilidades');
  window.Ekklesia.store = {
    load: () => clone(cache), loadAvailability: () => clone(availabilityCache),
    tenancyReady,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); }
  };
  window.Ekklesia.schemas.escalas.fields = [
    ['tipo', 'Tipo de evento', 'select', ['Culto', 'Ensaio', 'Evento']],
    ...window.Ekklesia.schemas.escalas.fields
  ];
  window.Ekklesia.schemas.campanhas.fields.push(
    ['paymentUrl', 'Link de pagamento HTTPS (opcional)', 'url'],
    ['pixChave', 'Chave Pix (opcional)'], ['pixBeneficiario', 'Beneficiário do Pix (obrigatório se houver chave)'],
    ['orientacoesDoacao', 'Como entregar doações / orientações (opcional)', 'textarea']
  );
  if (document.body.dataset.page === 'escalas' && activeChurchId && !leaderMode) {
    const source = query(collection(db, 'disponibilidades'), where('igrejaId', '==', activeChurchId));
    const unsubscribe = onSnapshot(source, snapshot => {
      availabilityCache = rows(snapshot);
      publish();
    }, () => {
      const error = document.querySelector('#availability-list-error');
      if (error) {
        error.hidden = false;
        error.textContent = 'A atualização automática foi interrompida. Atualize a lista para tentar novamente.';
      }
    });
    window.addEventListener('pagehide', unsubscribe, {once:true});
  }
}
async function syncMinistryCatalog(rows) {
  const names = [...new Set(rows
    .filter(row => !row.status || ['ativo', 'ativa'].includes(String(row.status).trim().toLocaleLowerCase('pt-BR')))
    .map(row => String(row.nome || '').trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const reference = doc(db, 'catalogoMinisterios', activeChurchId);
  const snapshot = await getDoc(reference);
  const previous = snapshot.exists() && Array.isArray(snapshot.data().nomes) ? snapshot.data().nomes : [];
  if (snapshot.exists() && snapshot.data().igrejaId === activeChurchId
      && JSON.stringify([...previous].sort()) === JSON.stringify(names)) return;
  await setDoc(reference, { igrejaId: activeChurchId, nomes: names });
}
async function readTenancyReady() {
  if (!activeChurchId) return true;
  const snapshot = await getDoc(doc(db, 'system', 'tenancy'));
  return snapshot.exists() && snapshot.data().migrationComplete === true;
}
export function adminData() { return clone(cache); }
export function updateCachedMember(row) {
 const index=cache.membros.findIndex(item=>item.id===row.id);
 if(index>=0)cache.membros[index]=row;
 publish();
}
export function optionalField(field, type) {
  return type === 'textarea' || ['banda', 'paymentUrl', 'pixChave', 'pixBeneficiario'].includes(field);
}
export async function saveRecord(module, record, editing = false) {
  if (leaderMode) throw new Error('Use a edição de vínculos. O líder não gerencia cadastros.');
  if (!modules.includes(module)) throw new Error('Módulo desconhecido.');
  if (activeChurchId && !tenancyReady) throw new Error('A migração dos dados desta igreja ainda não foi concluída. Os módulos estão em modo de leitura.');
  const reference = editing ? doc(db, module, record.id) : doc(collection(db, module));
  const value = {};
  for (const [field] of window.Ekklesia.schemas[module].fields) value[field] = record[field] ?? '';
  if (activeChurchId) value.igrejaId = activeChurchId;
  if (module === 'escalas') {
    const start = eventStart(value);
    if (!start) throw new Error('Informe uma data e um horário válidos.');
    value.inicioEm = Timestamp.fromDate(start);
  }
  if (module === 'campanhas') {
    if (value.paymentUrl && !safePaymentUrl(value.paymentUrl)) throw new Error('O link de pagamento deve começar com https:// e não pode conter credenciais.');
    if (value.pixChave && !value.pixBeneficiario) throw new Error('Informe o beneficiário da chave Pix.');
  }
  const batch = writeBatch(db);
  if (editing) batch.update(reference, value); else batch.set(reference, value);
  if (module === 'ministerios' && activeChurchId) {
    const nextRows = cache.ministerios.filter(item => item.id !== reference.id);
    nextRows.push({ ...value, id: reference.id });
    const names = [...new Set(nextRows
      .filter(item => !item.status || ['ativo', 'ativa'].includes(String(item.status).trim().toLocaleLowerCase('pt-BR')))
      .map(item => String(item.nome || '').trim()).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, 'pt-BR'));
    batch.set(doc(db, 'catalogoMinisterios', activeChurchId), { igrejaId: activeChurchId, nomes: names });
  }
  if (module === 'membros') batch.set(doc(db, 'comunidadeMembros', reference.id), {
    ...publicMember(value), ...(activeChurchId ? { igrejaId: activeChurchId } : {})
  });
  await batch.commit();
  const index = cache[module].findIndex(item => item.id === reference.id);
  const saved = { ...cache[module][index], ...value, id: reference.id };
  if (index < 0) cache[module].unshift(saved); else cache[module][index] = saved;
  publish();
  return saved;
}
export async function removeRecord(module, id) {
  if (leaderMode) throw new Error('Use a edição de vínculos. O líder não gerencia cadastros.');
  if (!modules.includes(module)) throw new Error('Módulo desconhecido.');
  if (activeChurchId && !tenancyReady) throw new Error('A migração dos dados da igreja ainda não foi concluída. Os módulos estão em modo de leitura.');
  const batch = writeBatch(db);
  batch.delete(doc(db, module, id));
  if (module === 'ministerios' && activeChurchId) {
    const names = [...new Set(cache.ministerios.filter(item => item.id !== id)
      .filter(item => !item.status || ['ativo', 'ativa'].includes(String(item.status).trim().toLocaleLowerCase('pt-BR')))
      .map(item => String(item.nome || '').trim()).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, 'pt-BR'));
    batch.set(doc(db, 'catalogoMinisterios', activeChurchId), { igrejaId: activeChurchId, nomes: names });
  }
  if (module === 'membros') batch.delete(doc(db, 'comunidadeMembros', id));
  await batch.commit();
  cache[module] = cache[module].filter(item => item.id !== id);
  publish();
}
export async function publishExistingMembers() {
  if (activeChurchId && !tenancyReady) throw new Error('A migração dos dados da igreja ainda não foi concluída.');
  // Ação administrativa explícita, não executada na abertura do painel.
  const members = await readCollection('membros');
  const previous = await readCollection('comunidadeMembros');
  const ids = new Set(members.map(row => row.id));
  const operations = [
    ...members.map(row => ['set', row.id, { ...publicMember(row), ...(activeChurchId ? { igrejaId: activeChurchId } : {}) }]),
    ...previous.filter(row => !ids.has(row.id)).map(row => ['delete', row.id])
  ];
  for (let i = 0; i < operations.length; i += 100) {
    const batch = writeBatch(db);
    for (const [action, id, value] of operations.slice(i, i + 100)) {
      const ref = doc(db, 'comunidadeMembros', id);
      if (action === 'set') batch.set(ref, value); else batch.delete(ref);
    }
    await batch.commit();
  }
  return members.length;
}
export async function readMemberData(uid) {
  const profileSnapshot = await getDoc(doc(db, 'usuarios', uid));
  if (!profileSnapshot.exists() || profileSnapshot.data().status !== 'ativo' || profileSnapshot.data().perfil !== 'membro') {
    throw new Error('Seu perfil não está ativo para acessar o portal. Entre novamente.');
  }
  activeChurchId = profileSnapshot.data().igrejaId || null;
  tenancyReady = await readTenancyReady();
  const names = ['ministerios', 'celulas', 'escalas', 'campanhas', 'comunidadeMembros'];
  const results = await Promise.all(names.map(async name => [name, await readCollection(name)]));
  return { ...Object.fromEntries(results), disponibilidades: await readCollection('disponibilidades', where('usuarioId', '==', uid)) };
}
export async function saveOwnAvailability(scaleId, observation, expected) {
  if (!auth.currentUser) throw new Error('Entre novamente para informar disponibilidade.');
  if (activeChurchId && !tenancyReady) throw new Error('A migração dos dados da igreja ainda não foi concluída.');
  const uid = auth.currentUser.uid;
  const ref = doc(db, 'disponibilidades', uid + '_' + scaleId);
  return runTransaction(db, async transaction => {
    const scaleSnapshot = await transaction.get(doc(db, 'escalas', scaleId));
    const profileSnapshot = await transaction.get(doc(db, 'usuarios', uid));
    if (!scaleSnapshot.exists()) throw new Error('Este culto foi removido. Atualize a página.');
    if (!profileSnapshot.exists() || profileSnapshot.data().status !== 'ativo' || profileSnapshot.data().perfil !== 'membro') throw new Error('Seu perfil não está ativo para informar disponibilidade.');
    const scale = scaleSnapshot.data();
    if (!isOpenWorship(scale)) throw new Error('Este culto não está mais disponível. Atualize a página.');
    if ((profileSnapshot.data().igrejaId || null) !== (scale.igrejaId || null)) throw new Error('Este culto não pertence à sua igreja. Atualize a página.');
    if (scale.data !== expected.data || scale.horario !== expected.horario) throw new Error('A data ou o horário mudou. Atualize a página e selecione novamente.');
    const record = {
      usuarioId: uid, escalaId: scaleId, nome: profileSnapshot.data().nome,
      cultoNome: scale.nome, data: scale.data, horario: scale.horario, local: scale.local,
      disponivel: true, observacao: String(observation || '').trim().slice(0, 500), atualizadoEm: serverTimestamp()
    };
    if (profileSnapshot.data().igrejaId) record.igrejaId = profileSnapshot.data().igrejaId;
    transaction.set(ref, record);
    return { ...record, id: ref.id };
  });
}
export async function cancelAvailability(id) {
  if (activeChurchId && !tenancyReady) throw new Error('A migração dos dados da igreja ainda não foi concluída.');
  const ref = doc(db, 'disponibilidades', id);
  // Transação preserva autor e snapshot, inclusive se o evento foi removido.
  await runTransaction(db, async transaction => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists()) throw new Error('A disponibilidade não existe mais. Atualize a lista.');
    transaction.update(ref, { disponivel: false, atualizadoEm: serverTimestamp() });
  });
}
export async function refreshAdminAvailability() {
  availabilityCache = await readCollection('disponibilidades');
  publish();
  return clone(availabilityCache);
}
