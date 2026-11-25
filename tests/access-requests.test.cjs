const {test}=require('node:test');const assert=require('node:assert/strict');const vm=require('node:vm');const fs=require('node:fs');
async function fixture(overrides={}) {
 const writes=[];const values={admin:{perfil:'administrador',status:'ativo',igrejaId:'a'},request:{usuarioId:'new',igrejaId:'a',status:'pendente',perfilSolicitado:'administrador'},target:{igrejaId:'a',status:'pendente',perfilSolicitado:'administrador'},...overrides};
 const context=vm.createContext({});
 const mocks={publicMember:row=>({nome:row.nome,status:row.status,ministerio:row.ministerio||'',celula:row.celula||'',banda:row.banda||''}),auth:{currentUser:{uid:'admin'}},db:{},collection(){},doc:(_db,name,id)=>({name,id}),getDocs:async()=>({docs:(values.people||[]).map(item=>({id:item.id,data:()=>item}))}),query(){},where(){},limit(){},startAfter(){},serverTimestamp:()=> 'SERVER_TIME',runTransaction:async(_db,fn)=>fn({get:async ref=>({exists:()=>ref.name!=='membros'||(values.people||[]).some(row=>row.id===ref.id),data:()=>ref.name==='membros'?(values.people||[]).find(row=>row.id===ref.id):ref.id==='admin'?values.admin:ref.name==='solicitacoes'?values.request:values.target}),update:(ref,data)=>writes.push({ref,data}),set:(ref,data)=>writes.push({ref,data})})};
 const dep=new vm.SyntheticModule(Object.keys(mocks),function(){for(const[k,v]of Object.entries(mocks))this.setExport(k,v);},{context});
 const module=new vm.SourceTextModule(fs.readFileSync('js/access-requests.js','utf8'),{context});await module.link(()=>dep);await module.evaluate();return {api:module.namespace,writes};
}
test('aprovação atualiza pedido e concede exatamente o perfil solicitado',async()=>{
 for(const perfilSolicitado of ['administrador','membro']){
 const {api,writes}=await fixture({request:{usuarioId:'new',igrejaId:'a',status:'pendente',email:'novo@example.com',perfilSolicitado},target:{igrejaId:'a',nome:'Nova pessoa',email:'novo@example.com',status:'pendente',perfilSolicitado}});
 await api.decideAccessRequest('new',true);assert.equal(writes.length,perfilSolicitado==='membro'?4:2);
 const request=writes.find(entry=>entry.ref.name==='solicitacoes'), account=writes.find(entry=>entry.ref.name==='usuarios');
 assert.equal(request.data.status,'aprovada');assert.equal(request.data.decididoPor,'admin');assert.equal(account.data.perfil,perfilSolicitado);assert.equal(account.data.status,'ativo');
 if(perfilSolicitado==='membro'){
  assert.equal(account.data.membroId,'new');
  assert.equal(writes.find(entry=>entry.ref.name==='membros').data.usuarioId,'new');
  assert.equal(writes.find(entry=>entry.ref.name==='comunidadeMembros').data.email,undefined);
 }
 }
});
test('recusa mantém o usuário sem acesso',async()=>{const {api,writes}=await fixture();await api.decideAccessRequest('new',false);assert.equal(writes[0].data.status,'recusada');assert.equal(writes[1].data.status,'recusado');assert.equal(writes[1].data.perfil,'membro');});
test('não permite autoaprovação, outra igreja, perfil divergente ou decisão repetida',async()=>{
 const cases=[{}, {admin:{perfil:'membro',status:'ativo',igrejaId:'a'}},{request:{usuarioId:'new',igrejaId:'b',status:'pendente',perfilSolicitado:'administrador'}},{target:{igrejaId:'a',status:'ativo',perfilSolicitado:'administrador'}},{target:{igrejaId:'a',status:'pendente',perfilSolicitado:'membro'}}];
 for(let i=0;i<cases.length;i++){const {api,writes}=await fixture(cases[i]);await assert.rejects(api.decideAccessRequest(i===0?'admin':'new',true));assert.equal(writes.length,0);}
});

test('recupera conta aprovada usando e-mail normalizado e preserva o cadastro', async () => {
 const {api,writes}=await fixture({
  request:{usuarioId:'new',igrejaId:'a',status:'aprovada',perfilSolicitado:'membro',email:'abc@example.com'},
  target:{igrejaId:'a',status:'ativo',perfil:'membro',perfilSolicitado:'membro',email:'abc@example.com'},
  people:[{id:'legacy',igrejaId:'a',email:' ABC@EXAMPLE.COM ',nome:'Original',status:'Ativo'}]
 });
 await api.decideAccessRequest('new',true,true);
 assert.equal(writes.find(row=>row.ref.name==='usuarios').data.membroId,'legacy');
 assert.equal(writes.find(row=>row.ref.name==='membros').data.nome,undefined);
 assert.equal(writes.filter(row=>row.ref.name==='solicitacoes').length,0);
});
test('não vincula e-mails duplicados ou conta de outra pessoa', async () => {
 const person={id:'legacy',igrejaId:'a',email:'abc@example.com',nome:'Original',status:'Ativo'};
 for(const people of [[person,{...person,id:'duplicate'}],[{...person,usuarioId:'other'}]]){
  const {api,writes}=await fixture({
   request:{usuarioId:'new',igrejaId:'a',status:'pendente',perfilSolicitado:'membro',email:'abc@example.com'},
   target:{igrejaId:'a',status:'pendente',perfilSolicitado:'membro',email:'abc@example.com'},people
  });
  await assert.rejects(api.decideAccessRequest('new',true));assert.equal(writes.length,0);
 }
});
