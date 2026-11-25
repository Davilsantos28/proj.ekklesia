import {auth,db} from './firebase-config.js';
import {doc,collection,getDoc,getDocs,query,where,limit,runTransaction} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import {publicMember} from './community-model.js';
import {updateCachedMember} from './community-service.js';
export async function saveMemberAccess(id,input,leader) {
 let selectedUid='';
 const accessEmail=String(input.emailAcesso||'').trim().toLowerCase();
 if(!leader&&accessEmail){
  const own=await getDoc(doc(db,'usuarios',auth.currentUser.uid));
  if(!own.exists()||own.data().perfil!=='administrador'||own.data().status!=='ativo'||!own.data().igrejaId)throw new Error('Somente o administrador pode localizar contas de acesso.');
  const matches=await getDocs(query(collection(db,'usuarios'),where('igrejaId','==',own.data().igrejaId),where('status','==','ativo'),where('email','==',accessEmail),limit(2)));
  if(matches.docs.length!==1)throw new Error(matches.docs.length?'Mais de uma conta corresponde ao e-mail. Confira os cadastros.':'Não foi encontrada uma conta ativa com este e-mail na sua igreja.');
  selectedUid=matches.docs[0].id;
 }
 return runTransaction(db,async tx=>{
  const actorSnap=await tx.get(doc(db,'usuarios',auth.currentUser.uid));const beforeSnap=await tx.get(doc(db,'membros',id));
  if(!actorSnap.exists()||!beforeSnap.exists())throw new Error('Conta ou membro não encontrado.');
  const actor=actorSnap.data(),before=beforeSnap.data();
  if(actor.status!=='ativo'||!['administrador','lider'].includes(actor.perfil)||!actor.igrejaId||before.igrejaId!==actor.igrejaId)throw new Error('Acesso não autorizado para esta igreja.');
  if(leader!== (actor.perfil==='lider'))throw new Error('Seu perfil mudou. Entre novamente.');
  const value={...before};
  for(const [field,module]of [['ministerio','ministerios'],['celula','celulas'],['banda','bandas']]) {
   const targetId=input[field+'Id']||null;
   if(targetId){const snap=await tx.get(doc(db,module,targetId));if(!snap.exists()||snap.data().igrejaId!==actor.igrejaId)throw new Error('Selecione vínculos da mesma igreja.');value[field]=snap.data().nome;}
   else value[field]='';value[field+'Id']=targetId;
  }
  let account=null;let uid=before.usuarioId||'';
  if(!leader){
   for(const[field]of window.Ekklesia.schemas.membros.fields)if(!['ministerio','celula','banda'].includes(field))value[field]=String(input[field]??before[field]??'').trim();
   uid=selectedUid||before.usuarioId||'';
   if(before.usuarioId&&uid!==before.usuarioId)throw new Error('O vínculo com a conta existente não pode ser trocado por este formulário.');
   if(!['membro','lider'].includes(input.funcao))throw new Error('Função inválida.');
   value.funcao=input.funcao;
   if(!uid&&value.funcao==='lider')throw new Error('Informe o e-mail da conta ativa para liberar o acesso de Líder.');
   if(uid){
    const snap=await tx.get(doc(db,'usuarios',uid));if(!snap.exists())throw new Error('Conta de acesso não encontrada.');account=snap.data();
    if(accessEmail&&String(account.email||'').trim().toLowerCase()!==accessEmail)throw new Error('O e-mail da conta mudou. Confira e tente novamente.');
    value.emailAcesso=account.email;
    if(account.igrejaId!==actor.igrejaId||account.status!=='ativo'||!['membro','lider'].includes(account.perfil))throw new Error('Vincule uma conta ativa de Membro ou Líder da mesma igreja.');
    if(account.membroId&&account.membroId!==id)throw new Error('Esta conta já está vinculada a outra pessoa.');
    value.usuarioId=uid;
   }
  }
  const links=Object.fromEntries(['ministerio','celula','banda','ministerioId','celulaId','bandaId'].map(k=>[k,value[k]]));
  tx.update(doc(db,'membros',id),leader?links:value);
  tx.set(doc(db,'comunidadeMembros',id),{...publicMember(value),igrejaId:actor.igrejaId});
  if(account)tx.update(doc(db,'usuarios',uid),{perfil:value.funcao,membroId:id});
  return {...value,id};
 });
}
export function editMemberAccess(row,data,{leader,onSaved}) {
 const dialog=document.querySelector('#record-dialog'),content=document.querySelector('#dialog-content');
 document.querySelector('#dialog-title').textContent=leader?'Editar vínculos de '+row.nome:'Editar membro e função';
 content.replaceChildren();const form=document.createElement('form'),grid=document.createElement('div');grid.className='form-grid';form.append(grid);
 const field=(name,title,input)=>{const div=document.createElement('div');div.className='field';const label=document.createElement('label');label.htmlFor='member-'+name;label.textContent=title;input.id='member-'+name;input.name=name;div.append(label,input);grid.append(div);};
 if(!leader){
  for(const[name,title,type,options]of window.Ekklesia.schemas.membros.fields){
   if(['ministerio','celula','banda'].includes(name))continue;
   let el;if(type==='select'){el=document.createElement('select');for(const option of options)el.add(new Option(option,option));}
   else{el=document.createElement('input');el.type=type||'text';el.maxLength=160;}
   el.value=row[name]||'';if(name==='nome')el.required=true;field(name,title,el);
  }
  const role=document.createElement('select');for(const[v,label]of [['membro','Membro'],['lider','Líder']])role.add(new Option(label,v));role.value=row.funcao||'membro';field('funcao','Função',role);
  const email=document.createElement('input');email.type='email';email.value=row.emailAcesso||row.email||'';email.maxLength=254;field('emailAcesso','E-mail da conta de acesso',email);
 }
 for(const[name,module,label]of [['ministerio','ministerios','Ministério'],['celula','celulas','Célula'],['banda','bandas','Banda']]){
  const select=document.createElement('select');select.add(new Option('Sem vínculo',''));
  for(const group of data[module])select.add(new Option(group.nome,group.id));
  const match=data[module].find(g=>g.id===row[name+'Id']||(!row[name+'Id']&&g.nome===row[name]));select.value=match?.id||'';field(name+'Id',label,select);
 }
 const note=document.createElement('p');note.className='context-note';note.textContent=leader?'Você pode vincular ou desvincular a pessoa dos grupos já cadastrados.':'Informe o e-mail usado para entrar no sistema. A conta deve estar ativa e pertencer à mesma igreja. O vínculo existente não será trocado por outra conta.';form.append(note);
 const error=document.createElement('p');error.className='form-error';error.setAttribute('role','alert');form.append(error);
 const actions=document.createElement('div');actions.className='dialog-actions';const cancel=document.createElement('button');cancel.type='button';cancel.className='button secondary';cancel.textContent='Cancelar';cancel.onclick=()=>dialog.close();const save=document.createElement('button');save.className='button';save.textContent='Salvar alterações';actions.append(cancel,save);form.append(actions);
 form.onsubmit=async e=>{e.preventDefault();if(save.disabled)return;save.disabled=true;try{const saved=await saveMemberAccess(row.id,Object.fromEntries(new FormData(form)),leader);updateCachedMember(saved);onSaved();dialog.close();}catch(e){error.textContent=e.code?'Não foi possível salvar. Confira a conexão e as regras do Firebase.':e.message;}finally{save.disabled=false;}};
 content.append(form);dialog.showModal();
}
