import assert from 'node:assert/strict';
import {test} from 'node:test';
import {cellParticipants, publicMember} from '../js/community-model.js';

test('vínculo por ID ganha do nome, e legado só usa nome único da própria igreja', () => {
  const cell = {id:'c1', nome:'Célula Fé', igrejaId:'i1'};
  const other = {id:'c2', nome:'Célula Fé', igrejaId:'i2'};
  const people = [
    {id:'a', celulaId:'c1', celula:'Nome anterior', igrejaId:'i1'},
    {id:'b', celula:'celula fe', igrejaId:'i1'},
    {id:'c', celulaId:'c2', celula:'Célula Fé', igrejaId:'i1'},
    {id:'d', celulaId:'c1', celula:'Célula Fé', igrejaId:'i2'}
  ];
  assert.deepEqual(cellParticipants(cell, [cell, other], people).map(row => row.id), ['a','b']);
  assert.deepEqual(cellParticipants(cell, [cell, {...cell, id:'c3'}], people).map(row => row.id), ['a']);
});

test('projeção de participante inclui o ID da célula e exclui dados de conta', () => {
  const row = publicMember({nome:'João', celulaId:'c1', celula:'Célula Fé', email:'pessoa@example.com', usuarioId:'u1', telefone:'123'});
  assert.equal(row.celulaId, 'c1');
  assert.equal(row.nome, 'João');
  assert.equal(row.email, undefined);
  assert.equal(row.usuarioId, undefined);
  assert.equal(row.telefone, undefined);
});
