
(() => {
  'use strict';
  document.addEventListener('DOMContentLoaded', init);

  function init(){
    const els = mapEls(['jsonInput','svgInput','printBtn','onlyTL','linesList','stationsList','lineSearch','stationSearch','linesCount','stationsCount','meta','globalError']);

    // robust error overlay
    window.addEventListener('error', (e)=>{ if(!els.globalError) return; els.globalError.textContent = 'Fehler: ' + (e.message || e.error || e.filename || 'unbekannt'); els.globalError.style.display='block'; });

    const S = { json:null, svg:null, map:null, lineIndex:new Map(), tanklagerNames:new Set(), selectedLines:new Set(), selectedStations:new Set(), overridesAdd:new Set(), overridesRem:new Set(), expandedLines:new Set(), onlyTL:true };

    if(els.onlyTL){ S.onlyTL = !!els.onlyTL.checked; els.onlyTL.addEventListener('change', ()=>{ S.onlyTL=!!els.onlyTL.checked; rebuildSelections(); renderAll(); }); }
    if(els.printBtn) els.printBtn.addEventListener('click', ()=>window.print());
    if(els.jsonInput) els.jsonInput.addEventListener('change', onJsonFile);
    if(els.svgInput)  els.svgInput.addEventListener('change', onSvgFile);
    ;['change','input'].forEach(ev=>{ if(els.lineSearch) els.lineSearch.addEventListener(ev, renderLines); if(els.stationSearch) els.stationSearch.addEventListener(ev, renderStations); });

    if(els.linesList) els.linesList.addEventListener('click', (e)=>{
      const t=e.target;
      if(t.classList.contains('chev')){ const code=t.getAttribute('data-line'); if(S.expandedLines.has(code)) S.expandedLines.delete(code); else S.expandedLines.add(code); renderLines(); return; }
      if(t.classList.contains('selAll')){ const code=t.getAttribute('data-line'); getLineChildren(code).forEach(n=>S.selectedStations.add(n)); renderLines(); renderStations(); return; }
      if(t.classList.contains('selNone')){ const code=t.getAttribute('data-line'); getLineChildren(code).forEach(n=>S.selectedStations.delete(n)); renderLines(); renderStations(); return; }
      if(t.tagName==='INPUT' && t.type==='checkbox' && t.getAttribute('data-type')==='line'){ const code=t.getAttribute('data-code'); if(t.checked) S.selectedLines.add(code); else S.selectedLines.delete(code); rebuildSelections(); renderAll(); }
    });

    if(els.linesList) els.linesList.addEventListener('change', (e)=>{ const t=e.target; if(t.tagName==='INPUT' && t.type==='checkbox' && t.getAttribute('data-type')==='station'){ const name=decodeURIComponent(t.getAttribute('data-name')); if(t.checked) S.selectedStations.add(name); else S.selectedStations.delete(name); renderLines(); }});
    if(els.stationsList) els.stationsList.addEventListener('change',(e)=>{ const t=e.target; if(t.tagName==='INPUT' && t.type==='checkbox'){ const name=decodeURIComponent(t.getAttribute('data-name')); if(t.checked) S.selectedStations.add(name); else S.selectedStations.delete(name); renderStations(); }});

    async function onJsonFile(e){ const f=e.target.files && e.target.files[0]; if(!f) return; try{ const p=await readAsJson(f); S.json=p; buildFromJson(); renderAll(); }catch(err){ showErr('Fehler beim Einlesen der JSON: '+err.message); }}
    async function onSvgFile(e){ const f=e.target.files && e.target.files[0]; if(!f) return; try{ const text=await readAsText(f); S.svg=text; buildSvgMap(); renderAll(); }catch(err){ showErr('Fehler beim Einlesen der SVG: '+err.message); }}

    function mapEls(ids){ const m={}; ids.forEach(id=> m[id]=document.getElementById(id)); return m; }
    function showErr(msg){ if(els.globalError){ els.globalError.textContent=msg; els.globalError.style.display='block'; } }
    function hideErr(){ if(els.globalError){ els.globalError.style.display='none'; } }
    function readAsJson(f){ return new Promise((res,rej)=>{ const r=new FileReader(); r.onload=()=>{ try{ res(JSON.parse(String(r.result||''))); }catch(e){ rej(e);} }; r.onerror=rej; r.readAsText(f,'utf-8'); }); }
    function readAsText(f){ return new Promise((res,rej)=>{ const r=new FileReader(); r.onload=()=>res(String(r.result||'')); r.onerror=rej; r.readAsText(f,'utf-8'); }); }

    function isTanklagerNode(el){ if(!el||!el.getAttribute) return false; const byAttr = el.hasAttribute('Tanklager') || el.hasAttribute('tanklager'); const byTyp = (String(el.getAttribute('data-typ')||'').toLowerCase()==='tanklager'); return byAttr || byTyp; }
    function collectDataLinesFromAttrs(el){ const out=[]; try{ const names = el.getAttributeNames ? el.getAttributeNames() : []; for(const a of names){ if(!a.startsWith('data-line')) continue; const v=String(el.getAttribute(a)||'').replace(/\D+/g,''); if(v) out.push(v); }}catch(e){} return Array.from(new Set(out)).sort((a,b)=>Number(a)-Number(b)); }

    function buildSvgMap(){ hideErr(); if(!S.svg){ S.map=null; S.lineIndex=new Map(); S.tanklagerNames=new Set(); return; } const doc=new DOMParser().parseFromString(S.svg,'image/svg+xml'); const err=doc.querySelector('parsererror'); if(err){ showErr('SVG Parse-Fehler'); return; } const root=doc.querySelector('svg'); if(!root){ showErr('Keine SVG gefunden'); return; } const map={}; root.querySelectorAll('[id]').forEach(el=>{ const id=el.getAttribute('id'); if(!id) return; const info = map[id] = {}; info.label = el.getAttribute('inkscape:label') || el.getAttribute('data-name') || id; info.typ=(el.getAttribute('data-typ')||el.getAttribute('data-type')||'').toLowerCase(); info.lines=collectDataLinesFromAttrs(el); info.isTL=isTanklagerNode(el); }); S.map=map; S.lineIndex=new Map(); S.tanklagerNames=new Set(); Object.values(map).forEach(info=>{ if(info.isTL) S.tanklagerNames.add(info.label); if(Array.isArray(info.lines)) info.lines.forEach(code=>{ let set=S.lineIndex.get(code); if(!set){ set=new Set(); S.lineIndex.set(code,set);} set.add(info.label); }); }); rebuildSelections(); }

    function idToLabel(id){ if(S.map && S.map[id] && S.map[id].label) return S.map[id].label; return id; }
    function isValidOverrideKey(key){ if(!key) return false; if(key.startsWith('station_')||key.startsWith('unoccupied_station_')||key.startsWith('tanklager_')) return true; if(S.map && S.map[key]) return true; return false; }
    function normalizeOverrideValue(v){ if(v===true) return 'kundig'; if(v===false) return 'unkundig'; const s=String(v||'').toLowerCase(); return (s==='kundig'||s==='auffrischung'||s==='unkundig')?s:null; }

    function computeOverridesSets(){ S.overridesAdd=new Set(); S.overridesRem=new Set(); const ov=(S.json && S.json.overrides)||{}; Object.entries(ov).forEach(([k,v])=>{ if(!isValidOverrideKey(k)) return; const norm=normalizeOverrideValue(v); if(!norm) return; const name=idToLabel(k); if(norm==='unkundig') S.overridesRem.add(name); else S.overridesAdd.add(name); }); }

    function buildFromJson(){ hideErr(); if(!S.json){ S.selectedLines.clear(); S.selectedStations.clear(); return; } S.selectedLines=new Set(); const L=(S.json.linien)||{}; Object.entries(L).forEach(([code,info])=>{ if(info && info.kundig===true) S.selectedLines.add(code); }); computeOverridesSets(); rebuildSelections(); }

    function rebuildSelections(){ const base=new Set(); S.selectedLines.forEach(code=>{ const set=S.lineIndex.get(code)||new Set(); set.forEach(n=>{ if(!S.onlyTL || S.tanklagerNames.has(n)) base.add(n); }); }); S.overridesRem.forEach(n=>base.delete(n)); S.overridesAdd.forEach(n=>base.add(n)); S.selectedStations=base; }

    function renderAll(){ renderLines(); renderStations(); renderMeta(); }

    function getLineChildren(code){ const set=S.lineIndex.get(code)||new Set(); const arr=Array.from(set).filter(n=>!S.onlyTL || S.tanklagerNames.has(n)); return arr.sort((a,b)=>String(a).localeCompare(String(b),'de')); }
    function countOverridesFor(code){ const names=new Set(getLineChildren(code)); let add=0,rem=0; S.overridesAdd.forEach(n=>{ if(names.has(n)) add++; }); S.overridesRem.forEach(n=>{ if(names.has(n)) rem++; }); return {add,rem,total:names.size}; }

    function renderLines(){ const host=els.linesList; if(!host) return; host.innerHTML=''; const q=(els.lineSearch && els.lineSearch.value || '').trim(); const allLines=new Set(); if(S.json && S.json.linien) Object.keys(S.json.linien).forEach(k=>allLines.add(k)); if(S.lineIndex) S.lineIndex.forEach((_,k)=>allLines.add(k)); const arr=Array.from(allLines).sort((a,b)=>a.localeCompare(b)); let selCount=0; arr.forEach(code=>{ if(q && !code.includes(q)) return; const chosen=S.selectedLines.has(code); if(chosen) selCount++; const expanded=S.expandedLines.has(code); const counts=countOverridesFor(code); const item=document.createElement('div'); item.className='item'; item.innerHTML=`
      <div class="row">
        <div class="left">
          <span class="chev" data-act="toggle" data-line="${code}">${expanded?'▾':'▸'}</span>
          <input type="checkbox" ${chosen?'checked':''} data-type="line" data-code="${code}">
          <span class="code">${code}</span>
          <span class="muted">(${counts.total} sichtb. Punkte · OVR+: ${counts.add} / OVR−: ${counts.rem})</span>
        </div>
        <div class="right">${chosen?'<span class="badge b-blue"></span>':'<span class="badge b-yellow"></span>'}</div>
      </div>
      <div class="toolrow">
        <button class="mini selAll"  data-line="${code}">alle markieren</button>
        <button class="mini selNone" data-line="${code}">alle abwählen</button>
      </div>
      <div class="children" ${expanded?'':'style="display:none"'} data-children="${code}"></div>`; host.appendChild(item); if(expanded) renderLineChildren(code, item.querySelector('[data-children]')); }); if(els.linesCount) els.linesCount.textContent=`ausgewählt: ${selCount} / gesamt: ${arr.length}`; }

    function renderLineChildren(code, container){ container.innerHTML=''; const arr=getLineChildren(code); arr.forEach(name=>{ const chosen=S.selectedStations.has(name); const chips=`${S.overridesAdd.has(name)?'<span class="chip ovrp">OVR+</span>':''}${S.overridesRem.has(name)?'<span class="chip ovrm">OVR−</span>':''}`; const div=document.createElement('div'); div.className='child'; div.innerHTML=`
        <div class="left">
          <input type="checkbox" ${chosen?'checked':''} data-type="station" data-name="${encodeURIComponent(name)}">
          <span class="name">${name}</span>
          ${chips?`<span class="small">${chips}</span>`:''}
        </div>
        <div class="right">${chosen?'<span class="badge b-blue"></span>':'<span class="badge b-yellow"></span>'}</div>`; container.appendChild(div); }); if(!arr.length){ const p=document.createElement('div'); p.className='muted'; p.textContent = S.onlyTL ? 'Keine Tanklager zur Linie gefunden.' : 'Keine Punkte zur Linie gefunden.'; container.appendChild(p); } }

    function renderStations(){ const host=els.stationsList; if(!host) return; host.innerHTML=''; const names=Array.from(S.tanklagerNames).sort((a,b)=>String(a).localeCompare(String(b),'de')); const q=(els.stationSearch && els.stationSearch.value || '').trim().toLowerCase(); let sel=0; names.forEach(name=>{ if(q && String(name).toLowerCase().indexOf(q)===-1) return; const chosen=S.selectedStations.has(name); if(chosen) sel++; const chips=`${S.overridesAdd.has(name)?'<span class="chip ovrp">OVR+</span>':''}${S.overridesRem.has(name)?'<span class="chip ovrm">OVR−</span>':''}`; const div=document.createElement('div'); div.className='item'; div.innerHTML=`
        <div class="row">
          <div class="left">
            <input type="checkbox" ${chosen?'checked':''} data-name="${encodeURIComponent(name)}">
            <span class="name">${name}</span>
            ${chips?`<span class="small">${chips}</span>`:''}
          </div>
          <div class="right">${chosen?'<span class="badge b-blue"></span>':'<span class="badge b-yellow"></span>'}</div>
        </div>`; host.appendChild(div); }); if(els.stationsCount) els.stationsCount.textContent=`ausgewählt: ${sel} / gesamt: ${names.length}`; }

    function renderMeta(){ if(!els.meta) return; const meta={ person:(S.json&&S.json.person)||null, linien_kundig_true: S.json? Object.entries(S.json.linien||{}).filter(([c,i])=>i&&i.kundig===true).map(([c])=>c):[], overrides_count: S.json? Object.keys(S.json.overrides||{}).length:0, svg_loaded: !!S.svg, line_index_size: S.lineIndex.size, tanklager_total: S.tanklagerNames.size, only_tanklager: !!S.onlyTL }; els.meta.textContent=JSON.stringify(meta,null,2); }
  }
})();
