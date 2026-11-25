import assert from 'node:assert/strict';
import {test} from 'node:test';
import {analyzeScale} from '../js/agente-escalas.mjs';

const now = () => new Date(2026, 10, 25, 12);
const date = '2026-11-29';
const time = '18:30';
const response = (id, fields = {}) => ({
  usuarioId: id, escalaId: 'e1', igrejaId: 'i1', disponivel: true, data: date, horario: time, ...fields
});
const member = (id, fields = {}) => ({id, igrejaId: 'i1', membroId: 'cad-' + id, status: 'Ativo', nome: 'Pessoa ' + id, ...fields});
const answer = (distribution = []) => JSON.stringify({
  analise: 'Análise de teste', recomendacoes: ['Revisar as vagas'], distribuicao: distribution
});
const propose = (pessoa, vaga = 'V1') => ({pessoa, vaga, justificativa: 'Disponibilidade registrada'});

function setup({servicos = 2, members = [member('m1'), member('m2')], responses = [response('m1')],
  scale = {}, otherScales = []} = {}) {
  const data = {scale: {id: 'e1', igrejaId: 'i1', nome: 'Nome reservado', data: date, horario: time, servicos,
    status: 'Agendada', ...scale}, members, responses, otherScales};
  const options = {scaleId: 'e1', now, getSession: async () => ({uid: 'u1', role: 'admin', igrejaId: 'i1'}),
    read: async (igreja, id) => { assert.equal(igreja, 'i1'); assert.equal(id, 'e1'); return data; },
    generate: async () => answer()};
  return {data, options};
}

test('calcula demanda e valida distribuição com candidatos suficientes', async () => {
  const {options} = setup({responses: [response('m1'), response('m2')]});
  options.generate = async payload => {
    assert.equal(payload.coverage, 100);
    assert.equal(payload.filled, 0);
    assert.doesNotMatch(JSON.stringify(payload), /Pessoa|Nome reservado|cad-m1|i1/);
    return answer([propose('P1'), propose('P2', 'V2')]);
  };
  const result = await analyzeScale(options);
  assert.equal(result.suggestions[0].member, 'Pessoa m1');
  assert.equal(result.suggestions.length, 2);
});

test('deduplica e separa cancelamentos, negativas e reconfirmações', async () => {
  const {options} = setup({members: ['m1', 'm2', 'm3', 'm4'].map(id => member(id)), responses: [
    response('m1'), response('m1'),
    response('m2'), response('m2', {disponivel: false, atualizadoEm: '2026-11-25T13:00Z'}),
    response('m3', {disponivel: false, status: 'indisponivel'}), response('m4', {horario: '17:00'}), response('removido')
  ]});
  const {metrics} = await analyzeScale(options);
  assert.equal(metrics.available, 1);
  assert.equal(metrics.unavailable, 1);
  assert.equal(metrics.reconfirm, 1);
  assert.equal(metrics.coverage, 50);
});

test('analisa dados insuficientes e ausência de respostas sem inventar pessoas', async () => {
  const {options} = setup({responses: []});
  options.generate = async payload => {
    assert.equal(payload.available, 0);
    assert.equal(payload.gaps, 2);
    assert.equal(payload.candidates.length, 0);
    return answer();
  };
  await analyzeScale(options);
});

test('separa designações e vagas preenchidas e respeita função, conflito e histórico', async () => {
  const {options} = setup({
    members: [member('m1', {funcoes:['Som']}), member('m2'), member('m3', {funcoes:['Som']})],
    responses: [response('m1'), response('m2'), response('m3'), response('m3', {escalaId:'e2'})],
    scale: {vagas:[{id:'v1', funcao:'Som'}, {id:'v2', funcao:'Recepção'}],
      designacoes:[{membroId:'cad-m2', vagaId:'v2'}]},
    otherScales: [{id:'e2', igrejaId:'i1', data:date, horario:time, status:'Agendada'},
      {id:'e3', igrejaId:'i1', data:'2026-11-22', horario:time, status:'Concluída', designacoes:[{membroId:'cad-m1'}]}]
  });
  options.generate = async payload => {
    assert.equal(payload.conflicts, 1);
    assert.equal(payload.assigned, 1);
    assert.equal(payload.filled, 1);
    assert.equal(payload.candidates.length, 1);
    assert.equal(payload.candidates[0].history, 1);
    return answer([propose('P1')]);
  };
  assert.equal((await analyzeScale(options)).suggestions[0].slot, 'Som');
});

test('rejeita JSON inválido, pessoa inexistente, indisponível ou duplicada', async () => {
  const {options} = setup({responses: [response('m1'), response('m2', {disponivel:false})]});
  for (const invalid of ['isso não é JSON', answer([propose('P999')]), answer([propose('P2')]),
    answer([propose('P1'), propose('P1', 'V2')])]) {
    options.generate = async () => invalid;
    await assert.rejects(analyzeScale(options), {code:'invalid-response'});
  }
});

test('nega líder e registros de outra igreja antes de solicitar ao modelo', async () => {
  const {options} = setup({scale: {igrejaId:'i2'}});
  options.generate = async () => assert.fail('O modelo não deve ser chamado');
  await assert.rejects(analyzeScale(options), {code:'missing'});
  options.getSession = async () => ({uid:'u1', igrejaId:'i1', role:'leader'});
  options.read = async () => assert.fail('O banco não deve ser consultado');
  await assert.rejects(analyzeScale(options), {code:'unauthorized'});
});

test('descarta a resposta se uma disponibilidade mudar durante a chamada', async () => {
  const {options, data} = setup();
  options.generate = async () => {
    data.responses[0].disponivel = false;
    return answer([propose('P1')]);
  };
  await assert.rejects(analyzeScale(options), {code:'stale'});
});

test('propaga erros de rede e quota sem oferecer resposta de exemplo', async () => {
  const {options} = setup();
  for (const code of ['unavailable', 'resource-exhausted']) {
    options.generate = async () => { throw Object.assign(new Error(code), {code}); };
    await assert.rejects(analyzeScale(options), {code});
  }
});

test('bloqueia troca de sessão durante a análise', async () => {
  const {options} = setup();
  let uid = 'first';
  options.getSession = async () => ({uid, role:'admin', igrejaId:'i1'});
  options.generate = async () => { uid = 'second'; return answer(); };
  await assert.rejects(analyzeScale(options), {code:'unauthorized'});
});
