import { adminIcon } from './admin-icons.js';
export function mountDashboardTools(store, schedule) {
 const $=s=>document.querySelector(s);
 let month=new Date();month=new Date(month.getFullYear(),month.getMonth(),1);
 const dialog=document.createElement('dialog');dialog.id='dashboard-preview';dialog.setAttribute('aria-labelledby','preview-title');
 dialog.innerHTML='<div class="dialog-heading"><h2 id="preview-title"></h2><button class="icon-button" type="button" aria-label="Fechar prévia">'+adminIcon('close')+'</button></div><div id="preview-content"></div><div class="dialog-actions"><a class="button" id="preview-link">Ver listagem completa</a></div>';
 document.body.append(dialog);dialog.querySelector('button').onclick=()=>dialog.close();
 const content=dialog.querySelector('#preview-content');const title=dialog.querySelector('h2');const link=dialog.querySelector('a');
 const text=(tag,value,cls)=>{const n=document.createElement(tag);n.textContent=value;if(cls)n.className=cls;return n;};
 function showEvent(row) {
  title.textContent=row.nome;content.replaceChildren();
  const details=[['Data',row.data?.split('-').reverse().join('/')],['Horário',row.horario],['Local',row.local],['Ministério',row.ministerio],['Situação',row.status],['Equipe',row.equipe]];
  const dl=document.createElement('dl');dl.className='details-list';
  for(const[label,value]of details){const item=document.createElement('div');item.append(text('dt',label),text('dd',value||'Não informado'));dl.append(item);}
  content.append(dl);link.href='escalas.html';link.textContent='Gerenciar escalas';dialog.showModal();
 }
 const labels={membros:'Membros',ministerios:'Ministérios',celulas:'Células',escalas:'Escalas'};
 for(const counter of document.querySelectorAll('[data-count]')){
  const card=counter.closest('.stat-card');const key=counter.dataset.count;
  card.classList.add('preview-card');card.setAttribute('role','button');card.tabIndex=0;card.setAttribute('aria-haspopup','dialog');card.setAttribute('aria-label','Visualizar prévia de '+labels[key]);
  const hint=text('small','Ver prévia →','preview-hint');card.querySelector('div').append(hint);
  const open=()=>{
   const rows=store.load()[key]||[];title.textContent=labels[key];content.replaceChildren(text('p',rows.length+' registro(s) cadastrado(s). Mostrando até 5.','context-note'));
   if(!rows.length)content.append(text('p','Ainda não há registros cadastrados.','empty-state'));
   for(const row of rows.slice(0,5)){
    const item=document.createElement('article');item.className='preview-row';item.append(text('strong',row.nome));
    item.append(text('p',key==='membros'?[row.ministerio,row.celula,row.status].filter(Boolean).join(' · '):key==='escalas'?[row.data?.split('-').reverse().join('/'),row.horario,row.status].filter(Boolean).join(' · '):[row.lider&&'Liderança: '+row.lider,row.local,row.status].filter(Boolean).join(' · ')));
    content.append(item);
   }
   link.href=key+'.html';link.textContent='Ver listagem completa';dialog.showModal();
  };card.onclick=open;card.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();open();}};
 }
 const host=$('#real-agenda');
 const dateKey=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
 let selected='';
 function render(){
  const rows=store.load().escalas.filter(row=>schedule.scheduleDate(row)&&!['Cancelada','Concluída'].includes(row.status));
  host.replaceChildren();const header=document.createElement('div');header.className='mini-calendar-heading';
  const heading=text('h4',month.toLocaleDateString('pt-BR',{month:'long',year:'numeric'}));
  for(const delta of [-1,1]){const b=document.createElement('button');b.type='button';b.className='icon-button';b.textContent=delta<0?'‹':'›';b.setAttribute('aria-label',delta<0?'Mês anterior':'Próximo mês');b.onclick=()=>{month=new Date(month.getFullYear(),month.getMonth()+delta,1);selected='';render();};if(delta<0)header.append(b);else header.append(heading,b);}
  host.append(header);const grid=document.createElement('div');grid.className='mini-calendar';
  for(const day of ['D','S','T','Q','Q','S','S'])grid.append(text('span',day,'weekday'));
  for(let i=0;i<month.getDay();i++)grid.append(document.createElement('span'));
  const total=new Date(month.getFullYear(),month.getMonth()+1,0).getDate();
  for(let day=1;day<=total;day++){
   const key=dateKey(new Date(month.getFullYear(),month.getMonth(),day));const events=rows.filter(row=>row.data===key);
   const b=document.createElement('button');b.type='button';b.textContent=day;b.className=events.length?'has-events':'';b.disabled=!events.length;
   b.setAttribute('aria-label',key.split('-').reverse().join('/')+': '+events.length+' evento(s)');b.setAttribute('aria-pressed',String(selected===key));
   if(key===dateKey(new Date()))b.setAttribute('aria-current','date');b.onclick=()=>{selected=selected===key?'':key;render();};grid.append(b);
  }host.append(grid);
  const filtered=rows.filter(row=>selected?row.data===selected:row.data.startsWith(dateKey(month).slice(0,7))).sort((a,b)=>(a.data+a.horario).localeCompare(b.data+b.horario));
  host.append(text('p',selected?'Eventos de '+selected.split('-').reverse().join('/'):'Eventos deste mês','context-note'));
  if(!filtered.length)host.append(text('p','Nenhum evento cadastrado neste mês.','context-note'));
  for(const row of filtered){const b=document.createElement('button');b.type='button';b.className='agenda-event';b.append(text('strong',row.nome),text('span',row.data.split('-').reverse().join('/')+' · '+row.horario+' · '+(row.local||'Local não informado')));b.onclick=()=>showEvent(row);host.append(b);}
 }
 render();store.subscribe(render);
}
