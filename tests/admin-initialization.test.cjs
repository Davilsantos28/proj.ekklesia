const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
async function fixture({ ready = true, catalog = null } = {}) {
  const writes = [];
  const context = vm.createContext({ structuredClone, window: { Ekklesia: { schemas: { escalas: {fields:[]}, campanhas:{fields:[]} } } }, document: {body:{dataset:{}}} });
  const mock = {
    db:{},auth:{currentUser:{uid:'admin'}},
    onSnapshot: () => () => {}, collection: (_db,name)=>({name}), doc:(_db,name,id)=>({name,id}),
    query:(ref,...conditions)=>({...ref,conditions}),where:(...args)=>args,
    getDocs:async ref=>({docs:ref.name==='ministerios'?[
      {id:'1',data:()=>({nome:' Louvor ',status:'Ativo'})},
      {id:'2',data:()=>({nome:'Louvor',status:'Ativo'})},
      {id:'3',data:()=>({nome:'Antigo',status:'Inativo'})}
    ]:[]}),
    getDoc:async ref=>({exists:()=>ref.name==='system'||catalog!==null,data:()=>ref.name==='system'?{migrationComplete:ready}:catalog}),
    setDoc:async(ref,value)=>writes.push({ref,value}),
    writeBatch(){},runTransaction(){},serverTimestamp(){},Timestamp:{},
    publicMember(){},eventStart(){},isOpenWorship(){},safePaymentUrl(){}
  };
  const dep=new vm.SyntheticModule(Object.keys(mock),function(){for(const[k,v]of Object.entries(mock))this.setExport(k,v);},{context});
  const module=new vm.SourceTextModule(fs.readFileSync('js/community-service.js','utf8'),{context});
  await module.link(()=>dep);await module.evaluate();
  await module.namespace.initializeAdmin({igrejaId:'church-1'});
  return {writes,store:context.window.Ekklesia.store};
}
test('administrador abre painel e sincroniza nomes ativos sem ReferenceError',async()=>{
  const {writes,store}=await fixture();
  assert.equal(writes.length,1);
  assert.equal(writes[0].ref.name,'catalogoMinisterios');
  assert.equal(writes[0].value.igrejaId,'church-1');
  assert.deepEqual(Array.from(writes[0].value.nomes),['Louvor']);
  assert.equal(store.load().ministerios.length,3);
});
test('catálogo inalterado não gera gravação extra',async()=>{
  const {writes}=await fixture({catalog:{igrejaId:'church-1',nomes:['Louvor']}});
  assert.equal(writes.length,0);
});
test('migração pendente permite inicialização somente leitura sem escrever catálogo',async()=>{
  const {writes,store}=await fixture({ready:false});
  assert.equal(writes.length,0);assert.equal(store.tenancyReady,false);
  assert.equal(store.load().ministerios.length,3);
});
