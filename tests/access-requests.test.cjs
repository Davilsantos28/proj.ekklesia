const {test}=require('node:test');const assert=require('node:assert/strict');const vm=require('node:vm');const fs=require('node:fs');
async function fixture(overrides={}) {
 const writes=[];const values={admin:{perfil:'administrador',status:'ativo',igrejaId:'a'},request:{usuarioId:'new',igrejaId:'a',status:'pendente',perfilSolicitado:'administrador'},target:{igrejaId:'a',status:'pendente',perfilSolicitado:'administrador'},...overrides};
 const context=vm.createContext({});
 const mocks={auth:{currentUser:{uid:'admin'}},db:{},collection(){},doc:(_db,name,id)=>({name,id}),getDocs(){},query(){},where(){},limit(){},startAfter(){},serverTimestamp:()=> 'SERVER_TIME',runTransaction:async(_db,fn)=>fn({get:async ref=>({exists:()=>true,data:()=>ref.id==='admin'?values.admin:ref.name==='solicitacoes'?values.request:values.target}),update:(ref,data)=>writes.push({ref,data})})};
 const dep=new vm.SyntheticModule(Object.keys(mocks),function(){for(const[k,v]of Object.entries(mocks))this.setExport(k,v);},{context});
 const module=new vm.SourceTextModule(fs.readFileSync('js/access-requests.js','utf8'),{context});await module.link(()=>dep);await module.evaluate();return {api:module.namespace,writes};
}
test('aprovação atualiza pedido e concede exatamente o perfil solicitado',async()=>{
 for(const perfilSolicitado of ['administrador','membro']){
 const {api,writes}=await fixture({request:{usuarioId:'new',igrejaId:'a',status:'pendente',perfilSolicitado},target:{igrejaId:'a',status:'pendente',perfilSolicitado}});
 await api.decideAccessRequest('new',true);assert.equal(writes.length,2);assert.equal(writes[0].data.status,'aprovada');assert.equal(writes[0].data.decididoPor,'admin');assert.equal(writes[1].data.perfil,perfilSolicitado);assert.equal(writes[1].data.status,'ativo');
 }
});
test('recusa mantém o usuário sem acesso',async()=>{const {api,writes}=await fixture();await api.decideAccessRequest('new',false);assert.equal(writes[0].data.status,'recusada');assert.equal(writes[1].data.status,'recusado');assert.equal(writes[1].data.perfil,'membro');});
test('não permite autoaprovação, outra igreja, perfil divergente ou decisão repetida',async()=>{
 const cases=[{}, {admin:{perfil:'membro',status:'ativo',igrejaId:'a'}},{request:{usuarioId:'new',igrejaId:'b',status:'pendente',perfilSolicitado:'administrador'}},{target:{igrejaId:'a',status:'ativo',perfilSolicitado:'administrador'}},{target:{igrejaId:'a',status:'pendente',perfilSolicitado:'membro'}}];
 for(let i=0;i<cases.length;i++){const {api,writes}=await fixture(cases[i]);await assert.rejects(api.decideAccessRequest(i===0?'admin':'new',true));assert.equal(writes.length,0);}
});
