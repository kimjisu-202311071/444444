const $ = id => document.getElementById(id);
const fmt = x => Number(x).toLocaleString('ko-KR',{maximumFractionDigits:3});
let worker, nextId=0, requests=new Map(), sectors=[], rowChoices=[], cells=[], basket=[], result=null, dashboard=null;
const FILES = {
  basic:'./data/io-2023.xlsx',
  small:'./data/io-2023-small.xlsx.xlsx',
  mid:'./data/io-2023-mid.xlsx.xlsx',
  large:'./data/io-2023-large.xlsx.xlsx'
};
const CLASS_LABELS = {basic:'기본부문 380개',small:'소분류 165개',mid:'중분류 83개',large:'대분류 33개'};
function text(tag,value){const e=document.createElement(tag);e.textContent=value;return e;}
function call(type,payload){return new Promise((resolve,reject)=>{const id=++nextId;requests.set(id,{resolve,reject});worker.postMessage({id,type,payload});});}
function startWorker(){
  worker=new Worker('./worker.js');
  worker.onmessage=({data:d})=>{
    if(d.type==='status'){$('status').textContent=d.text;return;}
    const p=requests.get(d.id);if(!p)return;requests.delete(d.id);d.ok?p.resolve(d.result):p.reject(Error(d.error));
  };
  worker.onerror=e=>{for(const p of requests.values())p.reject(Error(e.message||'Worker 실행 오류'));requests.clear();};
}
function options(el,list){el.replaceChildren(...list.map(x=>{const o=document.createElement('option');o.value=x.code;o.textContent=x.code+' '+x.name;return o;}));}
function invalidate(){result=null;$('results').hidden=true;}
function renderBarChart(container, rows, unit, valueLabel='값'){
  container.replaceChildren();
  if(!rows || !rows.length){container.append(text('p','표시할 자료가 없습니다.'));return;}
  const max=Math.max(...rows.map(r=>Math.max(0,r.value)),1);
  rows.forEach((r,i)=>{
    const line=document.createElement('div');line.className='chart-row';
    const head=document.createElement('div');head.className='chart-head';
    const label=text('span',`${i+1}. ${r.name}`);label.className='chart-label';label.title=`${r.code} ${r.name}`;
    const value=text('strong',`${fmt(r.value)} ${unit}`);value.className='chart-value';
    head.append(label,value);
    const track=document.createElement('div');track.className='chart-track';
    const fill=document.createElement('div');fill.className='chart-fill';fill.style.width=`${Math.max(0,r.value)/max*100}%`;
    track.append(fill);line.append(head,track);container.append(line);
  });
}
function renderDashboard(d){
  dashboard=d;
  $('sector-count').textContent=fmt(d.sectorCount)+'개';
  $('class-count').textContent=d.classification;
  $('output-total').textContent=fmt(d.totalOutput);
  $('value-total').textContent=fmt(d.totalValueAdded);
  renderBarChart($('output-chart'),d.outputTop,'백만원','총산출액');
  renderBarChart($('value-chart'),d.valueAddedTop,'백만원','부가가치액');
  renderBarChart($('influence-chart'),d.influenceTop,'지수','영향력계수');
  renderBarChart($('multiplier-chart'),d.multiplierTop,'배','생산유발계수(열합)');
}
async function load(buffer){
  invalidate();basket=[];renderBasket();
  for(const id of ['sheet','row','sector','add','run','row-search','col-search','sector-search','amount','hm-sector','hm-search','hm-topn','hm-draw'])$(id).disabled=true;
  for(const p of requests.values())p.reject(Error('자료를 다시 불러옵니다.'));
  requests.clear();if(!worker)startWorker();
  try{
    const info=await call('init',buffer);
    sectors=info.sectors;options($('sector'),sectors);options($('hm-sector'),sectors);
    $('sector-search').value='';$('row-search').value='';$('col-search').value='';$('hm-search').value='';
    $('sheet').replaceChildren(...info.sheets.map(s=>{const o=text('option',s);o.value=s;return o;}));
    $('validation').textContent=JSON.stringify(info.residuals,null,2)+`\n산업분류: ${info.classification} · ${info.sectorCount}개 산업\n최대 절대 잔차: 허용값 1e-8 미만`;
    for(const id of ['sheet','row','sector','add','run','row-search','col-search','sector-search','amount','hm-sector','hm-search','hm-topn','hm-draw'])$(id).disabled=false;
    await explore();
    renderDashboard(await call('dashboard',{}));
    $('status').textContent=`준비 완료 · ${info.classification} · ${info.sectorCount}개 산업 · ${info.sheets.length}개 시트 · 계수 검증 통과`;
    $('active-classification').textContent=info.classification;
    $('active-file').textContent=CLASS_LABELS[$('classification').value]+' 자료';
  }catch(e){$('status').textContent='준비 실패: '+e.message+' — 자료 파일과 연결 상태를 확인하세요.';}
}
async function loadClassification(){
  const key=$('classification').value;
  $('load-basic').disabled=true;$('load-basic').textContent='자료 불러오는 중…';
  try{
    $('status').textContent=CLASS_LABELS[key]+' 산업연관표 다운로드 중…';
    const response=await fetch(FILES[key]);
    if(!response.ok)throw Error('엑셀 파일을 불러오지 못했습니다 (HTTP '+response.status+').');
    await load(await response.arrayBuffer());
    $('load-basic').textContent='자료 다시 불러오기';
  }catch(e){$('status').textContent='자료 준비 실패: '+e.message;$('load-basic').textContent='다시 불러오기';}
  finally{$('load-basic').disabled=false;}
}
let exploreSeq=0;
async function explore(){
  const seq=++exploreSeq;
  try{
    const d=await call('explore',{sheet:$('sheet').value,row:$('row').value});
    if(seq!==exploreSeq)return;
    rowChoices=d.rows;filterRows(d.selected);cells=d.cells;
    $('unit').textContent='자료 단위: '+d.unit;
    $('explore-caption').textContent=$('sheet').value+' / 행: '+d.selected+' '+d.name;
    renderCells();
  }catch(e){$('status').textContent=e.message;}
}
function filterRows(selected){
  const q=$('row-search').value.trim().toLowerCase();
  options($('row'),rowChoices.filter(r=>(r.code+' '+r.name).toLowerCase().includes(q)));
  if([...$('row').options].some(o=>o.value===selected))$('row').value=selected;
}
function renderCells(){
  const q=$('col-search').value.trim().toLowerCase();
  $('cells').replaceChildren(...cells.filter(c=>(c.code+' '+c.name).toLowerCase().includes(q)).map(c=>{
    const tr=document.createElement('tr');
    for(const v of [c.code,c.name,c.value===null?'빈 셀':typeof c.value==='number'?fmt(c.value):c.value])tr.append(text('td',v));
    return tr;
  }));
}
$('classification').onchange=loadClassification;
$('load-basic').onclick=loadClassification;
$('sheet').onchange=()=>{$('row-search').value='';$('row').replaceChildren();explore();};
$('row').onchange=explore;
$('row-search').oninput=()=>{filterRows();if($('row').value)explore();else{$('cells').replaceChildren();$('explore-caption').textContent='일치하는 행이 없습니다.';}};
$('col-search').oninput=renderCells;
$('sector-search').oninput=()=>{const q=$('sector-search').value.trim().toLowerCase();options($('sector'),sectors.filter(s=>(s.code+' '+s.name).toLowerCase().includes(q)));};
function renderBasket(){
  $('basket').replaceChildren(...basket.map((s,i)=>{
    const li=text('li',s.code+' '+s.name+' / '+fmt(s.amount)+'백만원 ');
    const b=text('button','삭제');b.type='button';b.className='button-quiet';b.onclick=()=>{basket.splice(i,1);invalidate();renderBasket();};
    li.append(b);return li;
  }));
  $('sim-status').textContent=basket.length?basket.length+'개 산업의 수요 증가가 입력되었습니다.':'시나리오를 추가하세요.';
}
$('scenario').onsubmit=e=>{
  e.preventDefault();
  const amount=Number($('amount').value),s=sectors.find(s=>s.code===$('sector').value);
  if(!s||!Number.isFinite(amount)||amount<=0){$('sim-status').textContent='산업과 양의 증가액을 확인하세요.';return;}
  basket.push({...s,amount});invalidate();renderBasket();
};
$('clear').onclick=()=>{basket=[];invalidate();renderBasket();};
$('run').onclick=async()=>{
  if(!basket.length){$('sim-status').textContent='시나리오를 먼저 추가하세요.';return;}
  const snapshot=basket.map(s=>({...s}));$('run').disabled=true;$('sim-status').textContent='계산 중…';
  try{
    const r=await call('simulate',snapshot);
    if(JSON.stringify(snapshot)!==JSON.stringify(basket)){$('sim-status').textContent='입력이 변경되었습니다. 다시 계산하세요.';return;}
    result=r;renderResult();$('sim-status').textContent='계산 완료. 아래 결과는 현재 시나리오에 대응합니다.';
  }catch(e){invalidate();$('sim-status').textContent='계산 실패: '+e.message;}
  finally{$('run').disabled=false;}
};
function renderResult(){
  $('results').hidden=false;
  $('cards').replaceChildren(...[['수요 증가액',result.demand],['생산유발액',result.production],['수입유발액',result.imports],['부가가치유발액',result.valueAdded]].map(([title,v])=>{
    const d=text('div',title);d.className='metric-card';d.append(text('strong',fmt(v)),text('span','백만원'));return d;
  }));
  renderBarChart($('bars'),result.rows.slice(0,15).map(r=>({code:r.code,name:r.name,value:r.production})),'백만원');
  $('result-rows').replaceChildren(...result.rows.map(r=>{
    const tr=document.createElement('tr');
    [r.code,r.name,fmt(r.production),fmt(r.imports),fmt(r.valueAdded)].forEach(v=>tr.append(text('td',v)));
    return tr;
  }));
}
function csvCell(v){let s=String(v);if(/^[=+@-]/.test(s)&&typeof v!=='number')s="'"+s;return '"'+s.replaceAll('"','""')+'"';}
$('download').onclick=()=>{
  if(!result)return;
  const rows=[['산업코드','산업명','생산유발액_백만원','수입유발액_백만원','부가가치유발액_백만원'],...result.rows.map(r=>[r.code,r.name,r.production,r.imports,r.valueAdded])];
  const url=URL.createObjectURL(new Blob(['\ufeff'+rows.map(r=>r.map(csvCell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}));
  const a=document.createElement('a');a.href=url;a.download='io-2023-results.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
};
$('hm-search').oninput=()=>{const q=$('hm-search').value.trim().toLowerCase();options($('hm-sector'),sectors.filter(s=>(s.code+' '+s.name).toLowerCase().includes(q)));};
$('hm-draw').onclick=async()=>{
  const code=$('hm-sector').value;if(!code){$('status').textContent='산업을 먼저 검색해 선택하세요.';return;}
  const btn=$('hm-draw');btn.disabled=true;$('status').textContent='히트맵 계산 중…';
  try{const d=await call('matrix',{code,topn:Number($('hm-topn').value)});renderFocusMap($('heatmap'),d);$('status').textContent='히트맵 표시 완료 · '+d.name;}
  catch(e){$('status').textContent='히트맵 실패: '+String(e.message).split('\n').filter(Boolean).pop();}
  finally{btn.disabled=false;}
};
$('classification').value='basic';
