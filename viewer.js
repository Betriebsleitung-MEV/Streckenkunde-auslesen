
// GitHub Viewer v3.6a – Stations-first & Ortskunde aus Vorgabe+SVG (Tanklager)
// Änderungen:
// - Vorgabe-Check NUR über stationen[] (keine Linien mehr)
// - Robust: data-line1..N, unoccupied_station_*, Zoom um Cursor, Loader-Guards
// - Ortskunde rechts: zusätzlich Tanklager, deren Label in vorgabe.stationen[] steht

const ASSETS = 'assets/';
const MAP = ASSETS + 'map.svg';
const VORGABEN_DIR = ASSETS + 'vorgaben/';

let svg, viewBox, dragging = false, start = {x:0,y:0};
let vorgabe = null, streckenkunde = null;
let vorgabeStationSet = new Set(); // normalisierte Stationsnamen aus der Vorgabe
let initialViewBox = null;
let streckenkundeFileBase = '';
let vorgabeKey = '';
let viewBoxBeforePrint = null;

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
    initialViewBox = {x:viewBox.x, y:viewBox.y, width:viewBox.width, height:viewBox.height};
    setupZoomPan();
    setupVorgaben();
    setupStreckenkunde();
    setupTitle();
    setupPrintHandling();
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

function resetView(){
  if(!viewBox || !initialViewBox) return;
  viewBox.x = initialViewBox.x;
  viewBox.y = initialViewBox.y;
  viewBox.width = initialViewBox.width;
  viewBox.height = initialViewBox.height;
}

function doPrint(){
  // Druckt immer die Gesamtkarte (aktueller Ausschnitt wird danach wiederhergestellt)
  if(!viewBox || !initialViewBox){ window.print(); return; }
  viewBoxBeforePrint = {x:viewBox.x, y:viewBox.y, width:viewBox.width, height:viewBox.height};
  resetView();
  setTimeout(()=>window.print(), 0);
}

function setupPrintHandling(){
  window.resetView = resetView;
  window.doPrint = doPrint;
  window.addEventListener('beforeprint', ()=>{
    if(!viewBox || !initialViewBox) return;
    if(!viewBoxBeforePrint){
      viewBoxBeforePrint = {x:viewBox.x, y:viewBox.y, width:viewBox.width, height:viewBox.height};
    }
    resetView();
  });
  window.addEventListener('afterprint', ()=>{
    if(!viewBox || !viewBoxBeforePrint) return;
    viewBox.x = viewBoxBeforePrint.x;
    viewBox.y = viewBoxBeforePrint.y;
    viewBox.width = viewBoxBeforePrint.width;
    viewBox.height = viewBoxBeforePrint.height;
    viewBoxBeforePrint = null;
  });
}


function normName(s){
  return String(s||'')
    .toLowerCase()
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .replace(/\s*\/\s*/g, ' / ')
    .replace(/\s*-\s*/g, '-')
    .trim();
}

function buildVorgabeStationSet(v){
  const set = new Set();
  const arr = Array.isArray(v?.stationen) ? v.stationen : [];
  arr.forEach(n=>{ const k=normName(n); if(k) set.add(k); });
  return set;
}

function setupVorgaben(){
  const sel = document.getElementById('vorgabeSelect');
  const files = ['Vorgabe_BLS_Basel.json'];
  sel.innerHTML = '<option value="">keine Vorgabe</option>';
  files.forEach(f=> sel.innerHTML += `<option value="${f}">${f.replace('Vorgabe_','').replace('.json','')}</option>`);
  sel.onchange = async ()=>{
    try{
      vorgabe = sel.value ? await loadJSON(VORGABEN_DIR + sel.value) : null;
      vorgabeKey = sel.value ? sel.value.replace(/^Vorgabe_/, '').replace(/\.json$/i,'') : '';
      vorgabeStationSet = buildVorgabeStationSet(vorgabe);
      const info = document.getElementById('vorgabeInfo'); if(info) info.textContent = vorgabe ? `Aktive Vorgabe: ${vorgabe.name}` : '';
      updateTitle();
      applyStatus();
      renderOrtskunde();
    }catch(e){ alert('Vorgabe konnte nicht geladen werden: '+e.message); }
  };
}

function setupStreckenkunde(){
  const inp = document.getElementById('streckenkundeInput'); if(!inp) return;
  inp.onchange = (e)=>{
    const f = e.target.files && e.target.files[0]; if(!f) return;
    streckenkundeFileBase = String(f.name||'').replace(/\.[^.]+$/,'');
    const fi = document.getElementById('fileInfo');
    if(fi) fi.textContent = streckenkundeFileBase ? ('Datei: ' + streckenkundeFileBase) : '';
    const r = new FileReader();
    r.onload = ()=>{
      try{ streckenkunde = JSON.parse(String(r.result||'')); updateTitle(); applyStatus(); renderOrtskunde(); }
      catch(err){ alert('Fehler beim Einlesen der JSON: '+err.message); }
    };
    r.onerror = ()=> alert('Datei konnte nicht gelesen werden');
    r.readAsText(f, 'utf-8');
  };
}

function setupTitle(){
  const sel = document.getElementById('titleSelect');
  const out = document.getElementById('pdfTitle');

  function vorgabeSuffix(){
    if(!vorgabe) return '';
    const key = String(vorgabeKey || vorgabe.name || '').trim();
    // Wunsch: bei BLS-Auswahl als fixer Zusatz "Vorgabe BLS Abgleich"
    const tag = /BLS/i.test(key) ? 'BLS' : (key || '');
    return tag ? ` – Vorgabe ${tag} Abgleich` : ' – Vorgabe Abgleich';
  }

  function update(){
    const base = sel ? String(sel.value||'') : '';
    const suffix = vorgabeSuffix();

    // sichtbarer Titel (im PDF)
    if(out){
      if(!base){
        out.textContent = '';
      }else{
        const mid = streckenkundeFileBase ? streckenkundeFileBase : '';
        out.textContent = mid ? `${base}: ${mid}${suffix}` : `${base}${suffix}`;
      }
    }

    // Dateiname-Vorschlag beim „Drucken als PDF“ (Browser übernimmt oft document.title)
    const docBase = streckenkundeFileBase || base || 'Streckenkunde';
    document.title = `${docBase}${suffix}`.trim();
  }

  if(sel) sel.addEventListener('change', update);
  window.updateTitle = update; // für Alt-Code kompatibel
  update();
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
    const lines = stationLines(el); // (für Anzeige nicht mehr genutzt, nur Info)

    // Overrides zuerst
    const ov = normalizeOverride(overrides[el.id]);
    if(ov){ status = ov; }
    else if(streckenkunde && lines.length){
      lines.forEach(l=>{
        const s = streckenkunde.linien?.[l]; if(!s) return;
        if(s.auffrischung) status = 'auffrischung';
        else if(s.kundig && status!=='auffrischung') status = 'kundig';
      });
    }

    // Vorgabe-Abgleich: NUR über stationen[] (Linien sind irrelevant)
    if(vorgabeStationSet.size > 0 && status !== 'kundig'){
      const label = el.getAttribute('inkscape:label') || el.id;
      if(vorgabeStationSet.has(normName(label))) status = 'vorgabe-fehlt';
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

function isTanklagerNode(el){
  if(!el || !el.getAttribute) return false;
  const byAttr = el.hasAttribute('Tanklager') || el.hasAttribute('tanklager');
  const byTyp  = (String(el.getAttribute('data-typ')||'').toLowerCase()==='tanklager');
  return byAttr || byTyp;
}

function allTanklagerLabels(){
  const out = new Set(); if(!svg) return out;
  const nodes = svg.querySelectorAll('[Tanklager], [tanklager]');
  nodes.forEach(el=>{ const lab = el.getAttribute('inkscape:label') || el.getAttribute('data-name') || el.id; if(lab) out.add(lab); });
  return out;
}

function renderOrtskunde(){
  const list = document.getElementById('ortskundeList'); if(!list) return; list.innerHTML='';
  const o = streckenkunde?.ortskunde || {};

  // Basis: aus JSON
  const items = new Map(); // name -> {kind:'json'|'vorgabe', kundig:bool|null, linien:[]}
  Object.entries(o).forEach(([name,data])=>{
    items.set(name, {kind:'json', kundig: !!data.kundig, linien: Array.isArray(data.linien)?data.linien:[]});
  });

  // Zusatz: alle Tanklager aus SVG, deren Label in vorgabe.stationen[] steht
  if(vorgabeStationSet.size>0 && svg){
    const tl = allTanklagerLabels();
    tl.forEach(label=>{
      if(vorgabeStationSet.has(normName(label))){
        if(!items.has(label)) items.set(label, {kind:'vorgabe', kundig: null, linien: []});
      }
    });
  }

  // Render
  const sorted = Array.from(items.keys()).sort((a,b)=>String(a).localeCompare(String(b),'de'));
  sorted.forEach(name=>{
    const it = items.get(name);
    let badgeClass='badge-unkundig', badgeText='unkundig';
    if(it.kundig===true){ badgeClass='badge-kundig'; badgeText='kundig'; }
    if(it.kind==='vorgabe' && it.kundig===null){ badgeClass='badge-vorgabe'; badgeText='Vorgabe'; }
    const div=document.createElement('div'); div.className='ortskunde-card';
    div.innerHTML = `<span class="ortskunde-badge ${badgeClass}">${badgeText}</span>
      <div class="ortskunde-title">${name}</div>
      <div class="ortskunde-lines">${it.linien && it.linien.length?('Linien: '+it.linien.join(', ')):' '}</div>`;
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
