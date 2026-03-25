
const $ = s => document.querySelector(s);
const statusEl = $('#status');
let svgEl=null, jsonData=null; 
let viewBase=null, viewCur=null, panState=null; 

function setStatus(m){ if(statusEl) statusEl.textContent = m; }
const norm = s => String(s||'').toLowerCase().replace(/\s+/g,' ').trim();

function showDebug(obj){
  try{ const box = $('#debug'); if(!box) return; box.hidden=false; box.textContent = JSON.stringify(obj, null, 2); }catch(e){}
}

function setDocTitleFromProfile(p){
  try{
    const name = `${p.person?.vorname||''} ${p.person?.nachname||''}`.trim();
    const date = p.person?.datum || (p.erzeugtAm? String(p.erzeugtAm).slice(0,10):'');
    const t = name ? `${name} – ${date}` : (date || 'Streckenkunde');
    if (t){ document.title = `Streckenkunde – ${t}`; $('#title').textContent = `Streckenkunde – ${t}`; }
  }catch(e){}
}

function getInitialViewBox(svg){
  const vb = svg.getAttribute('viewBox');
  if(vb){ const p = vb.trim().split(/\s+/).map(Number); if(p.length===4 && p.every(n=>Number.isFinite(n))) return {x:p[0],y:p[1],w:p[2],h:p[3]}; }
  const w = Number(svg.getAttribute('width'))||1000; const h = Number(svg.getAttribute('height'))||1000; return {x:0,y:0,w:w,h:h};
}
function setViewBox(vb){ if(!svgEl) return; svgEl.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`); viewCur = vb; }
function clientToSvgXY(cx,cy){ if(!svgEl) return {x:0,y:0}; const pt = svgEl.createSVGPoint(); pt.x=cx; pt.y=cy; const ctm = svgEl.getScreenCTM(); if(!ctm) return {x:0,y:0}; const sp = pt.matrixTransform(ctm.inverse()); return {x:sp.x,y:sp.y}; }
function wirePanZoom(){
  const cap = $('#pzCapture'); if(!cap||!svgEl) return;
  cap.addEventListener('wheel', e=>{ if(!viewCur||!viewBase) return; e.preventDefault(); const f=(e.deltaY>0?1.08:0.92); const nw=viewCur.w*f, nh=viewCur.h*f; const min=viewBase.w*0.02, max=viewBase.w*50; if(nw<min||nw>max) return; const mid=clientToSvgXY(e.clientX,e.clientY); const nx= mid.x - (mid.x-viewCur.x)*(nw/viewCur.w); const ny= mid.y - (mid.y-viewCur.y)*(nh/viewCur.h); setViewBox({x:nx,y:ny,w:nw,h:nh}); }, {passive:false});
  cap.addEventListener('mousedown', e=>{ if(e.button!==0||!viewCur) return; cap.classList.add('panning'); panState={x:e.clientX,y:e.clientY,vb:{...viewCur}}; const onMove=ev=>{ if(!panState||!viewCur) return; ev.preventDefault(); const rect=cap.getBoundingClientRect(); const sx=panState.vb.w/rect.width, sy=panState.vb.h/rect.height; const dx=ev.clientX-panState.x, dy=ev.clientY-panState.y; setViewBox({x:panState.vb.x-dx*sx,y:panState.vb.y-dy*sy,w:panState.vb.w,h:panState.vb.h}); }; const onUp=()=>{ cap.classList.remove('panning'); panState=null; window.removeEventListener('mousemove',onMove); window.removeEventListener('mouseup',onUp); }; window.addEventListener('mousemove',onMove,{passive:false}); window.addEventListener('mouseup',onUp,{passive:true}); });
  $('#btnFit').onclick = ()=>{ if(viewBase) setViewBox({...viewBase}); };
  $('#btnReset').onclick = ()=>{ if(viewBase) setViewBox({...viewBase}); };
}

function statusToColor(v){ if(!v) return ''; const kundig=getComputedStyle(document.documentElement).getPropertyValue('--kundig').trim()||'#16a34a'; const auffr=getComputedStyle(document.documentElement).getPropertyValue('--auffr').trim()||'#f59e0b'; if(v.kundig===true||v.status==='kundig') return kundig; if(v.auffrischung===true||v.status==='auffrischung') return auffr; return ''; }
function collectDataLines(el){ const out=[]; if(!el||!el.getAttributeNames) return out; for(const a of el.getAttributeNames()){ if(!a.startsWith('data-line')) continue; const v=String(el.getAttribute(a)||'').replace(/\D+/g,''); if(v && !out.includes(v)) out.push(v); } out.sort((a,b)=>Number(a)-Number(b)); return out; }
function apply(){
  if(!svgEl){ setStatus('Karte (SVG) nicht geladen.'); return; }
  if(!jsonData){ setStatus('Bitte JSON laden.'); return; }
  const linien = jsonData.linien || {}; const overrides = jsonData.overrides || {};
  for (const [l, v] of Object.entries(linien)){ const el = svgEl.getElementById('line-'+l); if (el){ const col=statusToColor(v); if(col){ el.style.stroke=col; el.style.fill=col; } } }
  const candidates = svgEl.querySelectorAll('[data-line], [data-line-1], [data-line-2], [data-line-3], [data-line-4], [data-line-5]');
  candidates.forEach(el=>{ const lines=collectDataLines(el); let col=''; for(const l of lines){ const v=linien[l]; const c=statusToColor(v); if(c){ col=c; if(v?.kundig||v?.status==='kundig') break; } } if(col){ el.style.stroke=col; el.style.fill=col; } });
  const segMap = jsonData.teilstrecken || {}; for (const arr of Object.values(segMap)){ for (const seg of arr){ if(!seg||!('seg' in seg)) continue; const segId='seg-'+ String(seg.seg).replace('.', '-'); const el=svgEl.getElementById(segId); if(!el) continue; if(seg.kundig){ const col=getComputedStyle(document.documentElement).getPropertyValue('--kundig').trim()||'#16a34a'; el.style.stroke=col; el.style.fill=col; } } }
  for (const [id, st] of Object.entries(overrides)){ const el = svgEl.getElementById(id); if(!el) continue; const v={status:st,kundig:st==='kundig',auffrischung:st==='auffrischung'}; const col=statusToColor(v); if(col){ el.style.stroke=col; el.style.fill=col; } }
  setStatus('Markierungen angewendet.');
}

// robust: finde ortskunde egal wo (ortskunde, Ortskunde, jsonData.data.ortskunde etc.)
function getOrtskundeObject(j){
  if(!j||typeof j!=='object') return {};
  if(j.ortskunde && typeof j.ortskunde==='object') return j.ortskunde;
  if(j.Ortskunde && typeof j.Ortskunde==='object') return j.Ortskunde;
  if(j.data && typeof j.data==='object') return getOrtskundeObject(j.data);
  return {};
}

// ---- Ortskunde besser anzeigen (führend: mitarbeiter.json → ortskunde) ----
function renderOrtskunde(){
  const host = $('#tlList'); const cnt = $('#tlCount'); const chips = $('#chips'); if(!host||!cnt) return; host.innerHTML=''; if(chips) chips.innerHTML='';
  const ok = getOrtskundeObject(jsonData);
  // Debug, falls leer
  if(!ok || !Object.keys(ok).length){
    $('#tlCount').textContent = '0 Einträge';
    host.innerHTML = "<div class='small'>Keine Einträge in <code>ortskunde</code> gefunden. Prüfe JSON-Struktur.</div>";
    showDebug({hinweis:'Erwartet: Wurzelebene → "ortskunde"', keys: Object.keys(jsonData||{})});
    return;
  }
  const statusFilter = $('#filterStatus')?.value || 'all';
  let entries = Object.keys(ok).map(name=>({
    name,
    kundig: !!(ok[name] && ok[name].kundig),
    linien: (ok[name] && Array.isArray(ok[name].linien)) ? ok[name].linien.slice() : []
  }));
  const q = ($('#search')?.value||'').toLowerCase().trim();
  if(q){ entries = entries.filter(e=> e.name.toLowerCase().includes(q) || e.linien.join(',').includes(q.replace(/\D+/g,'')) ); }
  if(statusFilter==='kundig') entries = entries.filter(e=>e.kundig);
  if(statusFilter==='unkundig') entries = entries.filter(e=>!e.kundig);
  const groups = new Map();
  const push = (key, e) => { if(!groups.has(key)) groups.set(key, []); groups.get(key).push(e); };
  for(const e of entries){ if(!e.linien || !e.linien.length){ push('—', e); continue; } for(const l of e.linien){ push(String(l), e); } }
  const keys = Array.from(groups.keys()).sort((a,b)=>{ if(a==='—'&&b==='—') return 0; if(a==='—') return 1; if(b==='—') return -1; return Number(a)-Number(b); });
  const total = entries.length; const kCount = entries.filter(e=>e.kundig).length; const uCount = total - kCount;
  if(chips) chips.innerHTML = `<span class=\"chip\">Gesamt: ${total}</span><span class=\"chip\">kundig: ${kCount}</span><span class=\"chip\">unkundig: ${uCount}</span>`;
  cnt.textContent = `${total} Einträge`;
  for(const k of keys){
    const arr = groups.get(k);
    arr.sort((a,b)=> (Number(b.kundig)-Number(a.kundig)) || a.name.localeCompare(b.name,'de-CH'));
    const box = document.createElement('div'); box.className='group';
    box.innerHTML = `<h3>Linie ${k} <span style=\"opacity:.7\">(${arr.length})</span></h3>`;
    for(const e of arr){
      const row = document.createElement('div'); row.className='item';
      const badge = e.kundig?"<span class='badge k'>kundig</span>":"<span class='badge n'>unkundig</span>";
      row.innerHTML = `<div class='name'>${e.name}</div><div class='pill'>${(e.linien&&e.linien.length)?e.linien.join(', '):'—'}</div>${badge}`;
      box.appendChild(row);
    }
    host.appendChild(box);
  }
  if(!keys.length){ host.innerHTML = "<div class='small'>Keine Einträge (Filter).</div>"; }
}

// --- Bootstrapping ---
const svgObj = $('#svgObj');
if(svgObj){
  svgObj.addEventListener('load', () => {
    const doc = svgObj.contentDocument; svgEl = doc && doc.querySelector('svg');
    if(!svgEl){ setStatus('SVG konnte nicht geladen werden. Prüfe Pfad assets/map.svg'); return; }
    viewBase = getInitialViewBox(svgEl); setViewBox({...viewBase}); wirePanZoom();
    if (jsonData) apply();
  });
  svgObj.addEventListener('error', () => { setStatus('SVG nicht gefunden – überprüfe assets/map.svg'); });
}

$('#jsonFile').addEventListener('change', async e => {
  try{
    const text = await e.target.files[0].text();
    // Entferne unsichtbare BOM/Steuerzeichen, die JSON stören könnten
    const clean = text.replace(/[\u0000-\u001F\uFEFF]/g, ch => (ch==='\n'||ch==='\r'||ch==='\t')?ch:'');
    jsonData = JSON.parse(clean);
    setDocTitleFromProfile(jsonData); apply(); renderOrtskunde(); setStatus('JSON geladen.');
  }
  catch(err){ alert('Fehler im JSON: '+err.message); showDebug({parseError: String(err)}); }
});
$('#search')?.addEventListener('input', ()=> renderOrtskunde());
$('#filterStatus')?.addEventListener('change', ()=> renderOrtskunde());
