import {mountLeaderLayout} from './leader-layout.js';
import {adminIcon} from './admin-icons.js';
import {auth} from './firebase-config.js';
import {readProfile,isActiveUser,isLeader,homeFor,logout} from './auth-service.js';
import {readLeaderWorships} from './community-service.js';
const $=s=>document.querySelector(s);
const text=(tag,value,cls)=>{const n=document.createElement(tag);n.textContent=value;if(cls)n.className=cls;return n;};
let busy=false;
async function refresh(){
 if(busy)return;busy=true;$('#leader-refresh').disabled=true;
 try{
  const rows=await readLeaderWorships();const host=$('#leader-worships');host.replaceChildren();
  $('#leader-worship-count').textContent=String(rows.length);
  if(!rows.length)host.append(text('p','Nenhum culto futuro cadastrado. Novos cultos aparecerão quando a administração publicar.','context-note'));
  for(const row of rows){const card=document.createElement('article');card.className='leader-worship-item';card.append(text('span',row.data.split('-').reverse().join('/')+' · '+row.horario,'badge'),text('h3',row.nome),text('p',row.local||'Local não informado'),text('p',row.ministerio||'Ministério não informado'),text('span',row.status,'badge'));if(row.equipe)card.append(text('p',row.equipe));host.append(card);}
  $('#leader-message').hidden=true;
 }catch(error){$('#leader-worships').replaceChildren();$('#leader-worship-count').textContent='';$('#leader-message').hidden=false;$('#leader-message').textContent=error.code==='permission-denied'?'Não foi possível consultar os cultos. Confira suas permissões com a administração.':error.code?'Falha de conexão. Clique em Atualizar cultos para tentar novamente.':error.message;}
 finally{busy=false;$('#leader-refresh').disabled=false;}
}
$('#leader-refresh').onclick=refresh;
$('#leader-logout').onclick=async event=>{event.preventDefault();try{await logout();location.replace('login.html');}catch{$('#leader-message').hidden=false;$('#leader-message').textContent='Não foi possível sair. Tente novamente.';}};
window.addEventListener('pageshow',event=>{if(event.persisted)location.reload();});
try{
 await auth.authStateReady();
 if(!auth.currentUser)location.replace('login.html');
 else{
  const profile=await readProfile(auth.currentUser);
  if(!isActiveUser(profile)){await logout();location.replace('login.html');}
  else if(!isLeader(profile))location.replace(homeFor(profile));
  else{mountLeaderLayout(true);$('#leader-role-icon').innerHTML=adminIcon('users');$('#leader-calendar-icon').innerHTML=adminIcon('calendar');document.documentElement.classList.remove('auth-checking');$('#leader-name').textContent=profile.nome;const avatar=document.querySelector('.user-avatar');avatar.textContent=profile.nome?.slice(0,1).toUpperCase()||'L';const {mountUserProfile}=await import('./user-profile.js');mountUserProfile(profile);$('#leader-loading').hidden=true;$('#leader-home').hidden=false;await refresh();}
 }
}catch(error){$('#leader-loading').textContent='Não foi possível verificar seu acesso. Recarregue a página ou volte ao login. ';const link=document.createElement('a');link.href='login.html';link.textContent='Voltar ao login';$('#leader-loading').append(link);}
