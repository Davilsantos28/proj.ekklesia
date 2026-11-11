// Teste opcional: requer Firebase Emulator Suite, firebase e @firebase/rules-unit-testing.
// Executar SOMENTE com FIRESTORE_EMULATOR_HOST=127.0.0.1:8080, nunca produção.
const { test } = require('node:test');
const fs = require('node:fs');
test('regras: leitura por perfil, privacidade e disponibilidades próprias', { skip: !process.env.FIRESTORE_EMULATOR_HOST }, async () => {
  const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
  const { doc, collection, setDoc, updateDoc, deleteDoc, getDoc, getDocs, query, where, serverTimestamp, Timestamp } = require('firebase/firestore');
  const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(':');
  if (!['127.0.0.1', 'localhost'].includes(host)) throw new Error('Este teste aceita somente emulador local.');
  const environment = await initializeTestEnvironment({
    projectId: 'demo-ekklesia', firestore: { host, port: Number(port), rules: fs.readFileSync('firestore.rules', 'utf8') }
  });
  try {
    await environment.clearFirestore();
    const event = { tipo: 'Culto', status: 'Agendada', nome: 'Culto', data: '2099-01-01', horario: '19:00', local: 'Templo', inicioEm: Timestamp.fromDate(new Date('2099-01-01T22:00:00Z')) };
    await environment.withSecurityRulesDisabled(async context => {
      const db = context.firestore();
      for (const [uid, perfil, status] of [['admin', 'administrador', 'ativo'], ['a', 'membro', 'ativo'], ['b', 'membro', 'ativo'], ['pending', 'membro', 'pendente'], ['inactive', 'membro', 'inativo']]) {
        await setDoc(doc(db, 'usuarios', uid), { nome: uid, perfil, status });
      }
      await setDoc(doc(db, 'membros', 'private'), { nome: 'Pessoa', telefone: 'privado' });
      await setDoc(doc(db, 'comunidadeMembros', 'private'), { nome: 'Pessoa', ministerio: 'Louvor', celula: 'Vida', banda: '', status: 'Ativo' });
      await setDoc(doc(db, 'escalas', 'future'), event);
      await setDoc(doc(db, 'escalas', 'past'), { ...event, inicioEm: Timestamp.fromMillis(0) });
      await setDoc(doc(db, 'escalas', 'closed'), { ...event, status: 'Concluída' });
    });
    const a = environment.authenticatedContext('a').firestore();
    const b = environment.authenticatedContext('b').firestore();
    const admin = environment.authenticatedContext('admin').firestore();
    const anonymous = environment.unauthenticatedContext().firestore();
    await assertFails(getDocs(collection(anonymous, 'comunidadeMembros')));
    await assertSucceeds(getDocs(collection(a, 'comunidadeMembros')));
    await assertFails(getDocs(collection(a, 'membros')));
    await assertSucceeds(getDocs(collection(admin, 'membros')));
    for (const name of ['membros', 'celulas', 'ministerios', 'campanhas', 'escalas', 'comunidadeMembros']) {
      await assertFails(setDoc(doc(a, name, 'attempt'), { nome: 'Tentativa' }));
      await assertFails(deleteDoc(doc(a, name, 'attempt')));
    }
    await assertFails(updateDoc(doc(a, 'usuarios', 'a'), { perfil: 'administrador' }));
    await assertFails(getDoc(doc(a, 'usuarios', 'b')));
    const response = { usuarioId: 'a', escalaId: 'future', nome: 'a', cultoNome: 'Culto', data: '2099-01-01', horario: '19:00', local: 'Templo', disponivel: true, observacao: '', atualizadoEm: serverTimestamp() };
    await assertSucceeds(setDoc(doc(a, 'disponibilidades', 'a_future'), response));
    await assertFails(getDoc(doc(b, 'disponibilidades', 'a_future')));
    await assertFails(getDocs(collection(a, 'disponibilidades')));
    await assertSucceeds(getDocs(query(collection(a, 'disponibilidades'), where('usuarioId', '==', 'a'))));
    await assertSucceeds(getDocs(collection(admin, 'disponibilidades')));
    await assertFails(setDoc(doc(b, 'disponibilidades', 'a_future'), response));
    await assertFails(setDoc(doc(a, 'disponibilidades', 'duplicate'), response));
    await assertFails(setDoc(doc(a, 'disponibilidades', 'a_future'), { ...response, nome: 'Outra pessoa' }));
    await assertFails(setDoc(doc(a, 'disponibilidades', 'a_future'), { ...response, horario: '20:00' }));
    for (const id of ['past', 'closed', 'missing']) await assertFails(setDoc(doc(a, 'disponibilidades', 'a_' + id), { ...response, escalaId: id }));
    await assertSucceeds(updateDoc(doc(a, 'disponibilidades', 'a_future'), { disponivel: false, atualizadoEm: serverTimestamp() }));
    await assertSucceeds(setDoc(doc(a, 'disponibilidades', 'a_future'), response));
    await assertSucceeds(updateDoc(doc(admin, 'disponibilidades', 'a_future'), { disponivel: false, atualizadoEm: serverTimestamp() }));
    await assertFails(deleteDoc(doc(a, 'disponibilidades', 'a_future')));
    await assertFails(setDoc(doc(admin, 'comunidadeMembros', 'bad'), { nome: 'Pessoa', ministerio: '', celula: '', banda: '', status: 'Ativo', email: 'privado' }));
    for (const uid of ['pending', 'inactive']) await assertFails(getDocs(collection(environment.authenticatedContext(uid).firestore(), 'escalas')));
    const newUser = environment.authenticatedContext('new-user', { email: 'new@example.com' }).firestore();
    const profile = { nome: 'Nova pessoa', email: 'new@example.com', perfilSolicitado: 'membro', perfil: 'membro', status: 'ativo', criadoEm: serverTimestamp() };
    await assertFails(setDoc(doc(newUser, 'usuarios', 'new-user'), { ...profile, perfil: 'administrador' }));
    await assertSucceeds(setDoc(doc(newUser, 'usuarios', 'new-user'), profile));
  } finally { await environment.cleanup(); }
});
