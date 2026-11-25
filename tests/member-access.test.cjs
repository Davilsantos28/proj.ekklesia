const {test}=require('node:test');const assert=require('node:assert/strict');const vm=require('node:vm');const fs=require('node:fs');
async function fixture(options={}){
 const writes=[];const records={
 'usuarios/actor':{perfil:options.leader?'lider':'administrador',status:'ativo',igrejaId:'a'},
 'membros/person':{nome:'Pessoa',email:'privado@example.com',igrejaId:'a',funcao:'membro',status:'Ativo'},
 'usuarios/account':{email:'acesso@example.com',perfil:'membro',status:'ativo',igrejaId:'a',...(options.account||{})},
 'celulas/group':{nome:'Esperança',igrejaId:options.foreign?'b':'a'},
 'ministerios/ministry':{nome:'Louvor',igrejaId:'a'}
 };
 const context=vm.createContext({window:{Ekklesia:{schemas:{membros:{fields:[['nome'],['email'],['ministerio'],['celula'],['banda']]}}}}});
 const mock={auth:{currentUser:{uid:'actor'}},db:{},doc:(_db,name,id)=>name+'/'+id,collection(){},query(){},where(){},limit(){},getDoc:async ref=>({exists:()=>!!records[ref],data:()=>records[ref]}),getDocs:async()=>({docs:options.noMatch?[]:options.duplicate?[{id:'account'},{id:'other'}]:[{id:'account'}]}),publicMember:v=>({nome:v.nome,ministerio:v.ministerio,celula:v.celula,banda:v.banda,status:v.status}),updateCachedMember(){},runTransaction:async(_db,fn)=>fn({get:async ref=>({exists:()=>!!records[ref],data:()=>records[ref]}),update:(ref,value)=>writes.push({ref,value}),set:(ref,value)=>writes.push({ref,value})})};
 const dep=new vm.SyntheticModule(Object.keys(mock),function(){for(const[k,v]of Object.entries(mock))this.setExport(k,v);},{context});const mod=new vm.SourceTextModule(fs.readFileSync('js/member-access.js','utf8'),{context});await mod.link(()=>dep);await mod.evaluate();return {api:mod.namespace,writes};
}
const input={nome:'Pessoa',email:'privado@example.com',funcao:'lider',emailAcesso:' ACESSO@example.com ',celulaId:'group',ministerioId:'ministry',bandaId:''};
test('pastor vincula conta e concede Líder atomicamente',async()=>{const {api,writes}=await fixture();const result=await api.saveMemberAccess('person',input,false);assert.equal(result.funcao,'lider');assert.equal(writes.length,3);const account=writes.find(w=>w.ref==='usuarios/account');assert.equal(account.value.perfil,'lider');assert.equal(account.value.membroId,'person');});
test('líder altera apenas vínculos e não concede privilégios',async()=>{const {api,writes}=await fixture({leader:true});const result=await api.saveMemberAccess('person',input,true);assert.equal(result.funcao,'membro');assert.equal(writes.length,2);assert.deepEqual(Object.keys(writes[0].value).sort(),['banda','bandaId','celula','celulaId','ministerio','ministerioId']);});
test('desvincular célula preserva pessoa e conta',async()=>{const {api,writes}=await fixture({leader:true});const result=await api.saveMemberAccess('person',{...input,celulaId:''},true);assert.equal(result.celula,'');assert.equal(result.celulaId,null);assert.equal(result.nome,'Pessoa');assert.equal(writes.some(w=>w.ref.startsWith('usuarios/')),false);});
test('rejeita vínculo estrangeiro, conta administrativa e conta já associada',async()=>{for(const options of [{foreign:true},{account:{perfil:'administrador'}},{account:{membroId:'another'}}]){const {api,writes}=await fixture(options);await assert.rejects(api.saveMemberAccess('person',input,false));assert.equal(writes.length,0);}});
test('liderança exige conta vinculada e não aceita falsa identidade de perfil',async()=>{const {api,writes}=await fixture();await assert.rejects(api.saveMemberAccess('person',{...input,emailAcesso:''},false));await assert.rejects(api.saveMemberAccess('person',input,true));assert.equal(writes.length,0);});
test('busca por e-mail exige correspondência única e atual',async()=>{
 for(const options of [{noMatch:true},{duplicate:true},{account:{email:'mudou@example.com'}}]){
  const {api,writes}=await fixture(options);await assert.rejects(api.saveMemberAccess('person',input,false));assert.equal(writes.length,0);
 }
});
