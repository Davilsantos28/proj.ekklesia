import './dados.js';
import { db, auth } from './firebase-config.js';
import { collection, doc, getDocs, query, where, writeBatch, runTransaction, serverTimestamp, Timestamp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import { publicMember, eventStart, isOpenWorship, safePaymentUrl } from './community-model.js';

const modules = ['membros', 'bandas', 'ministerios', 'celulas', 'escalas', 'campanhas'];
let cache = {};
let availabilityCache = [];
const listeners = new Set();
const clone = value => structuredClone(value);
const rows = snapshot => snapshot.docs.map(item => ({ ...item.data(), id: item.id }));
function publish() { for (const listener of listeners) listener(); }
export async function readCollection(name, ...conditions) {
  return rows(await getDocs(query(collection(db, name), ...conditions)));
}
export async function initializeAdmin() {
  const results = await Promise.all(modules.map(async name => [name, await readCollection(name)]));
  cache = Object.fromEntries(results);
  if (document.body.dataset.page === 'escalas') availabilityCache = await readCollection('disponibilidades');
  window.Ekklesia.store = {
    load: () => clone(cache), loadAvailability: () => clone(availabilityCache),
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
}
export function adminData() { return clone(cache); }
export function optionalField(field, type) {
  return type === 'textarea' || ['banda', 'paymentUrl', 'pixChave', 'pixBeneficiario'].includes(field);
}
export async function saveRecord(module, record, editing = false) {
  if (!modules.includes(module)) throw new Error('Módulo desconhecido.');
  const reference = editing ? doc(db, module, record.id) : doc(collection(db, module));
  const value = {};
  for (const [field] of window.Ekklesia.schemas[module].fields) value[field] = record[field] ?? '';
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
  if (module === 'membros') batch.set(doc(db, 'comunidadeMembros', reference.id), publicMember(value));
  await batch.commit();
  const saved = { ...value, id: reference.id };
  const index = cache[module].findIndex(item => item.id === reference.id);
  if (index < 0) cache[module].unshift(saved); else cache[module][index] = saved;
  publish();
  return saved;
}
export async function removeRecord(module, id) {
  if (!modules.includes(module)) throw new Error('Módulo desconhecido.');
  const batch = writeBatch(db);
  batch.delete(doc(db, module, id));
  if (module === 'membros') batch.delete(doc(db, 'comunidadeMembros', id));
  await batch.commit();
  cache[module] = cache[module].filter(item => item.id !== id);
  publish();
}
export async function publishExistingMembers() {
  // Ação administrativa explícita, não executada na abertura do painel.
  const members = await readCollection('membros');
  const previous = await readCollection('comunidadeMembros');
  const ids = new Set(members.map(row => row.id));
  const operations = [
    ...members.map(row => ['set', row.id, publicMember(row)]),
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
  const names = ['ministerios', 'celulas', 'escalas', 'campanhas', 'comunidadeMembros'];
  const results = await Promise.all(names.map(async name => [name, await readCollection(name)]));
  return { ...Object.fromEntries(results), disponibilidades: await readCollection('disponibilidades', where('usuarioId', '==', uid)) };
}
export async function saveOwnAvailability(scaleId, observation, expected) {
  if (!auth.currentUser) throw new Error('Entre novamente para informar disponibilidade.');
  const uid = auth.currentUser.uid;
  const ref = doc(db, 'disponibilidades', uid + '_' + scaleId);
  return runTransaction(db, async transaction => {
    const scaleSnapshot = await transaction.get(doc(db, 'escalas', scaleId));
    const profileSnapshot = await transaction.get(doc(db, 'usuarios', uid));
    if (!scaleSnapshot.exists()) throw new Error('Este culto foi removido. Atualize a página.');
    const scale = scaleSnapshot.data();
    if (!isOpenWorship(scale)) throw new Error('Este culto não está mais disponível. Atualize a página.');
    if (scale.data !== expected.data || scale.horario !== expected.horario) throw new Error('A data ou o horário mudou. Atualize a página e selecione novamente.');
    const record = {
      usuarioId: uid, escalaId: scaleId, nome: profileSnapshot.data().nome,
      cultoNome: scale.nome, data: scale.data, horario: scale.horario, local: scale.local,
      disponivel: true, observacao: String(observation || '').trim().slice(0, 500), atualizadoEm: serverTimestamp()
    };
    transaction.set(ref, record);
    return { ...record, id: ref.id };
  });
}
export async function cancelAvailability(id) {
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
  return clone(availabilityCache);
}
