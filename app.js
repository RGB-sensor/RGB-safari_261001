const $ = id => document.getElementById(id);
const video = $('video'), roi = $('roi'), stage = $('stage'), chart = $('chart');
const state = { stream:null, active:false, samples:[], animation:null, roi:{x:.345,y:.345,w:.31}, lastFrame:0, frameCount:0 };

function setStatus(text, live=false){ $('status').classList.toggle('live',live); $('status').querySelector('span').textContent=text; }
function clamp(v,min,max){ return Math.max(min,Math.min(max,v)); }
function updateRoi(){ roi.style.left=(state.roi.x*100)+'%'; roi.style.top=(state.roi.y*100)+'%'; roi.style.width=(state.roi.w*100)+'%'; }
function hueFromRGB(r,g,b){ r/=255;g/=255;b/=255; const max=Math.max(r,g,b),min=Math.min(r,g,b),d=max-min; if(!d)return 0; let h=max===r?(g-b)/d+(g<b?6:0):max===g?(b-r)/d+2:(r-g)/d+4; return h*60; }
function analyseFrame(now){
  if(!state.active || video.readyState<2){ state.animation=requestAnimationFrame(analyseFrame); return; }
  const w=video.videoWidth,h=video.videoHeight; if(!w||!h){ state.animation=requestAnimationFrame(analyseFrame); return; }
  const c=document.createElement('canvas'); c.width=160;c.height=160; const ctx=c.getContext('2d',{willReadFrequently:true});
  const sx=Math.round(state.roi.x*w),sy=Math.round(state.roi.y*h),sw=Math.max(2,Math.round(state.roi.w*w));
  ctx.drawImage(video,sx,sy,sw,sw,0,0,160,160); const d=ctx.getImageData(0,0,160,160).data;
  let r=0,g=0,b=0,n=0; for(let i=0;i<d.length;i+=16){ r+=d[i];g+=d[i+1];b+=d[i+2];n++; } r/=n;g/=n;b/=n;
  const sample={t:now/1000,r,g,b,h:hueFromRGB(r,g,b)}; state.samples.push(sample); while(state.samples.length && sample.t-state.samples[0].t>10)state.samples.shift();
  state.frameCount++; $('frameValue').textContent=state.frameCount; $('hueValue').textContent=sample.h.toFixed(1)+'°';
  const recent=state.samples.filter(s=>sample.t-s.t<=5).map(s=>s.h); const amp=recent.length?Math.max(...recent)-Math.min(...recent):0; $('ampValue').textContent=amp.toFixed(1)+'°';
  const elapsed=(now-state.lastFrame)/1000; if(elapsed>1){
    $('fpsValue').textContent=(state.frameCount/elapsed).toFixed(0)+' fps';
    const frequency = dominantFrequency(state.samples);
    if (frequency === null) {
      $('freqValue').textContent = '—';
      $('freqDetail').textContent = 'Need a clearer periodic signal';
    } else {
      $('freqValue').textContent = Math.round(frequency * 60) + ' bpm';
      $('freqDetail').textContent = frequency.toFixed(2) + ' Hz · last 10 s';
    }
  }
  drawChart(); state.animation=requestAnimationFrame(analyseFrame);
}
function dominantFrequency(samples){
  if(samples.length<40 || samples.at(-1).t - samples[0].t < 8)return null; const windowed=samples.filter(s=>samples.at(-1).t-s.t<10), n=windowed.length; if(n<35)return null; const mean=windowed.reduce((a,s)=>a+s.h,0)/n; let bestF=.5,best=0;
  for(let f=.5;f<=12;f+=.1){ let re=0,im=0; for(const s of windowed){const a=2*Math.PI*f*(s.t-windowed[0].t); const v=s.h-mean; re+=v*Math.cos(a);im+=v*Math.sin(a);} const p=re*re+im*im;if(p>best){best=p;bestF=f;}}
  const variance=windowed.reduce((sum,s)=>sum+(s.h-mean)**2,0)/n;
  return variance < 0.08 ? null : bestF;
}
function drawChart(){
  const rect=chart.getBoundingClientRect(), dpr=devicePixelRatio||1; chart.width=rect.width*dpr;chart.height=rect.height*dpr;const ctx=chart.getContext('2d');ctx.scale(dpr,dpr); const w=rect.width,h=rect.height;ctx.clearRect(0,0,w,h);
  ctx.strokeStyle='rgba(185,230,224,.12)';ctx.lineWidth=1; for(let i=1;i<4;i++){ctx.beginPath();ctx.moveTo(0,h*i/4);ctx.lineTo(w,h*i/4);ctx.stroke();}
  if(state.samples.length<2)return; const vals=state.samples.map(s=>s.h), lo=Math.min(...vals),hi=Math.max(...vals),range=Math.max(10,hi-lo), end=state.samples.at(-1).t;
  ctx.beginPath(); state.samples.forEach((s,i)=>{const x=w*(1-(end-s.t)/10),y=h-16-(s.h-lo)/range*(h-32);i?ctx.lineTo(x,y):ctx.moveTo(x,y);});ctx.strokeStyle='#4ee0c1';ctx.lineWidth=2;ctx.stroke();
  const s=state.samples.at(-1),x=w,y=h-16-(s.h-lo)/range*(h-32);ctx.fillStyle='#ff9a5b';ctx.beginPath();ctx.arc(x,y,4,0,Math.PI*2);ctx.fill();
}
async function startCamera(){
  try{ state.stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:1280},height:{ideal:720},frameRate:{ideal:60,max:60}},audio:false}); video.srcObject=state.stream; await video.play(); $('placeholder').classList.add('hidden'); $('cameraButton').textContent='Camera on'; $('cameraButton').disabled=true; $('recordButton').disabled=false; setStatus('Camera ready',true); }
  catch(e){ setStatus('Camera permission needed'); alert('Please allow camera access, then reload the page.'); }
}
function toggleAnalysis(){
  state.active=!state.active; $('recordButton').textContent=state.active?'Stop analysis':'Start analysis'; $('exportButton').disabled=!state.samples.length; if(state.active){state.samples=[];state.frameCount=0;state.lastFrame=performance.now();setStatus('Analysing live',true);state.animation=requestAnimationFrame(analyseFrame);}else{cancelAnimationFrame(state.animation);setStatus('Camera ready',true);$('chartNote').textContent='Analysis paused';drawChart();} }
function exportCsv(){ const rows=['time_s,R,G,B,Hue_deg',...state.samples.map(s=>[s.t.toFixed(4),s.r.toFixed(2),s.g.toFixed(2),s.b.toFixed(2),s.h.toFixed(2)].join(','))]; const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([rows.join('\n')],{type:'text/csv'}));a.download='vibracolor_signal.csv';a.click();URL.revokeObjectURL(a.href); }
$('cameraButton').onclick=startCamera; $('recordButton').onclick=toggleAnalysis; $('exportButton').onclick=exportCsv;
let drag=null; roi.addEventListener('pointerdown',e=>{drag={x:e.clientX,y:e.clientY,rx:state.roi.x,ry:state.roi.y};roi.setPointerCapture(e.pointerId);});roi.addEventListener('pointermove',e=>{if(!drag)return;const r=stage.getBoundingClientRect();state.roi.x=clamp(drag.rx+(e.clientX-drag.x)/r.width,0,1-state.roi.w);state.roi.y=clamp(drag.ry+(e.clientY-drag.y)/r.height,0,1-state.roi.w);updateRoi();});roi.addEventListener('pointerup',()=>drag=null);
window.addEventListener('resize',drawChart); drawChart();
