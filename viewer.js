
const ASSETS='assets/';
const MAP=ASSETS+'map.svg';
const STATIONS=ASSETS+'stations_by_line.json';
const VORGABEN_DIR=ASSETS+'vorgaben/';

let svg,viewBox,drag=false,start={x:0,y:0};
let vorgabe=null;

async function loadJSON(p){return (await fetch(p)).json()}

async function init(){
  document.getElementById('mapContainer').innerHTML=await (await fetch(MAP)).text();
  svg=document.querySelector('svg');
  viewBox=svg.viewBox.baseVal;

  setupZoomPan();
  setupVorgaben();
}

function setupZoomPan(){
  const c=document.getElementById('mapContainer');
  c.onmousedown=e=>{drag=true;start={x:e.clientX,y:e.clientY};c.style.cursor='grabbing'};
  window.onmouseup=()=>{drag=false;c.style.cursor='grab'};
  window.onmousemove=e=>{
    if(!drag)return;
    const dx=(start.x-e.clientX)*(viewBox.width/c.clientWidth);
    const dy=(start.y-e.clientY)*(viewBox.height/c.clientHeight);
    viewBox.x+=dx;viewBox.y+=dy;start={x:e.clientX,y:e.clientY};
  };
  c.onwheel=e=>{
    e.preventDefault();
    const factor=e.deltaY>0?1.1:0.9;
    viewBox.width*=factor;viewBox.height*=factor;
  };
}

async function setupVorgaben(){
  const select=document.getElementById('vorgabeSelect');
  // statisch – GitHub Pages kompatibel
  const files=['Vorgabe_BLS_Basel.json'];
  select.innerHTML='<option value="">keine Vorgabe</option>';
  files.forEach(f=>select.innerHTML+=`<option value="${f}">${f.replace('Vorgabe_','').replace('.json','')}</option>`);
  select.onchange=async()=>{
    vorgabe=select.value?await loadJSON(VORGABEN_DIR+select.value):null;
    document.getElementById('vorgabeInfo').textContent=vorgabe?`Aktive Vorgabe: ${vorgabe.name}`:'';
    applyStatus();
  };
}

function stationLines(el){return(el.dataset.line||'').split(',').map(v=>v.trim()).filter(Boolean)}

function applyStatus(){
  svg.querySelectorAll('[id^="station_"]').forEach(el=>{
    el.classList.remove('kundig','auffrischung','vorgabe-fehlt');
    let isMissing=false;
    if(vorgabe){
      const lines=stationLines(el);
      if(lines.some(l=>vorgabe.linien?.includes(l)))isMissing=true;
    }
    if(isMissing)el.classList.add('vorgabe-fehlt');
    tooltip(el);
  })
}

function tooltip(el){
  el.onmouseenter=e=>{
    const t=document.createElement('div');t.className='tooltip';
    t.innerHTML=`<strong>${el.id}</strong><br>Status: ${el.classList.contains('vorgabe-fehlt')?'Vorgabe fehlt':'ok'}<br>${vorgabe? 'Vorgabe: '+vorgabe.name:''}`;
    document.body.appendChild(t);el._t=t;
  };
  el.onmousemove=e=>{if(el._t){el._t.style.left=e.pageX+10+'px';el._t.style.top=e.pageY+10+'px'}};
  el.onmouseleave=()=>{if(el._t){el._t.remove();el._t=null}};
}

init();
