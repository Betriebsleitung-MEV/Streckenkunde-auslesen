const $ = s=>document.querySelector(s);
let svgEl=null, jsonData=null;

$('#svgFile').addEventListener('change', async e=>{
  const t=await e.target.files[0].text();
  const doc=new DOMParser().parseFromString(t,'image/svg+xml');
  svgEl=doc.querySelector('svg');
  $('#svgHost').innerHTML='';
  $('#svgHost').appendChild(svgEl);
  if(jsonData) apply();
});

$('#jsonFile').addEventListener('change', async e=>{
  jsonData=JSON.parse(await e.target.files[0].text());
  if(svgEl) apply();
});

function apply(){
  const linien=jsonData.linien||{};
  for(const [l,v] of Object.entries(linien)){
    const el=svgEl.getElementById('line-'+l);
    if(!el) continue;
    el.style.stroke = v.kundig?'#1976d2':v.auffrischung?'#d32f2f':'';
  }
}
