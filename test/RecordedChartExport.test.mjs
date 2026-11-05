import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {JSDOM} from 'jsdom';

const source=fs.readFileSync(new URL('../apps-script/Reports.html',import.meta.url),'utf8').replace(/<\/?script>/g,'');

test('exports a completed selected round using its in-memory samples and native units',async()=>{
  const dom=new JSDOM('<details open><button id="export-live-charts-html"></button><button id="export-live-charts-csv"></button></details>',{runScripts:'outside-only'});
  const w=dom.window,files=[];
  try{
    w.__ST_TEXT__=key=>key;
    w.Blob=Blob;
    w.URL.createObjectURL=blob=>{files.push({blob});return 'blob:test';};
    w.URL.revokeObjectURL=()=>{};
    w.HTMLAnchorElement.prototype.click=function(){files.at(-1).name=this.download;};
    w.eval(source);
    const result={
      unitOfFlow:'bottles',durationSeconds:120,seed:42,
      detailCoverage:{recordingMode:'BOUNDED',effectiveSampleSeconds:60},
      equipmentMetrics:{pack:{unitOfFlow:'cases'}},
      samples:[0,60,120].map(time=>({
        virtualSecond:time,outputCount:time*5,
        equipment:[{id:'pack',outputCount:time/3,meanRatePerSecond:0.4,actualRatePerSecond:0.5,minRatePerSecond:0.25,maxRatePerSecond:0.5,availabilityState:'RUNNING'}]
      }))
    };
    const simulation={name:'=SUM(1,1)',equipment:[{id:'pack',name:'Packer <A>',unitOfFlow:'bottles'}]};
    const before=JSON.stringify({result,simulation});
    const htmlButton=w.document.getElementById('export-live-charts-html');
    const csvButton=w.document.getElementById('export-live-charts-csv');
    w.STReports.bindChartExports({...result,provisional:true},{},simulation,2);
    assert.equal(htmlButton.disabled,true);
    w.STReports.bindChartExports({...result,detailCoverage:{recordingMode:'SUMMARY'}},{},simulation,2);
    assert.equal(csvButton.disabled,true);
    w.STReports.bindChartExports(result,{},simulation,2);
    htmlButton.click();csvButton.click();
    const html=await files[0].blob.text(),csv=await files[1].blob.text();
    assert.equal(files[0].name,'simulation-charts-round-2.html');
    assert.equal(files[1].name,'simulation-charts-round-2.csv');
    assert.equal((html.match(/<svg /g)||[]).length,2);
    assert.match(html,/Packer &lt;A&gt;/);
    assert.match(html,/cases\/min/);
    assert.match(html,/Ronda 2 · Semilla 42 · 3 muestras/);
    assert.equal(csv.trimEnd().split('\r\n').length,7);
    assert(csv.includes('"pack","Packer <A>",120,,"cases",40,24,15,30,"RUNNING"'));
    assert(csv.includes('"linea","","Producción acumulada de la línea",120,,"bottles",600'));
    assert(csv.includes('"\'=SUM(1,1)"'));
    assert.equal(JSON.stringify({result,simulation}),before);
  }finally{w.close();}
});
