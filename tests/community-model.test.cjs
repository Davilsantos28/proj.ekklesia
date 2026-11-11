const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
async function model() {
  const module = new vm.SourceTextModule(fs.readFileSync('js/community-model.js', 'utf8'), { context: vm.createContext({ URL, Date }) });
  await module.link(() => {}); await module.evaluate(); return module.namespace;
}
test('projeção pública não inclui e-mail, telefone, datas ou campos inesperados', async () => {
  const api = await model();
  const result = api.publicMember({ nome: 'Ana', celula: 'Vida', ministerio: 'Louvor', banda: '1', status: 'Ativo', email: 'privado', telefone: 'privado', dataNascimento: 'privado', senha: 'privado' });
  assert.deepEqual(Object.keys(result).sort(), ['banda', 'celula', 'ministerio', 'nome', 'status']);
  assert.equal(JSON.stringify(result).includes('privado'), false);
});
test('horários de Brasília, datas inválidas, cultos futuros e encerrados', async () => {
  const api = await model();
  const row = { data: '2099-01-01', horario: '19:00', tipo: 'Culto', status: 'Agendada' };
  assert.equal(api.eventStart(row).toISOString(), '2099-01-01T22:00:00.000Z');
  assert.equal(api.isOpenWorship(row), true);
  for (const bad of [{ data: '2099-02-30' }, { horario: '25:99' }, { tipo: 'Ensaio' }, { status: 'Concluída' }, { data: '2020-01-01' }]) assert.equal(api.isOpenWorship({ ...row, ...bad }), false);
});
test('histórico distingue cancelamento, remoção e necessidade de reconfirmação', async () => {
  const api = await model();
  const row = { data: '2099-01-01', horario: '19:00', tipo: 'Culto', status: 'Agendada' };
  const response = { data: row.data, horario: row.horario, disponivel: true };
  assert.equal(api.availabilityState(response, row), 'Confirmada');
  assert.equal(api.availabilityState(response, { ...row, horario: '20:00' }), 'Reconfirmar');
  assert.equal(api.availabilityState(response, undefined), 'Culto removido');
  assert.equal(api.availabilityState({ ...response, disponivel: false }, undefined), 'Cancelada');
});
test('links de pagamento aceitam somente HTTPS sem credenciais', async () => {
  const api = await model();
  for (const bad of ['javascript:alert(1)', 'data:text/html,test', 'http://example.com', 'https://login:senha@example.com', 'inválido']) assert.equal(api.safePaymentUrl(bad), null);
  assert.equal(api.safePaymentUrl('https://example.com/doar'), 'https://example.com/doar');
});
