import {adminIcon} from './admin-icons.js';
export function mountLeaderLayout(bindMenu=false) {
 const nav=document.querySelector('.sidebar-menu');nav.replaceChildren();
 const page=location.pathname.split('/').pop();
 for(const [href,label,icon]of [['inicio-lider.html','Início','home'],['membros.html','Membros','users'],['ministerios.html','Ministérios','ministry'],['celulas.html','Células','groups']]){
  const a=document.createElement('a');a.href=href;a.className='menu-item'+(page===href?' active':'');
  if(page===href)a.setAttribute('aria-current','page');
  const span=document.createElement('span');span.innerHTML=adminIcon(icon);a.append(span,document.createTextNode(label));nav.append(a);
 }
 document.querySelector('.notification-button')?.setAttribute('hidden','');
 document.querySelectorAll('.user-info span').forEach(n=>n.textContent='Líder');
 if(!bindMenu)return;
 const button=document.querySelector('.menu-button'),layout=document.querySelector('.layout'),mobile=matchMedia('(max-width:700px)');
 const close=()=>{layout.classList.remove('menu-open');button.setAttribute('aria-expanded','false');};
 const sync=()=>{layout.classList.remove('menu-open','menu-collapsed');button.setAttribute('aria-expanded',String(!mobile.matches));};sync();mobile.addEventListener('change',sync);
 button.onclick=()=>{const open=mobile.matches?layout.classList.toggle('menu-open'):!layout.classList.toggle('menu-collapsed');button.setAttribute('aria-expanded',String(open));};
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&mobile.matches)close();});
 document.addEventListener('click',e=>{if(mobile.matches&&!e.target.closest('.sidebar,.menu-button'))close();});
}
