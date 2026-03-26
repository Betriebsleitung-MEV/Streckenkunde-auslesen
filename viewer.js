
// Drop-in viewer.js (v3.6) – kompatibel zu deinem GitHub-Viewer
// Minimal-invasive Fixes: robustes Laden, data-line1..N, unoccupied_station_ einbeziehen,
// Zoom um Mauszeiger, Title-Guards, Overrides normalisieren.

const ASSETS = 'assets/';
const MAP = ASSETS + 'map.svg';
const VORGABEN_DIR = ASSETS + 'vorgaben/';

let svg, viewBox, dragging = false, start = {x:0,y:0};
let vorgabe = null, streckenkunde = null;

async function loadJSON(p){ const r = await fetch(p, {cache:'no-store'}); if(!r.ok) throw new Error(p+' HTTP '+r.status); return r.json(); }
async function loadText(p){ const r = await fetch(p, {cache:'no-store'}); if(!r.ok) throw new Error(p+' HTTP '+r.status); return r.text(); }

async function init(){
  try{
    const host = document.getElementById('mapContainer');
    host.insertAdjacentHTML('beforeend', await loadText(MAP));
    svg = host.querySelector('svg');
    if(!svg){ console.error('Keine SVG gefunden'); return; }
    svg.setAttribute('preserveAspectRatio','xMidYMid meet');
    viewBox = svg.viewBox.baseVal;
    setupZoomPan();
    setupVorgaben();
    setupStreckenkunde();
    setupTitle();
  }catch(e){ console.error(e); alert('SVG konnte nicht geladen werden: '+e.message); }
}

function setupZoomPan(){
  const c = document.getElementById('mapContainer');
  c.addEventListener('mousedown', (e)=>{ if(e.button!==0) return; dragging=true; start={x:e.clientX,y:e.clientY}; });
  window.addEventListener('mouseup', ()=>dragging=false);
  window.addEventListener('mousemove', (e)=>{
    if(!dragging || !viewBox) return;
    const dx=(start.x-e.clientX)*(viewBox.width/c.clientWidth);
    const dy=(start.y-e.clientY)*(viewBox.height/c.clientHeight);
    viewBox.x += dx; viewBox.y += dy; start={x:e.clientX,y:e.clientY};
  }, {passive:true});
  c.addEventListener('wheel', (e)=>{
    e.preventDefault(); if(!viewBox) return;
    const scale = (e.deltaY<0) ? 0.9 : 1.1;
    const rect = c.getBoundingClientRect();
    const mx = (e.clientX - rect.left) / rect.width;  // 0..1
    const my = (e.clientY - rect.top)  / rect.height; // 0..1
    const nx = viewBox.x + mx*viewBox.width;
    const ny = viewBox.y + my*viewBox.height;
    const nw = viewBox.width * scale; const nh = viewBox.height * scale;
    viewBox.x = nx - mx*nw; viewBox.y = ny - my*nh; viewBox.width = nw; viewBox.height = nh;
  }, {passive:false});
}

function setupVorgaben(){
  const sel = document.getElementById('vorgabeSelect');
  const files = ['Vorgabe_BLS_Basel.json'];
  sel.innerHTML = '<option value="">keine Vorgabe</option>';
  files.forEach(f=> sel.innerHTML += `<option value="${f}">${f.replace('Vorgabe_','').replace('.json','')}</option>`);
  sel.onchange = async ()=>{
    try{
      vorgabe = sel.value ? await loadJSON(VORGABEN_DIR + sel.value) : null;
      const info = document.getElementById('vorgabeInfo'); if(info) info.textContent = vorgabe ? `Aktive Vorgabe: ${vorgabe.name}` : '';
      updateTitle();
      applyStatus();
    }catch(e){ alert('Vorgabe konnte nicht geladen werden: '+e.message); }
  };
}

function setupStreckenkunde(){
  const inp = document.getElementById('streckenkundeInput'); if(!inp) return;
  inp.onchange = (e)=>{
    const f = e.target.files && e.target.files[0]; if(!f) return;
    const r = new FileReader();
    r.onload = ()=>{
      try{ streckenkunde = JSON.parse(String(r.result||'')); applyStatus(); renderOrtskunde(); }
      catch(err){ alert('Fehler beim Einlesen der JSON: '+err.message); }
    };
    r.onerror = ()=> alert('Datei konnte nicht gelesen werden');
    r.readAsText(f, 'utf-8');
  };
}

function setupTitle(){
  const sel = document.getElementById('titleSelect');
  const out = document.getElementById('pdfTitle');
  function update(){
    const base = sel ? sel.value : '';
    if(!out) return;
    if(!base){ out.textContent=''; return; }
    out.textContent = (vorgabe && vorgabe.name) ? `${base}: ${vorgabe.name}` : base;
  }
  if(sel) sel.addEventListener('change', update);
  // Exponiere für Alt-Code, falls irgendwo direkt aufgerufen wird
  window.updateTitle = update;
}

// ==== Helpers ====
function getAllDataLines(el){
  try{
    const names = el.getAttributeNames ? el.getAttributeNames() : [];
    const vals = names.filter(a=>a.startsWith('data-line')).map(a=> String(el.getAttribute(a)||'').replace(/\D+/g,'')).filter(Boolean);
    return Array.from(new Set(vals));
  }catch(e){ return []; }
}
function stationLines(el){ return getAllDataLines(el); }

function normalizeOverride(v){ if(v===true) return 'kundig'; if(v===false) return 'unkundig'; const s=String(v||'').toLowerCase(); return (s==='kundig'||s==='auffrischung'||s==='unkundig')?s:null; }

function applyStatus(){
  if(!svg) return;
  const ortskunde = streckenkunde?.ortskunde || {};
  const overrides = streckenkunde?.overrides || {};

  const nodes = svg.querySelectorAll('[id^="station_"],[id^="unoccupied_station_"]');
  nodes.forEach(el=>{
    el.classList.remove('kundig','auffrischung','vorgabe-fehlt','unkundig','ortskunde-kundig');
    let status = 'unkundig';
    const lines = stationLines(el);

    // Overrides zuerst
    const ov = normalizeOverride(overrides[el.id]);
    if(ov){ status = ov; }
    else if(streckenkunde && lines.length){
      // Linien-Status aus JSON
      lines.forEach(l=>{
        const s = streckenkunde.linien?.[l]; if(!s) return;
        if(s.auffrischung) status = 'auffrischung';
        else if(s.kundig && status!=='auffrischung') status = 'kundig';
      });
    }

    // Vorgabe-Abgleich: nur wenn nicht kundig
    if(vorgabe && status!=='kundig' && Array.isArray(vorgabe.linien)){
      if(lines.some(l => vorgabe.linien.includes(l))) status = 'vorgabe-fehlt';
    }

    el.classList.add(status);

    const label = el.getAttribute('inkscape:label');
    if(label && ortskunde[label]?.kundig) el.classList.add('ortskunde-kundig');

    attachTooltip(el, status, label, ortskunde);
  });
}

function attachTooltip(el,status,label,ortskunde){
  el.onmouseenter = (e)=>{
    const t=document.createElement('div'); t.className='tooltip';
    let txt = `<strong>${label||el.id}</strong><br>Streckenkunde: ${status}`;
    if(label && ortskunde[label]) txt += `<br>Ortskunde: ${ortskunde[label].kundig?'kundig':'unkundig'}`;
    if(vorgabe && vorgabe.name) txt += `<br>Vorgabe: ${vorgabe.name}`;
    t.innerHTML = txt; document.body.appendChild(t); el._t = t;
  };
  el.onmousemove = (e)=>{ if(el._t){ el._t.style.left = (e.pageX+10)+'px'; el._t.style.top = (e.pageY+10)+'px'; } };
  el.onmouseleave = ()=>{ if(el._t){ el._t.remove(); el._t=null; } };
}

function renderOrtskunde(){
  const list = document.getElementById('ortskundeList'); if(!list) return; list.innerHTML='';
  const o = streckenkunde?.ortskunde || {};
  Object.entries(o).forEach(([name,data])=>{
    const div=document.createElement('div'); div.className='ortskunde-card';
    const badge = data.kundig ? 'badge-kundig' : 'badge-unkundig';
    const txt = data.kundig ? 'kundig' : 'unkundig';
    div.innerHTML = `<span class="ortskunde-badge ${badge}">${txt}</span>
      <div class="ortskunde-title">${name}</div>
      <div class="ortskunde-lines">Linien: ${(data.linien||[]).join(', ')}</div>`;
    list.appendChild(div);
  });
}

// Suche
const ortSearch = document.getElementById('ortskundeSearch');
if(ortSearch){ ortSearch.addEventListener('input', (e)=>{
  const q = String(e.target.value||'').toLowerCase();
  document.querySelectorAll('.ortskunde-card').forEach(c=>{ c.style.display = c.textContent.toLowerCase().includes(q) ? '' : 'none'; });
}); }

init();
