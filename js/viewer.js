const $ = s=>document.querySelector(s);
let svgEl=null, jsonData=null;

// Warten bis die eingebettete SVG geladen ist
$('#svgObj').addEventListener('load', () => {
  const doc = $('#svgObj').contentDocument;
  svgEl = doc && doc.querySelector('svg');
  if (svgEl && jsonData) apply();
});

// JSON laden
$('#jsonFile').addEventListener('change', async e => {
  jsonData = JSON.parse(await e.target.files[0].text());
  if (svgEl) apply();
});

function apply(){
  const linien = jsonData.linien || {};
  for (const [l, v] of Object.entries(linien)){
    const el = svgEl.getElementById('line-'+l);
    if (!el) continue;
    const col = v.kundig ? '#1976d2' : (v.auffrischung ? '#d32f2f' : '');
    if (col){ el.style.stroke = col; el.style.fill = col; }
  }
}
