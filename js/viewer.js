const $ = s=>document.querySelector(s);
const statusEl = $('#status');
let svgEl=null, jsonData=null;
let viewBase=null, viewCur=null, panState=null;

function setStatus(m){ if(statusEl) statusEl.textContent = m; }

// --- Titel aus JSON setzen ---
function setDocTitleFromProfile(p){
  try{
    const name = `${p.person?.vorname||''} ${p.person?.nachname||''}`.trim();
    const date = p.person?.datum || (p.erzeugtAm? String(p.erzeugtAm).slice(0,10):'');
    const t = name ? `${name} – ${date}` : (date || 'Streckenkunde');
    if (t){ document.title = `Streckenkunde – ${t}`; $('#title').textContent = `Streckenkunde – ${t}`; }
  }catch(e){}
}

// --- ViewBox helpers ---
function getInitialViewBox(svg){
  const vb = svg.getAttribute('viewBox');
  if(vb){
    const p = vb.trim().split(/\s+/).map(Number);
    if(p.length===4 && p.every(n=>Number.isFinite(n))) return {x:p[0],y:p[1],w:p[2],h:p[3]};
  }
  const w = Number(svg.getAttribute('width'))||1000;
  const h = Number(svg.getAttribute('height'))||1000;
  return {x:0,y:0,w:w,h:h};
}
function setViewBox(vb){ if(!svgEl) return; svgEl.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`); viewCur = vb; }
function clientToSvgXY(cx,cy){ if(!svgEl) return {x:0,y:0}; const pt = svgEl.createSVGPoint(); pt.x=cx; pt.y=cy; const ctm = svgEl.getScreenCTM(); if(!ctm) return {x:0,y:0}; const sp = pt.matrixTransform(ctm.inverse()); return {x:sp.x,y:sp.y}; }

function wirePanZoom(){
  const cap = $('#pzCapture');
  if(!cap||!svgEl) return;
  // Wheel zoom
  cap.addEventListener('wheel', e=>{
    if(!viewCur||!viewBase) return; e.preventDefault();
    const factor = (e.deltaY>0?1.08:0.92);
    const nw = viewCur.w*factor; const nh = viewCur.h*factor;
    const minW = viewBase.w*0.02, maxW=viewBase.w*50; if(nw<minW||nw>maxW) return;
    const mid = clientToSvgXY(e.clientX, e.clientY);
    const nx = mid.x - (mid.x - viewCur.x) * (nw / viewCur.w);
    const ny = mid.y - (mid.y - viewCur.y) * (nh / viewCur.h);
    setViewBox({x:nx,y:ny,w:nw,h:nh});
  }, {passive:false});
  // Mouse pan
  cap.addEventListener('mousedown', e=>{
    if(e.button!==0) return; if(!viewCur) return; cap.classList.add('panning');
    panState = {x:e.clientX,y:e.clientY,vb:{...viewCur}};
    const onMove = ev=>{ if(!panState||!viewCur) return; ev.preventDefault(); const rect = cap.getBoundingClientRect(); const sx = panState.vb.w/rect.width; const sy = panState.vb.h/rect.height; const dx = ev.clientX - panState.x; const dy = ev.clientY - panState.y; setViewBox({x: panState.vb.x - dx*sx, y: panState.vb.y - dy*sy, w: panState.vb.w, h: panState.vb.h}); };
    const onUp = ()=>{ cap.classList.remove('panning'); panState=null; window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
    window.addEventListener('mousemove', onMove, {passive:false});
    window.addEventListener('mouseup', onUp, {passive:true});
  });
  // Buttons
  $('#btnFit').onclick = ()=>{ if(viewBase) setViewBox({...viewBase}); };
  $('#btnReset').onclick = ()=>{ if(viewBase) setViewBox({...viewBase}); };
}

// --- Färbelogik ---
function statusToColor(v){
  if (!v) return '';
  const kundig = getComputedStyle(document.documentElement).getPropertyValue('--kundig').trim()||'#1976d2';
  const auffr = getComputedStyle(document.documentElement).getPropertyValue('--auffr').trim()||'#d32f2f';
  if (v.kundig===true || v.status==='kundig') return kundig;
  if (v.auffrischung===true || v.status==='auffrischung') return auffr;
  return '';
}
function collectDataLines(el){ const out=[]; if(!el||!el.getAttributeNames) return out; for(const a of el.getAttributeNames()){ if(!a.startsWith('data-line')) continue; const v = String(el.getAttribute(a)||'').replace(/\D+/g,''); if(v && !out.includes(v)) out.push(v);} out.sort((a,b)=>Number(a)-Number(b)); return out; }

function apply(){
  if(!svgEl || !jsonData){ setStatus('Bitte JSON laden.'); return; }
  const linien = jsonData.linien || {}; const overrides = jsonData.overrides || {};

  // 1) Direkt per ID line-XXX
  for (const [l, v] of Object.entries(linien)){
    const el = svgEl.getElementById('line-'+l);
    if (!el) continue; const col = statusToColor(v); if (col){ el.style.stroke = col; el.style.fill = col; }
  }
  // 2) Fallback per data-line*
  const candidates = svgEl.querySelectorAll('[data-line], [data-line-1], [data-line-2], [data-line-3], [data-line-4], [data-line-5]');
  candidates.forEach(el=>{
    const lines = collectDataLines(el);
    let col='';
    for(const l of lines){ const v = linien[l]; const c = statusToColor(v); if(c){ col=c; if(v?.kundig||v?.status==='kundig') break; } }
    if(col){ el.style.stroke = col; el.style.fill = col; }
  });
  // 3) Overrides: id => status string (kundig/auffrischung/unkundig)
  for (const [id, st] of Object.entries(overrides)){
    const el = svgEl.getElementById(id); if(!el) continue;
    const v = {status:st, kundig: st==='kundig', auffrischung: st==='auffrischung'}; const col = statusToColor(v);
    if(col){ el.style.stroke = col; el.style.fill = col; }
  }
  setStatus('Markierungen angewendet.');
}

// --- Ortskunde: Liste rendern (alle, auch unkundig) ---
function renderOrtskunde(){
  const host = $('#tlList'); const cnt = $('#tlCount'); host.innerHTML='';
  const ok = jsonData && jsonData.ortskunde ? jsonData.ortskunde : {};
  let entries = Object.keys(ok).map(name=>({ name, kundig: !!(ok[name] && ok[name].kundig), linien: (ok[name] && Array.isArray(ok[name].linien)) ? ok[name].linien.slice() : [] }));
  const q = ($('#search').value||'').toLowerCase().trim();
  if(q){ entries = entries.filter(e=> e.name.toLowerCase().includes(q) || e.linien.join(',').includes(q.replace(/\D+/g,'')) ); }
  entries.sort((a,b)=> a.name.localeCompare(b.name,'de-CH'));
  cnt.textContent = `${entries.length} Einträge`;
  if(!entries.length){ host.innerHTML = "<div class='small'>Keine Einträge.</div>"; return; }
  for(const e of entries){
    const div = document.createElement('div'); div.className='item';
    const badge = e.kundig ? "<span class='badge k'>kundig</span>" : "<span class='badge n'>unkundig</span>";
    div.innerHTML = `<div class='desc'><b>${e.name}</b><div class='small'>Linien: ${e.linien.join(', ')||'—'}</div></div>${badge}`;
    host.appendChild(div);
  }
}

// --- Bootstrapping ---
$('#svgObj').addEventListener('load', () => {
  const doc = $('#svgObj').contentDocument; svgEl = doc && doc.querySelector('svg');
  if(!svgEl){ setStatus('SVG konnte nicht geladen werden.'); return; }
  viewBase = getInitialViewBox(svgEl); setViewBox({...viewBase}); wirePanZoom();
  if (jsonData) apply();
});

$('#jsonFile').addEventListener('change', async e => {
  try{ jsonData = JSON.parse(await e.target.files[0].text()); setDocTitleFromProfile(jsonData); apply(); renderOrtskunde(); setStatus('JSON geladen.'); }
  catch(err){ alert('Fehler im JSON: '+err.message); }
});

$('#search').addEventListener('input', ()=> renderOrtskunde());
