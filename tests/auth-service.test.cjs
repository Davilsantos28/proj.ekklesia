// Executar: node --experimental-vm-modules --test tests/auth-service.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const { webcrypto } = require('node:crypto');

async function fixture(options = {}) {
  const state = { writes: [], signedOut: [], deleted: [], signIns: 0, primary: { currentUser: { uid: 'admin-existing' } } };
  const context = vm.createContext({ crypto: webcrypto });
  const mock = {
    initializeApp: (_config, name) => ({ name }), deleteApp: async app => state.deleted.push(app),
    getAuth: app => ({ app }), setPersistence: async () => {},
    inMemoryPersistence: 'memory', browserSessionPersistence: 'session',
    createUserWithEmailAndPassword: async () => {
      if (options.duplicate) throw Object.assign(new Error(), { code: 'auth/email-already-in-use' });
      return { user: { uid: 'new-user' } };
    },
    signInWithEmailAndPassword: async () => {
      state.signIns++;
      if (options.badPassword) throw Object.assign(new Error(), { code: 'auth/invalid-credential' });
      return { user: { uid: 'new-user' } };
    },
    signOut: async auth => state.signedOut.push(auth), sendPasswordResetEmail: async () => {},
    getFirestore: app => ({ app }), collection: (_db, name) => ({ name }),
    doc: (db, collection, id) => collection === undefined
      ? { db: null, collection: db.name, id: 'generated-church' }
      : { db, collection: typeof collection === 'string' ? collection : collection.name, id: id || 'generated-church' },
    getDocFromServer: async () => ({ exists: () => !!options.profile, data: () => options.profile }),
    getDoc: async () => ({ exists: () => true, data: () => ({ igrejaId: 'church-1', nomes: ['Louvor'] }) }),
    getDocs: async () => ({ docs: [] }), query: (...args) => args, where: (...args) => args, limit: value => value,
    serverTimestamp: () => 'SERVER_TIME',
    runTransaction: async (_db, fn) => {
      if (options.denied) throw Object.assign(new Error(), { code: 'permission-denied' });
      await fn({ get: async ref => ({ exists: () => ref.collection === 'usuarios' ? !!options.existing : options.church !== false, data: () => ({ status: 'ativa' }) }), set: (ref, data) => state.writes.push({ ref, data }) });
    },
    auth: state.primary, db: {}, firebaseConfig: {}
  };
  const dependency = new vm.SyntheticModule(Object.keys(mock), function () {
    for (const [key, value] of Object.entries(mock)) this.setExport(key, value);
  }, { context });
  const module = new vm.SourceTextModule(fs.readFileSync('js/auth-service.js', 'utf8'), { context });
  await module.link(() => dependency);
  await module.evaluate();
  return { api: module.namespace, state };
}
const input = { nome: ' Pessoa Teste ', email: 'PESSOA@example.com', senha: 'senha-teste-123', perfil: 'membro', tipoIgreja: 'existente', igrejaId: 'church-1', ministerio: 'Louvor' };

test('membro: perfil por UID, normalização e nenhuma senha no documento', async () => {
  const { api, state } = await fixture();
  assert.equal((await api.registerAccount(input)).pending, true);
  const { ref, data } = state.writes.find(write => write.ref.collection === 'usuarios');
  assert.equal(ref.collection, 'usuarios'); assert.equal(ref.id, 'new-user');
  assert.equal(data.nome, 'Pessoa Teste'); assert.equal(data.email, 'pessoa@example.com');
  assert.equal(data.perfil, 'membro'); assert.equal(data.status, 'pendente');
  assert.equal(data.igrejaId, 'church-1'); assert.equal(data.ministerio, 'Louvor');
  assert.equal('senha' in data, false); assert.equal(state.deleted.length, 1);
  assert.equal(state.signedOut.includes(state.primary), false);
});
test('pedido de administrador nunca cria privilégios administrativos', async () => {
  const { api, state } = await fixture();
  assert.equal((await api.registerAccount({ ...input, perfil: 'administrador' })).pending, true);
  const profile = state.writes.find(write => write.ref.collection === 'usuarios').data;
  assert.equal(profile.perfil, 'membro');
  assert.equal(profile.status, 'pendente');
  assert.equal(profile.perfilSolicitado, 'administrador');
});
test('criador da igreja recebe vínculo administrativo inicial', async () => {
  const { api, state } = await fixture();
  const result = await api.registerAccount({ ...input, tipoIgreja: 'nova', nomeIgreja: 'Igreja Exemplo' });
  assert.equal(result.initialAdmin, true);
  const church = state.writes.find(write => write.ref.collection === 'igrejas');
  const profile = state.writes.find(write => write.ref.collection === 'usuarios');
  assert.equal(church.data.nome, 'Igreja Exemplo');
  assert.equal(profile.data.igrejaId, church.ref.id);
  assert.equal(profile.data.perfil, 'administrador');
  assert.equal(profile.data.status, 'ativo');
});
test('cadastro interrompido: autentica conta existente e completa perfil ausente', async () => {
  const { api, state } = await fixture({ duplicate: true });
  await api.registerAccount(input);
  assert.equal(state.signIns, 1); assert.equal(state.writes.length, 2);
});
test('cadastro existente não sobrescreve perfil', async () => {
  const { api, state } = await fixture({ duplicate: true, existing: true });
  await assert.rejects(api.registerAccount(input), /já possui cadastro/);
  assert.equal(state.writes.length, 0); assert.equal(state.deleted.length, 1);
});
test('senha errada não recupera perfil; falha de Firestore não produz sucesso', async () => {
  for (const options of [{ duplicate: true, badPassword: true }, { denied: true }]) {
    const { api, state } = await fixture(options);
    await assert.rejects(api.registerAccount(input));
    assert.equal(state.writes.length, 0); assert.equal(state.deleted.length, 1);
  }
});
test('login recusa pendente, inativo e perfil ausente; encerra sessão', async () => {
  for (const profile of [null, { perfil: 'administrador', status: 'pendente' }, { perfil: 'administrador', status: 'inativo' }]) {
    const { api, state } = await fixture({ profile });
    await assert.rejects(api.login(input.email, input.senha));
    assert.ok(state.signedOut.includes(state.primary));
  }
});
test('login libera apenas administrador ativo', async () => {
  const profile = { nome: 'Admin', perfil: 'administrador', status: 'ativo' };
  const { api, state } = await fixture({ profile });
  assert.equal(await api.login(input.email, input.senha), profile);
  assert.equal(state.signedOut.length, 0);
});
test('membro ativo entra na própria área sem permissão administrativa', async () => {
  const profile = { nome: 'Membro', perfil: 'membro', status: 'ativo' };
  const { api, state } = await fixture({ profile });
  assert.equal(await api.login(input.email, input.senha), profile);
  assert.equal(api.homeFor(profile), 'portal-membro.html');
  assert.equal(api.isAdministrator(profile), false);
  assert.equal(state.signedOut.length, 0);
});
test('entrada inválida não inicia gravação', async () => {
  const { api, state } = await fixture();
  for (const bad of [{ perfil: 'superadmin' }, { nome: ' ' }, { senha: '123' }, { igrejaId: '' }, { ministerio: '' }]) {
    await assert.rejects(api.registerAccount({ ...input, ...bad }));
  }
  assert.equal(state.writes.length, 0);
});
