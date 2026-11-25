import { auth, db } from './firebase-config.js';
import { collection, doc, getDocs, query, where, limit, startAfter, runTransaction, serverTimestamp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';

export async function decideAccessRequest(id, approve) {
 if (!auth.currentUser) throw new Error('Entre novamente.');
 const actor=auth.currentUser.uid;
 if (id===actor) throw new Error('Você não pode aprovar seu próprio acesso.');
 await runTransaction(db,async tx=>{
  const own=await tx.get(doc(db,'usuarios',actor));
  const request=await tx.get(doc(db,'solicitacoes',id));
  const target=await tx.get(doc(db,'usuarios',id));
  if(!own.exists()||!request.exists()||!target.exists())throw new Error('Solicitação ou perfil não encontrado.');
  const admin=own.data(),r=request.data(),p=target.data();
  if(admin.perfil!=='administrador'||admin.status!=='ativo'||!admin.igrejaId||admin.igrejaId!==r.igrejaId||r.igrejaId!==p.igrejaId)throw new Error('Você não pode gerenciar pedidos de outra igreja.');
  if(r.status!=='pendente'||p.status!=='pendente')throw new Error('Esta solicitação já foi processada. Atualize a lista.');
  if(r.usuarioId!==id||!['administrador','membro'].includes(r.perfilSolicitado)||r.perfilSolicitado!==p.perfilSolicitado)throw new Error('O pedido não corresponde ao perfil cadastrado.');
  tx.update(doc(db,'solicitacoes',id),{status:approve?'aprovada':'recusada',decididoPor:actor,decididoEm:serverTimestamp()});
  tx.update(doc(db,'usuarios',id),{status:approve?'ativo':'recusado',perfil:approve?r.perfilSolicitado:'membro'});
 });
}
export async function mountAccessRequests(profile) {
 const menu=document.querySelector('.menu-button'),layout=document.querySelector('.layout');
 const mobile=matchMedia('(max-width:700px)');
 const syncMenu=()=>{layout.classList.remove('menu-open','menu-collapsed');menu.setAttribute('aria-expanded',String(!mobile.matches));};
 syncMenu();mobile.addEventListener('change',syncMenu);
 menu.onclick=()=>{const open=mobile.matches?layout.classList.toggle('menu-open'):!layout.classList.toggle('menu-collapsed');menu.setAttribute('aria-expanded',String(open));};
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&mobile.matches){layout.classList.remove('menu-open');menu.setAttribute('aria-expanded','false');}});
 document.addEventListener('click',e=>{if(mobile.matches&&layout.classList.contains('menu-open')&&!e.target.closest('.sidebar,.menu-button')){layout.classList.remove('menu-open');menu.setAttribute('aria-expanded','false');}});
 const host=document.querySelector('#requests-list'),message=document.querySelector('#requests-feedback');
 const next=document.querySelector('#requests-next'),back=document.querySelector('#requests-back');
 let cursor=null,last=null,history=[],busy=false;
 const status=document.querySelector('#requests-status');let rows=[];
 const say=text=>{message.textContent=text;};
 function render(){
  host.replaceChildren();const filtered=rows.filter(row=>!status.value||row.status===status.value);
  if(!filtered.length){const p=document.createElement('p');p.className='empty-state';p.textContent='Nenhuma solicitação nesta página com o filtro selecionado.';host.append(p);}
  for(const row of filtered){
   const card=document.createElement('article');card.className='request-card';
   const title=document.createElement('h3');title.textContent=row.nome;
   const details=document.createElement('p');details.textContent=[row.email,row.ministerio,'Perfil solicitado: '+(row.perfilSolicitado==='administrador'?'Administrador':'Membro')].filter(Boolean).join(' · ');
   const badge=document.createElement('span');badge.className='badge '+(row.status==='pendente'?'amber':row.status==='recusada'?'neutral':'');badge.textContent=({pendente:'Pendente',aprovada:'Aprovada',recusada:'Recusada'})[row.status]||row.status;
   card.append(title,details,badge);
   if(row.status==='pendente'){
    const actions=document.createElement('div');actions.className='request-actions';
    for(const approved of [true,false]){
     const button=document.createElement('button');button.type='button';button.className='button '+(approved?'':'secondary danger');button.textContent=approved?'Aprovar acesso':'Recusar';
     button.onclick=()=>openDecision(row,approved);actions.append(button);
    }card.append(actions);
   }host.append(card);
  }
 }
 const dialog=document.querySelector('#request-dialog');
 function openDecision(row,approved){
  document.querySelector('#decision-title').textContent=approved?'Aprovar acesso':'Recusar acesso';
  document.querySelector('#decision-text').textContent=approved?'Liberar o acesso de '+row.nome+' como '+(row.perfilSolicitado==='administrador'?'Administrador? Essa pessoa poderá gerenciar os dados da sua igreja.':'Membro da sua igreja?'):'Recusar a solicitação de '+row.nome+'? A conta continuará sem acesso.';
  document.querySelector('#decision-error').textContent='';
  const confirm=document.querySelector('#confirm-request');confirm.textContent=approved?'Confirmar aprovação':'Confirmar recusa';
  confirm.onclick=async()=>{
   if(busy)return;busy=true;confirm.disabled=true;document.querySelector('#cancel-request').disabled=true;
   try{await decideAccessRequest(row.id,approved);row.status=approved?'aprovada':'recusada';render();dialog.close();say(approved?'Acesso aprovado. A pessoa já pode entrar com a conta cadastrada.':'Solicitação recusada.');}
   catch(error){document.querySelector('#decision-error').textContent=error.code==='permission-denied'?'Sem permissão. Confira se as regras atualizadas foram publicadas.':error.code?'Não foi possível salvar. Confira a conexão e atualize a lista.':error.message;}
   finally{busy=false;confirm.disabled=false;document.querySelector('#cancel-request').disabled=false;}
  };dialog.showModal();document.querySelector('#cancel-request').focus();
 }
 document.querySelector('#cancel-request').onclick=()=>dialog.close();dialog.addEventListener('cancel',e=>{if(busy)e.preventDefault();});
 async function load(){
  if(busy)return;busy=true;next.disabled=back.disabled=true;say('Carregando solicitações…');
  try{
   if(!profile.igrejaId)throw new Error('Sua conta ainda não está vinculada a uma igreja. Não é possível listar pedidos com segurança.');
   const conditions=[where('igrejaId','==',profile.igrejaId),limit(100)];if(cursor)conditions.push(startAfter(cursor));
   const snapshot=await getDocs(query(collection(db,'solicitacoes'),...conditions));
   rows=snapshot.docs.map(d=>({...d.data(),id:d.id}));last=snapshot.docs.at(-1)||null;
   render();say(rows.length+' solicitação(ões) nesta página. O filtro se aplica à página atual.');next.disabled=rows.length<100;back.disabled=!history.length;
  }catch(error){host.replaceChildren();say(error.code?'Não foi possível carregar os pedidos. Confira a conexão e as regras do Firebase.':error.message);}
  finally{busy=false;}
 }
 next.onclick=()=>{if(!busy&&last){history.push(cursor);cursor=last;load();}};
 back.onclick=()=>{if(!busy&&history.length){cursor=history.pop();load();}};
 document.querySelector('#requests-refresh').onclick=()=>{if(!busy){cursor=null;history=[];load();}};
 status.onchange=render;await load();
}
