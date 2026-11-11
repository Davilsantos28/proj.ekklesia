const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

test('membro e administrador compartilham cadastros e respostas, com telas distintas', { timeout: 180000 }, async () => {
  let role = 'membro'; let failReads = false;
  const state = {
    usuarios: { member1: { nome: 'Ana Teste', perfil: 'membro', status: 'ativo' } },
    membros: { m1: { nome: 'Ana Teste', ministerio: 'Louvor', celula: 'Esperança', banda: 'Banda 1', status: 'Ativo', email: 'privado@example.com', telefone: 'privado', dataNascimento: '2000-01-01', dataEntrada: '2026-01-01' } },
    comunidadeMembros: { m1: { nome: 'Ana Teste', ministerio: 'Louvor', celula: 'Esperança', banda: 'Banda 1', status: 'Ativo' } },
    bandas: { b1: { nome: 'Banda 1', ministerio: 'Louvor', status: 'Ativo' } },
    ministerios: { n1: { nome: 'Louvor', lider: 'Maria', area: 'Adoração', status: 'Ativo' } },
    celulas: { c1: { nome: 'Esperança', lider: 'João', dia: 'Sábado', horario: '19:00', local: 'Salão', status: 'Ativa' } },
    escalas: { e1: { nome: 'Culto de domingo', tipo: 'Culto', data: '2099-01-04', horario: '18:00', local: 'Templo', status: 'Agendada', ministerio: 'Louvor', equipe: '', servicos: 0 } },
    campanhas: {
      a1: { nome: 'Doação com Amor', tipo: 'Alimentos', inicio: '2026-01-01', fim: '2099-12-31', unidade: 'cestas', meta: 100, arrecadado: 20, entregue: 0, status: 'Em andamento', pixChave: 'teste@example.com', pixBeneficiario: 'Congregação Teste', paymentUrl: 'https://example.com/doar', orientacoesDoacao: 'Entregue os alimentos na secretaria.' },
      a2: { nome: 'Campanha sem configuração', tipo: 'Alimentos', inicio: '2026-01-01', fim: '2099-12-31', unidade: 'cestas', meta: 100, arrecadado: 0, entregue: 0, status: 'Em andamento' }
    }, disponibilidades: { outra: { usuarioId: 'outro', escalaId: 'e1', nome: 'Pessoa privada', disponivel: true, data: '2099-01-04', horario: '18:00', cultoNome: 'Culto de domingo', local: 'Templo', observacao: 'PRIVADO' } }
  };
  const requests = [];
  const root = path.resolve('.');
  const server = http.createServer(async (req, res) => {
    if (req.url === '/__db') {
      let body = ''; for await (const chunk of req) body += chunk;
      const command = JSON.parse(body); requests.push(command);
      if (failReads && command.action !== 'commit') { res.writeHead(503); return res.end('{}'); }
      res.setHeader('Content-Type', 'application/json');
      if (command.action === 'get') return res.end(JSON.stringify(state[command.ref.name]?.[command.ref.id] ?? null));
      if (command.action === 'list') {
        let result = Object.entries(state[command.ref.name] || {}).map(([id, data]) => ({ id, data }));
        for (const filter of command.ref.filters || []) result = result.filter(row => row.data[filter.field] === filter.value);
        return res.end(JSON.stringify(result));
      }
      for (const op of command.ops) {
        state[op.ref.name] ||= {};
        if (op.kind === 'delete') delete state[op.ref.name][op.ref.id];
        else state[op.ref.name][op.ref.id] = op.kind === 'update' ? { ...state[op.ref.name][op.ref.id], ...op.value } : op.value;
      }
      return res.end('{}');
    }
    const file = path.resolve(root, '.' + new URL(req.url, 'http://localhost').pathname);
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
    res.setHeader('Content-Type', ({ '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript', '.jpeg': 'image/jpeg' })[path.extname(file)] || 'text/plain');
    fs.createReadStream(file).pipe(res);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const mockFirestore = `
    async function call(command) { const response = await fetch('/__db', {method:'POST',body:JSON.stringify(command)}); if(!response.ok)throw Object.assign(new Error('offline'),{code:'unavailable'});return response.json(); }
    export const collection = (db,name) => ({name});
    export const doc = (db,name,id) => db.name ? {name:db.name,id:crypto.randomUUID()} : {name,id};
    export const where = (field,operator,value) => ({field,operator,value});
    export const query = (ref,...filters) => ({...ref,filters});
    export const getDocs = async ref => ({docs:(await call({action:'list',ref})).map(row=>({id:row.id,data:()=>row.data}))});
    export const getDocFromServer = async ref => { const data=await call({action:'get',ref});return {exists:()=>data!==null,data:()=>data}; };
    export const Timestamp = {fromDate:date=>date.toISOString()};
    export const serverTimestamp = () => 'server-time';
    export const writeBatch = () => { const ops=[]; return {set:(ref,value)=>ops.push({kind:'set',ref,value}),update:(ref,value)=>ops.push({kind:'update',ref,value}),delete:ref=>ops.push({kind:'delete',ref}),commit:()=>call({action:'commit',ops})}; };
    export async function runTransaction(db,fn) { const batch=writeBatch();const result=await fn({...batch,get:getDocFromServer});await batch.commit();return result; }
  `;
  let browser;
  try {
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    const page = await browser.newPage(); const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/js/firebase-config.js', route => route.fulfill({ contentType: 'application/javascript', body: `export const db={}; export const auth={currentUser:{uid:'member1'},authStateReady:async()=>{}};` }));
    await page.route('**/js/auth-service.js', route => route.fulfill({ contentType: 'application/javascript', body: `export const readProfile=async()=>({nome:'Ana Teste',perfil:'${role}',status:'ativo'});export const isAdministrator=p=>p.perfil==='administrador';export const isActiveUser=p=>p.status==='ativo';export const homeFor=p=>isAdministrator(p)?'inicio.html':'portal-membro.html';export const logout=async()=>{};export const errorMessage=e=>e.message;` }));
    await page.route('https://www.gstatic.com/**', route => {
      if (!route.request().url().endsWith('firebase-firestore.js')) throw new Error('Unexpected remote dependency');
      return route.fulfill({ contentType: 'application/javascript', body: mockFirestore });
    });
    const base = 'http://127.0.0.1:' + server.address().port;
    await page.goto(base + '/pages/portal-membro.html');
    await page.getByRole('heading', { name: 'Culto de domingo', exact: true }).waitFor();
    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 900 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await page.screenshot({ path: path.join(os.tmpdir(), 'ekklesia-portal-' + width + '.png'), fullPage: true });
    }
    await page.locator('[data-section="ministerios"]').click();
    await page.locator('[data-group="ministerios"]').click();
    assert.match(await page.locator('#participants-content').innerText(), /Ana Teste/);
    assert.equal((await page.locator('body').innerText()).includes('privado@example.com'), false);
    await page.locator('#close-participants').click();
    await page.locator('[data-section="celulas"]').click();
    await page.locator('[data-group="celulas"]').click();
    assert.match(await page.locator('#participants-content').innerText(), /Ana Teste/);
    await page.locator('#close-participants').click();
    await page.locator('[data-section="disponibilidades"]').click();
    assert.equal((await page.locator('#my-availability').innerText()).includes('PRIVADO'), false);
    await page.locator('#worship-select').selectOption('e1');
    await page.locator('#availability-note').fill('Posso ajudar na recepção.');
    state.escalas.e1.horario = '19:00';
    await page.locator('#save-availability').click();
    await page.waitForFunction(() => document.querySelector('#availability-message').textContent.includes('mudou'));
    assert.equal(state.disponibilidades.member1_e1, undefined);
    await page.locator('#refresh').click();
    await page.waitForFunction(() => document.querySelector('#worship-select').textContent.includes('19:00'));
    await page.locator('#worship-select').selectOption('e1');
    await page.locator('#availability-note').fill('Posso ajudar na recepção.');
    await page.locator('#save-availability').click();
    await page.waitForFunction(() => document.querySelector('#availability-message').textContent.includes('Disponibilidade salva'));
    assert.equal(state.disponibilidades.member1_e1.usuarioId, 'member1');
    await page.locator('#availability-note').fill('Chego às 18h.');
    await page.locator('#save-availability').click();
    await page.waitForFunction(() => document.querySelector('#my-availability').textContent.includes('Chego às 18h.'));
    assert.equal(Object.values(state.disponibilidades).filter(row => row.usuarioId === 'member1').length, 1);
    page.once('dialog', dialog => dialog.accept());
    await page.locator('[data-cancel]').click();
    await page.waitForFunction(() => document.querySelector('#my-availability').textContent.includes('Cancelada'));
    assert.equal(state.disponibilidades.member1_e1.disponivel, false);
    await page.locator('[data-section="campanhas"]').click();
    assert.equal(await page.locator('[data-donate]').count(), 1);
    await page.locator('[data-donate]').click();
    assert.match(await page.locator('#donation-content').innerText(), /Congregação Teste/);
    assert.equal(await page.locator('#donation-content a').getAttribute('href'), 'https://example.com/doar');
    assert.equal(state.campanhas.a1.arrecadado, 20);
    await page.locator('#close-donation').click();
    assert.equal(requests.some(r => r.action === 'list' && ['membros', 'usuarios'].includes(r.ref.name)), false);
    // Acesso direto a uma rota administrativa volta à área do membro.
    await page.goto(base + '/pages/membros.html');
    await page.waitForURL('**/portal-membro.html');
    role = 'administrador';
    await page.goto(base + '/pages/escalas.html#disponibilidades');
    await page.locator('#availabilities-view').waitFor({ state: 'visible' });
    assert.match(await page.locator('#availabilities-table').innerText(), /Ana Teste/);
    await page.locator('#show-schedules').click();
    await page.locator('#add-record').click();
    await page.locator('#record-nome').fill('Culto novo');
    await page.locator('#record-data').fill('2099-02-01');
    await page.locator('#record-horario').fill('10:00');
    await page.locator('#record-local').fill('Templo');
    await page.locator('#record-form [type="submit"]').click();
    await page.locator('#record-dialog').waitFor({ state: 'hidden' });
    assert.ok(Object.values(state.escalas).some(row => row.nome === 'Culto novo' && row.inicioEm === '2099-02-01T13:00:00.000Z'));
    await page.goto(base + '/pages/campanhas.html');
    await page.locator('#add-record').click();
    await page.locator('#record-nome').fill('Campanha nova');
    await page.locator('#record-inicio').fill('2026-01-01');
    await page.locator('#record-fim').fill('2099-01-01');
    await page.locator('#record-status').selectOption('Em andamento');
    await page.locator('#record-pixChave').fill('pix@example.com');
    await page.locator('#record-form [type="submit"]').click();
    await page.waitForFunction(() => document.querySelector('#form-error').textContent.includes('beneficiário'));
    await page.locator('#record-pixBeneficiario').fill('Congregação');
    await page.locator('#record-form [type="submit"]').click();
    await page.locator('#record-dialog').waitFor({ state: 'hidden' });
    assert.ok(Object.values(state.campanhas).some(row => row.nome === 'Campanha nova' && row.entregue === 0));
    await page.goto(base + '/pages/membros.html');
    await page.locator('[data-action="edit"]').first().click();
    await page.locator('#record-nome').fill('Ana Atualizada');
    await page.locator('#record-form [type="submit"]').click();
    await page.locator('#record-dialog').waitFor({ state: 'hidden' });
    assert.equal(state.comunidadeMembros.m1.nome, 'Ana Atualizada');
    assert.equal('email' in state.comunidadeMembros.m1, false);
    await page.goto(base + '/pages/configuracoes.html');
    await page.locator('#publish-members').click();
    await page.waitForFunction(() => document.querySelector('#toast').textContent.includes('publicados'));
    await page.goto(base + '/pages/inicio.html');
    await page.locator('.layout').waitFor({ state: 'visible' });
    for (const file of ['ministerios', 'celulas', 'relatorios']) {
      await page.goto(base + '/pages/' + file + '.html');
      await page.locator('.layout').waitFor({ state: 'visible' });
    }
    role = 'membro'; failReads = true;
    await page.goto(base + '/pages/portal-membro.html');
    await page.locator('#portal-message').waitFor({ state: 'visible' });
    assert.match(await page.locator('#portal-message').innerText(), /conectar/);
    assert.equal(await page.locator('[data-group]').count(), 0);
    assert.deepEqual(errors, []);
    console.log('Portal desktop/mobile, disponibilidade compartilhada e administração verificados com banco simulado.');
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
});
