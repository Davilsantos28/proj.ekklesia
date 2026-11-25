const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const http=require('node:http');const os=require('node:os');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
test('oito telas administrativas, ícones, modal e menu no celular',{timeout:180000},async()=>{
 const root=path.resolve('.');const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404);return res.end();}res.setHeader('Content-Type',({'.html':'text/html','.js':'application/javascript','.mjs':'application/javascript','.css':'text/css','.jpeg':'image/jpeg'})[path.extname(file)]||'text/plain');fs.createReadStream(file).pipe(res);});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 try{
 browser=await chromium.launch({channel:'msedge',headless:true});const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 page.setDefaultTimeout(12000);
 await page.route('**/js/firebase-config.js',r=>r.fulfill({contentType:'application/javascript',body:`export const appCheckSiteKey='mock-site-key';export const db={};export const auth={currentUser:{uid:'teste'},authStateReady:async()=>{}};`}));
 await page.route('**/js/auth-service.js',r=>r.fulfill({contentType:'application/javascript',body:`export const readProfile=async()=>({nome:'Ana Oliveira',perfil:'${process.env.ADMIN_VISUAL_ROLE || 'administrador'}',status:'ativo',igrejaId:'a'});export const isAdministrator=p=>p.perfil==='administrador';export const isLeader=p=>p.perfil==='lider';export const isActiveUser=()=>true;export const homeFor=()=> 'inicio.html';export const logout=async()=>{};export const errorMessage=e=>e.message;`}));
 await page.route('https://www.gstatic.com/**',r=>r.fulfill({contentType:'application/javascript',body:`
 export const collection=(_db,name)=>({name});export const doc=(_db,name,id)=>({name,id});export const query=ref=>ref;export const where=()=>{};export const limit=()=>{};export const onSnapshot=()=>()=>{};export const startAfter=()=>{};
 const rows={membros:[{id:'m1',igrejaId:'a',celulaId:'c1',nome:'Ana Oliveira',dataEntrada:new Date().toISOString().slice(0,7)+'-01',email:'ana@example.com',telefone:'(81) 99999-0000',ministerio:'Louvor',celula:'Esperança',status:'Ativo'}],ministerios:[{id:'n1',nome:'Louvor',lider:'Ana Oliveira',area:'Adoração',status:'Ativo'}],celulas:[{id:'c1',igrejaId:'a',nome:'Esperança',lider:'Ana Oliveira',dia:'Quarta-feira',horario:'19:30',local:'Salão da comunidade',status:'Ativa'}]};
 rows.escalas=[{id:'e1',nome:'Evento cadastrado',data:new Date().toISOString().slice(0,7)+'-28',horario:'19:00',status:'Agendada',local:'Templo',ministerio:'Louvor'}];
 export const updateDoc=async(ref,value)=>{if(window.denyProfile)throw Object.assign(new Error('denied'),{code:'permission-denied'});window.savedProfile=value;};
 rows.solicitacoes=[{id:'request1',usuarioId:'request1',igrejaId:'a',nome:'Novo Administrador',email:'novo@example.com',ministerio:'Louvor',perfilSolicitado:'administrador',status:'pendente'}];
 export const getDocs=async ref=>({docs:(rows[ref.name]||[]).map(row=>({id:row.id,data:()=>row}))});export const getDoc=async()=>({exists:()=>false});export const setDoc=async()=>{};export const writeBatch=()=>({});export const runTransaction=async(_db,fn)=>fn({get:async ref=>({exists:()=>true,data:()=>ref.name==='solicitacoes'?rows.solicitacoes.find(r=>r.id===ref.id):ref.id==='teste'?{perfil:'administrador',status:'ativo',igrejaId:'a'}:{status:'pendente',igrejaId:'a',perfilSolicitado:'administrador'}}),update:(ref,data)=>{if(ref.name==='solicitacoes')Object.assign(rows.solicitacoes.find(r=>r.id===ref.id),data);else window.approvedProfile=data;}});export const Timestamp={};export const serverTimestamp=()=>{};
 `}));
 await page.route('**/js/agente-firebase.js',r=>r.fulfill({contentType:'application/javascript',body:`
 const scale={id:'e1',nome:'Culto cadastrado',igrejaId:'a',data:'2099-12-01',horario:'18:30',status:'Agendada',servicos:2};
 export const listScales=async()=>[scale];
 export const getSession=async()=>({uid:'teste',igrejaId:'a',role:'admin'});
 export const read=async()=>({scale,members:[{id:'u1',igrejaId:'a',nome:'Ana Oliveira'}],
   responses:[{igrejaId:'a',usuarioId:'u1',escalaId:'e1',data:scale.data,horario:scale.horario,disponivel:true}],otherScales:[]});
 export const generate=async()=>JSON.stringify({analise:'A disponibilidade cobre metade da demanda.',recomendacoes:[],
   distribuicao:[{pessoa:'P1',vaga:'V1',justificativa:'Disponibilidade registrada.'}]});
 `}));
 const base='http://127.0.0.1:'+server.address().port;
 for(const name of (process.env.ADMIN_VISUAL_PAGES ? process.env.ADMIN_VISUAL_PAGES.split(',') : ['inicio','membros','ministerios','celulas','escalas','campanhas','relatorios','configuracoes'])){
  await page.setViewportSize({width:1440,height:1000});await page.goto(base+'/pages/'+name+'.html',{waitUntil:'domcontentloaded',timeout:60000});await page.locator('.layout').waitFor({state:'visible'});
  assert.equal(await page.locator('.sidebar-menu a svg').count(),process.env.ADMIN_VISUAL_ROLE==='lider'?4:9);assert.equal(await page.locator('.notification-button svg').count(),1);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,name+' desktop overflow');
  if(name==='celulas'){
   await page.locator('#search').fill('Esperança');
   await page.locator('#records-table [data-action=view]').click();
   assert.equal(await page.locator('#cell-detail').isVisible(),true,
    'Detalhes da célula em ' + page.url() + ' · erros: ' + errors.join('; '));
   assert.equal(await page.locator('#cell-title').innerText(),'Esperança');
   assert.match(await page.locator('#cell-participants-table tbody').innerText(),/Ana Oliveira/);
   await page.locator('#participant-search').fill('sem resultado');
   assert.match(await page.locator('#cell-participants-table tbody').innerText(),/Nenhum participante corresponde/);
   await page.locator('#cell-tab-info').click();
   assert.match(await page.locator('#cell-info-list').innerText(),/Salão da comunidade/);
   await page.locator('#cell-back').click();
   assert.equal(await page.locator('#search').inputValue(),'Esperança');
   await page.locator('#records-table [data-action=view]').click();
   await page.locator('#cell-detail').waitFor({state:'visible'});
   await page.screenshot({path:path.join(os.tmpdir(),'ekklesia-cell-detail.png'),fullPage:true});
  }
  if(name==='escalas'){
   await page.locator('#open-schedule-agent').click();
   await page.locator('#agent-submit').click();
   await page.locator('#agent-result').waitFor({state:'visible'});
   assert.match(await page.locator('#agent-result').innerText(),/50%/);
   assert.match(await page.locator('#agent-result').innerText(),/Ana Oliveira/);
   await page.getByRole('button',{name:'Fechar análise'}).click();
  }
  if(name==='relatorios'){assert.equal(await page.locator('#growth-chart svg').count(),1);await page.locator('#analytics-period').selectOption('6');assert.equal(await page.locator('#growth-chart svg rect').count(),6);await page.locator('#report-module').selectOption('celulas');assert.match(await page.locator('#status-chart-title').innerText(),/Células/);assert.match(await page.locator('#cell-chart').innerText(),/Esperança/);}
  if(name==='solicitacoes'){await page.getByRole('button',{name:'Aprovar acesso',exact:true}).click();await page.locator('#confirm-request').click();await page.waitForFunction(()=>document.querySelector('#requests-feedback').textContent.includes('Acesso aprovado'));assert.equal(await page.evaluate(()=>window.approvedProfile.perfil),'administrador');await page.locator('#requests-status').selectOption('aprovada');assert.match(await page.locator('#requests-list').innerText(),/Novo Administrador/);}
  if(name==='inicio'){assert.equal(await page.locator('.schedule-actions .button').evaluate(n=>getComputedStyle(n).color),'rgb(255, 255, 255)');assert.equal(await page.locator('.campaign-info > a').evaluate(n=>getComputedStyle(n).color),'rgb(22, 76, 39)');}
  if(['inicio','membros','configuracoes','relatorios'].includes(name))await page.screenshot({path:path.join(os.tmpdir(),'ekklesia-admin-'+name+'.png'),fullPage:true});
  if(name==='inicio'){
   assert.equal(await page.locator('#real-agenda .agenda-event').count(),1);
   await page.locator('#real-agenda .agenda-event').click();await page.locator('#dashboard-preview').waitFor({state:'visible'});assert.match(await page.locator('#preview-content').innerText(),/Templo/);await page.locator('#dashboard-preview .dialog-heading button').click();
   await page.locator('[data-count="membros"]').locator('..').locator('..').click();await page.locator('#dashboard-preview').waitFor({state:'visible'});assert.match(await page.locator('#preview-content').innerText(),/Ana Oliveira/);await page.locator('#dashboard-preview .dialog-heading button').click();
   await page.locator('.user-profile').click();await page.locator('#profile-name').fill('Ana Atualizada');await page.locator('#profile-phone').fill('81999990000');await page.locator('#profile-description').fill('Liderança da comunidade');
   await page.locator('#save-profile').click();await page.waitForFunction(()=>document.querySelector('#profile-feedback').textContent.includes('Perfil salvo'));
   assert.equal(await page.evaluate(()=>window.savedProfile.telefone),'81999990000');assert.equal(await page.locator('.user-info strong').innerText(),'Ana Atualizada');
   const picture=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=20;c.height=20;c.getContext('2d').fillRect(0,0,20,20);return c.toDataURL('image/png').split(',')[1];});
   await page.locator('#profile-photo').setInputFiles({name:'foto.png',mimeType:'image/png',buffer:Buffer.from(picture,'base64')});await page.waitForFunction(()=>document.querySelector('#profile-feedback').textContent.includes('Foto pronta'));await page.locator('#save-profile').click();await page.waitForFunction(()=>document.querySelector('#profile-feedback').textContent.includes('Perfil salvo'));assert.match(await page.evaluate(()=>window.savedProfile.foto),/^data:image\/jpeg;base64,/);
   await page.locator('#cancel-profile').click();await page.locator('.user-profile').click();assert.equal(await page.locator('#profile-phone').inputValue(),'81999990000');
   await page.evaluate(()=>window.denyProfile=true);await page.locator('#save-profile').click();await page.waitForFunction(()=>document.querySelector('#profile-feedback').textContent.includes('regras'));await page.locator('#cancel-profile').click();await page.evaluate(()=>window.denyProfile=false);
  }
  if(name==='membros' && process.env.ADMIN_VISUAL_ROLE==='lider'){assert.equal(await page.locator('#add-record').count(),0);assert.equal(await page.locator('[data-action=delete]').count(),0);assert.equal(await page.locator('#records-table th').filter({hasText:'Função'}).count(),1);await page.locator('[data-action=edit]').click();assert.equal(await page.locator('#member-celulaId').count(),1);assert.equal(await page.locator('#member-nome').count(),0);assert.equal(await page.locator('#member-funcao').count(),0);await page.locator('#record-dialog').getByRole('button',{name:'Cancelar',exact:true}).click();}
  if(name==='membros' && process.env.ADMIN_VISUAL_ROLE!=='lider'){await page.locator('#add-record').click();await page.locator('#record-dialog').waitFor({state:'visible'});await page.screenshot({path:path.join(os.tmpdir(),'ekklesia-admin-modal.png'),fullPage:true});await page.locator('#cancel-form').click();}
  await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,name+' mobile overflow');
  await page.locator('.menu-button').click();assert.equal(await page.locator('.sidebar').isVisible(),true);await page.locator('.menu-button').click();
  if(name==='configuracoes')await page.screenshot({path:path.join(os.tmpdir(),'ekklesia-admin-mobile.png'),fullPage:true});
 }
 assert.deepEqual(errors,[]);
 }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
});
