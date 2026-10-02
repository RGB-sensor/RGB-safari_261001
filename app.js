const $ = id => document.getElementById(id);
const video = $('video'), roi = $('roi'), stage = $('stage'), chart = $('chart');
const state = { stream:null, active:false, samples:[], animation:null, roi:{x:.345,y:.345,w:.31}, lastFrame:0, frameCount:0, recorder:null, videoChunks:[], videoMime:'' };

function setStatus(text, live=false){ $('status').classList.toggle('live',live); $('status').querySelector('span').textContent=text; }
function setSaveStatus(text){ $('saveStatus').textContent=text; }
function clamp(v,min,max){ return Math.max(min,Math.min(max,v)); }
function timeStamp(){ const d=new Date(); const p=n=>String(n).padStart(2,'0'); return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`; }
function testBase(){ const raw=$('testName').value.trim() || 'vibracolor_test'; return raw.replace(/[^a-zA-Z0-9_-]+/g,'_').replace(/^_+|_+$/g,'').slice(0,48) || 'vibracolor_test'; }
function downloadBlob(blob, filename){ const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(a.href),1000); }
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
function renderChart(ctx,w,h,withAxes=false){
  const pad=withAxes?{l:82,r:34,t:62,b:70}:{l:0,r:0,t:0,b:0}, pw=w-pad.l-pad.r, ph=h-pad.t-pad.b;
  ctx.clearRect(0,0,w,h); ctx.fillStyle=withAxes?'#06171e':'transparent'; if(withAxes)ctx.fillRect(0,0,w,h);
  if(state.samples.length<2)return; const vals=state.samples.map(s=>s.h), rawLo=Math.min(...vals),rawHi=Math.max(...vals),range=Math.max(10,rawHi-rawLo),lo=rawLo-range*.08,hi=rawHi+range*.08,end=state.samples.at(-1).t;
  ctx.strokeStyle='rgba(185,230,224,.16)';ctx.lineWidth=1; for(let i=0;i<=4;i++){const y=pad.t+ph*i/4;ctx.beginPath();ctx.moveTo(pad.l,y);ctx.lineTo(w-pad.r,y);ctx.stroke();}
  ctx.beginPath(); state.samples.forEach((s,i)=>{const x=pad.l+pw*(1-(end-s.t)/10),y=pad.t+ph-(s.h-lo)/(hi-lo)*ph;i?ctx.lineTo(x,y):ctx.moveTo(x,y);});ctx.strokeStyle='#4ee0c1';ctx.lineWidth=withAxes?4:2;ctx.stroke();
  const s=state.samples.at(-1),x=pad.l+pw,y=pad.t+ph-(s.h-lo)/(hi-lo)*ph;ctx.fillStyle='#ff9a5b';ctx.beginPath();ctx.arc(x,y,withAxes?6:4,0,Math.PI*2);ctx.fill();
  if(!withAxes)return;
  ctx.fillStyle='#e7f7f5';ctx.font='600 24px system-ui';ctx.fillText('Hue vs. time',pad.l,34);ctx.font='18px system-ui';ctx.fillStyle='#91aaa9';
  for(let i=0;i<=4;i++){const y=pad.t+ph*i/4;ctx.fillText((hi-(hi-lo)*i/4).toFixed(1)+'°',12,y+6);const sec=-10+10*i;const x=pad.l+pw*i/4;ctx.textAlign='center';ctx.fillText(sec===0?'0':sec+' s',x,h-38);}ctx.textAlign='center';ctx.fillText('Time relative to latest sample (s)',pad.l+pw/2,h-10);
  ctx.save();ctx.translate(24,pad.t+ph/2);ctx.rotate(-Math.PI/2);ctx.fillText('Hue (degrees)',0,0);ctx.restore();ctx.textAlign='left';
}
function drawChart(){ const rect=chart.getBoundingClientRect(),dpr=devicePixelRatio||1;chart.width=rect.width*dpr;chart.height=rect.height*dpr;const ctx=chart.getContext('2d');ctx.scale(dpr,dpr);renderChart(ctx,rect.width,rect.height,false); }
function chartPng(){ const c=document.createElement('canvas');c.width=1400;c.height=820;renderChart(c.getContext('2d'),c.width,c.height,true);return c.toDataURL('image/png'); }
async function startCamera(){
  try{ state.stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:3840},height:{ideal:2160},aspectRatio:{ideal:16/9},frameRate:{ideal:30,max:60}},audio:false}); video.srcObject=state.stream; await video.play(); const settings=state.stream.getVideoTracks()[0]?.getSettings?.()||{}; const resolution=settings.width&&settings.height?` · ${settings.width}×${settings.height}`:''; $('placeholder').classList.add('hidden'); $('cameraButton').textContent='Camera on'; $('cameraButton').disabled=true; $('stopCameraButton').disabled=false; $('videoButton').disabled=typeof MediaRecorder==='undefined'; $('recordButton').disabled=false; setStatus('Camera ready'+resolution,true); if(typeof MediaRecorder==='undefined')setSaveStatus('Video recording is not available in this browser. CSV export remains available.'); }
  catch(e){ setStatus('Camera permission needed'); alert('Please allow camera access, then reload the page.'); }
}
function stopCamera(){
  if(state.recorder?.state==='recording') stopVideoRecording();
  if(state.active) toggleAnalysis();
  state.stream?.getTracks().forEach(track => track.stop());
  state.stream=null; video.srcObject=null;
  $('placeholder').classList.remove('hidden'); $('cameraButton').textContent='Start camera'; $('cameraButton').disabled=false;
  $('stopCameraButton').disabled=true; $('videoButton').disabled=true; $('recordButton').disabled=true; setStatus('Camera off');
}
function toggleAnalysis(){
  state.active=!state.active; $('recordButton').textContent=state.active?'Stop analysis':'Start analysis'; $('exportButton').disabled=!state.samples.length; if(state.active){state.samples=[];state.frameCount=0;state.lastFrame=performance.now();setStatus('Analysing live',true);state.animation=requestAnimationFrame(analyseFrame);}else{cancelAnimationFrame(state.animation);setStatus('Camera ready',true);$('chartNote').textContent='Analysis paused';drawChart();} }
function exportCsv(){ const stamp=timeStamp(),name=testBase(),rows=[`test_name,${name}`,`exported_at,${new Date().toISOString()}`,'time_s,R,G,B,Hue_deg',...state.samples.map(s=>[s.t.toFixed(4),s.r.toFixed(2),s.g.toFixed(2),s.b.toFixed(2),s.h.toFixed(2)].join(','))]; downloadBlob(new Blob([rows.join('\n')],{type:'text/csv'}),`${name}_${stamp}_signal.csv`); const png=chartPng(),base64=png.split(',')[1];downloadBlob(new Blob([Uint8Array.from(atob(base64),c=>c.charCodeAt(0))],{type:'image/png'}),`${name}_${stamp}_hue-time.png`); setSaveStatus(`Saved CSV and labelled Hue–time PNG locally.`); }
function startVideoRecording(){
  if(!state.stream || typeof MediaRecorder==='undefined')return;
  const mp4='video/mp4;codecs=avc1.42E01E', webm='video/webm;codecs=vp8';
  state.videoMime=MediaRecorder.isTypeSupported?.(mp4) ? mp4 : (MediaRecorder.isTypeSupported?.(webm) ? webm : '');
  try { state.videoChunks=[]; state.recorder=state.videoMime ? new MediaRecorder(state.stream,{mimeType:state.videoMime}) : new MediaRecorder(state.stream); }
  catch(e){ setSaveStatus('Video recording could not start in this browser.'); return; }
  state.recorder.ondataavailable=e=>{ if(e.data.size)state.videoChunks.push(e.data); };
  state.recorder.onstop=()=>{ const ext=state.recorder.mimeType.includes('mp4')?'mp4':'webm', stamp=timeStamp(), name=testBase(); downloadBlob(new Blob(state.videoChunks,{type:state.recorder.mimeType||'video/webm'}),`${name}_${stamp}_video.${ext}`); setSaveStatus(`Saved ${name}_${stamp}_video.${ext} locally.`); state.videoChunks=[]; state.recorder=null; $('videoButton').textContent='Record video'; if(state.stream)$('videoButton').disabled=false; };
  state.recorder.start(); $('videoButton').textContent='Stop video & save'; setStatus('Video recording',true); setSaveStatus('Recording video locally. Tap “Stop video & save” when finished.');
}
function stopVideoRecording(){ if(state.recorder?.state==='recording')state.recorder.stop(); }
function toggleVideoRecording(){ state.recorder?.state==='recording' ? stopVideoRecording() : startVideoRecording(); }
$('cameraButton').onclick=startCamera; $('recordButton').onclick=toggleAnalysis; $('exportButton').onclick=exportCsv;
$('stopCameraButton').onclick=stopCamera;
$('videoButton').onclick=toggleVideoRecording;
let drag=null; roi.addEventListener('pointerdown',e=>{drag={x:e.clientX,y:e.clientY,rx:state.roi.x,ry:state.roi.y};roi.setPointerCapture(e.pointerId);});roi.addEventListener('pointermove',e=>{if(!drag)return;const r=stage.getBoundingClientRect();state.roi.x=clamp(drag.rx+(e.clientX-drag.x)/r.width,0,1-state.roi.w);state.roi.y=clamp(drag.ry+(e.clientY-drag.y)/r.height,0,1-state.roi.w);updateRoi();});roi.addEventListener('pointerup',()=>drag=null);
window.addEventListener('resize',drawChart); drawChart();
