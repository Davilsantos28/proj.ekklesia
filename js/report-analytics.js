export function validEntry(value) {
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
 const d=new Date(value+'T12:00:00Z');return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===value;
}
export function entrySeries(members,months,now=new Date()) {
 const year=Number(new Intl.DateTimeFormat('en',{timeZone:'America/Sao_Paulo',year:'numeric'}).format(now));
 const month=Number(new Intl.DateTimeFormat('en',{timeZone:'America/Sao_Paulo',month:'numeric'}).format(now))-1;
 const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(now);
 return Array.from({length:months},(_,i)=>{
  const date=new Date(Date.UTC(year,month-months+1+i,1));const key=date.toISOString().slice(0,7);
  return {key,label:date.toLocaleDateString('pt-BR',{month:'short',year:'2-digit',timeZone:'UTC'}).replace('.',''),value:members.filter(row=>validEntry(row.dataEntrada)&&row.dataEntrada<=today&&row.dataEntrada.startsWith(key)).length};
 });
}
const norm=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();
export function groupCounts(members,groups,field) {
 const counts=new Map();const names=new Map(groups.map(g=>[norm(g.nome),g.nome]));
 for(const row of members){const key=norm(row[field]);const name=!key||['sem célula','sem celula','sem ministerio','sem ministério','none'].includes(key)?'Sem vínculo':names.get(key)||String(row[field]).trim();counts.set(name,(counts.get(name)||0)+1);}
 return [...counts].map(([label,value])=>({label,value})).sort((a,b)=>b.value-a.value||a.label.localeCompare(b.label,'pt-BR'));
}
export function mountReportAnalytics(data,moduleSelect) {
 const $=s=>document.querySelector(s);const period=$('#analytics-period');if(!period)return;
 const text=(tag,value,cls)=>{const n=document.createElement(tag);n.textContent=value;if(cls)n.className=cls;return n;};
 function bars(host,items,total){
  host.replaceChildren();if(!items.length){host.append(text('p','Nenhum registro disponível para este indicador.','analytics-empty'));return;}
  const max=Math.max(...items.map(i=>i.value),1);
  for(const item of items){const row=document.createElement('div');row.className='analytics-bar-row';const labels=document.createElement('div');labels.className='analytics-bar-label';labels.append(text('span',item.label),text('strong',item.value+' · '+Math.round(item.value/Math.max(total,1)*100)+'%'));const track=document.createElement('div');track.className='analytics-track';const fill=document.createElement('span');fill.style.width=item.value/max*100+'%';track.append(fill);track.setAttribute('aria-hidden','true');row.append(labels,track);host.append(row);}
 }
 function render(){
  const members=data.membros,series=entrySeries(members,Number(period.value));const current=series.at(-1).value,previous=series.at(-2)?.value||0;
  const valid=members.filter(m=>validEntry(m.dataEntrada)).length;
  const growth=previous?((current-previous)/previous*100):null;
  const kpis=$('#analytics-kpis');kpis.replaceChildren();
  for(const [value,label,note]of [[members.length,'Pessoas cadastradas',members.filter(r=>r.status==='Ativo').length+' com status ativo'],[current,'Entradas neste mês','Contagem parcial do mês atual'],[growth===null?'—':(growth>0?'+':'')+growth.toLocaleString('pt-BR',{maximumFractionDigits:1})+'%','Variação de entradas',previous?'Em relação ao mês anterior completo':'Sem base no mês anterior'],[valid+'/'+members.length,'Datas de entrada válidas','Cobertura do histórico disponível']]){
   const card=document.createElement('article');card.className='analytics-kpi';card.append(text('span',label),text('strong',value),text('small',note));kpis.append(card);
  }
  const host=$('#growth-chart');host.replaceChildren();
  if(!valid){host.append(text('p','Preencha a data de entrada nos cadastros para acompanhar a evolução.','analytics-empty'));}
  else {
   const ns='http://www.w3.org/2000/svg';const svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 640 230');svg.classList.add('analytics-trend');svg.setAttribute('role','img');
   svg.setAttribute('aria-label','Entradas mensais: '+series.map(s=>s.label+': '+s.value).join('; '));
   const max=Math.max(...series.map(s=>s.value),1),step=570/series.length;
   for(let i=0;i<=4;i++){const y=185-i*40;const line=document.createElementNS(ns,'line');for(const[k,v]of Object.entries({x1:40,x2:625,y1:y,y2:y,stroke:'#e6eddf'}))line.setAttribute(k,v);svg.append(line);}
   series.forEach((item,i)=>{
    const h=item.value/max*145;const x=45+i*step;const rect=document.createElementNS(ns,'rect');for(const[k,v]of Object.entries({x,y:185-h,width:step*.6,height:h,rx:4,fill:i===series.length-1?'#164C27':'#A5D6A7'}))rect.setAttribute(k,v);
    const title=document.createElementNS(ns,'title');title.textContent=item.label+': '+item.value+' entrada(s)';rect.append(title);svg.append(rect);
    const count=document.createElementNS(ns,'text');count.setAttribute('x',x+step*.3);count.setAttribute('y',Math.max(20,177-h));count.setAttribute('text-anchor','middle');count.textContent=item.value;svg.append(count);
    if(series.length<=12||i%2===0){const label=document.createElementNS(ns,'text');label.setAttribute('x',x+step*.3);label.setAttribute('y',210);label.setAttribute('text-anchor','middle');label.textContent=item.label;svg.append(label);}
   });host.append(svg);
   const details=document.createElement('details');details.className='analytics-data';const summary=text('summary','Ver valores por mês');details.append(summary);
   const table=document.createElement('table');table.innerHTML='<thead><tr><th scope="col">Mês</th><th scope="col">Entradas</th></tr></thead>';const body=document.createElement('tbody');for(const row of series){const tr=document.createElement('tr');tr.append(text('td',row.label),text('td',row.value));body.append(tr);}table.append(body);details.append(table);host.append(details);
  }
  $('#growth-note').textContent=series.reduce((n,s)=>n+s.value,0)+' entrada(s) no período selecionado. '+(members.length-valid)+' cadastro(s) sem data válida. Datas futuras não entram na contagem. Zero indica ausência de entradas datadas no mês, não ausência de atividade.';
  bars($('#ministry-chart'),groupCounts(members,data.ministerios,'ministerio'),members.length);
  bars($('#cell-chart'),groupCounts(members,data.celulas,'celula'),members.length);
  const selected=data[moduleSelect.value]||[],counts=new Map();for(const row of selected){const status=row.status||'Não informado';counts.set(status,(counts.get(status)||0)+1);}
  $('#status-chart-title').textContent=moduleSelect.selectedOptions[0].textContent+' por situação';bars($('#status-chart'),[...counts].map(([label,value])=>({label,value})),selected.length);
 }
 period.addEventListener('change',render);moduleSelect.addEventListener('change',render);render();
}
