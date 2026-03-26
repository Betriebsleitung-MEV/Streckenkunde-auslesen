
const ASSETS='assets/';
const MAP=ASSETS+'map.svg';
const VORGABEN_DIR=ASSETS+'vorgaben/';

let svg, viewBox, drag=false, start={x:0,y:0};
let vorgabe=null, streckenkunde=null;

async function loadJSON(p){ return (await fetch(p)).json(); }

async function init(){
  document.getElementById('mapContainer').insertAdjacentHTML('beforeend', await (await fetch(MAP)).text());
  svg=document.querySelector('svg'); viewBox=svg.viewBox.baseVal;
  setupZoomPan(); setupVorgaben(); setupStreckenkunde(); setupTitle();
}

function setupZoomPan(){
  const c=document.getElementById('mapContainer');
  c.onmousedown=e=>{drag=true;start={x:e.clientX,y:e.clientY}};
  window.onmouseup=()=>drag=false;
  window.onmousemove=e=>{if(!drag)return;viewBox.x+=(start.x-e.clientX)*(viewBox.width/c.clientWidth);viewBox.y+=(start.y-e.clientY)*(viewBox.height/c.clientHeight);start={x:e.clientX,y:e.clientY};};
  c.onwheel=e=>{e.preventDefault();const s=e.deltaY<0?0.9:1.1;viewBox.width*=s;viewBox.height*=s;};
}

function setupVorgaben(){
  const sel=document.getElementById('vorgabeSelect');
  const files=['Vorgabe_BLS_Basel.json'];
  sel.innerHTML='<option value="">keine Vorgabe</option>';
  files.forEach(f=>sel.innerHTML+=`<option value="${f}">${f.replace('Vorgabe_','').replace('.json','')}</option>`);
  sel.onchange=async()=>{ vorgabe=sel.value?await loadJSON(VORGABEN_DIR+sel.value):null;
    document.getElementById('vorgabeInfo').textContent=vorgabe?`Aktive Vorgabe: ${vorgabe.name}`:'';
    updateTitle(); applyStatus(); };
}

function setupStreckenkunde(){
  document.getElementById('streckenkundeInput').onchange=e=>{
    const f=e.target.files[0]; if(!f) return;
    const r=new FileReader(); r.onload=()=>{ streckenkunde=JSON.parse(r.result); applyStatus(); }; r.readAsText(f);
  };
}

function setupTitle(){
  document.getElementById('titleSelect').onchange=updateTitle;
}

function updateTitle(){
  const base=document.getElementById('titleSelect').value;
  const el=document.getElementById('pdfTitle');
  if(!base){el.textContent='';return;}
  el.textContent=vorgabe?`${base}: ${vorgabe.name}`:base;
}

function stationLines(el){return(el.dataset.line||'').split(',').map(v=>v.trim()).filter(Boolean)}

function applyStatus(){
  svg.querySelectorAll('[id^="station_"]').forEach(el=>{
    el.classList.remove('kundig','auffrischung','vorgabe-fehlt','unkundig');
    let status='unkundig';
    const lines=stationLines(el);
    if(streckenkunde) lines.forEach(l=>{const s=streckenkunde.linien?.[l]; if(!s)return; if(s.auffrischung)status='auffrischung'; else if(s.kundig&&status!=='auffrischung')status='kundig';});
    if(vorgabe && status!=='kundig' && lines.some(l=>vorgabe.linien?.includes(l))) status='vorgabe-fehlt';
    el.classList.add(status);
  });
}

init();
