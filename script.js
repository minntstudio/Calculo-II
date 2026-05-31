var N = 512;
var TWO_PI = 6.283185307179586;

function taylorSin(x, n) {
  x = x - TWO_PI * Math.floor((x + Math.PI) / TWO_PI);
  var t = x, s = x;
  for (var i = 1; i < n; i++) { t *= -(x*x)/((2*i)*(2*i+1)); s += t; }
  return s;
}

function previewSignal(terms, noiseAmt) {
  var raw = new Float64Array(N), noisy = new Float64Array(N), amp = noiseAmt / 100;
  for (var i = 0; i < N; i++) {
    var t = (i/N)*TWO_PI*2;
    var v = taylorSin(t,terms)*0.6 + taylorSin(t*2,terms)*0.3 + taylorSin(t*3,terms)*0.1;
    raw[i] = v;
    noisy[i] = v + (Math.sin(i*127.1)*Math.sin(i*311.7+17.3))*amp;
  }
  return { raw: raw, noisy: noisy };
}

function trapSmooth(signal, win) {
  var out = new Float64Array(N), h = win >> 1;
  for (var i = 0; i < N; i++) {
    var a = Math.max(0,i-h), b = Math.min(N-1,i+h), n = b-a;
    if (!n) { out[i]=signal[i]; continue; }
    var area = signal[a]+signal[b];
    for (var j=a+1;j<b;j++) area += 2*signal[j];
    out[i] = area/(2*n);
  }
  return out;
}

function maxError(terms) {
  var max = 0;
  for (var i=0;i<=300;i++) {
    var x = -Math.PI+(i/300)*TWO_PI;
    var e = Math.abs(taylorSin(x,terms)-Math.sin(x));
    if (e>max) max=e;
  }
  return max;
}

function variance(arr) {
  var m=0; for (var i=0;i<arr.length;i++) m+=arr[i]; m/=arr.length;
  var v=0; for (var i=0;i<arr.length;i++) v+=(arr[i]-m)*(arr[i]-m);
  return v/arr.length;
}

function fmtDb(v) { return (v>=0?'+':'')+v+'dB'; }
function fmtTime(s) {
  if (!s || isNaN(s)) return '0:00';
  var m = Math.floor(s/60)|0, ss = Math.floor(s%60)|0;
  return m+':'+(ss<10?'0':'')+ss;
}

/* waveform on player canvas */
function drawPlayerWave(canvasId, env, color, playPos) {
  var cv = document.getElementById(canvasId);
  if (!cv) return;
  var ctx = cv.getContext('2d');
  var W = cv.width = cv.parentElement.clientWidth || 400;
  var H = cv.height;
  ctx.clearRect(0,0,W,H);
  ctx.fillStyle = '#06090e';
  ctx.fillRect(0,0,W,H);

  if (!env) {
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0,H/2); ctx.lineTo(W,H/2); ctx.stroke();
    return;
  }

  var mid = H/2, amp = H*0.42;
  var played = Math.max(0, Math.min(1, playPos || 0));

  /* fill area - not played */
  ctx.beginPath();
  for (var i=0;i<env.length;i++) {
    var x=(i/(env.length-1))*W;
    i===0?ctx.moveTo(x,mid-env[i]*amp):ctx.lineTo(x,mid-env[i]*amp);
  }
  for (var i=env.length-1;i>=0;i--) ctx.lineTo((i/(env.length-1))*W, mid+env[i]*amp);
  ctx.closePath();
  ctx.globalAlpha=0.1; ctx.fillStyle=color; ctx.fill(); ctx.globalAlpha=1;

  /* played portion */
  if (played > 0) {
    ctx.save();
    ctx.beginPath(); ctx.rect(0,0,played*W,H); ctx.clip();
    ctx.beginPath();
    for (var i=0;i<env.length;i++) {
      var x=(i/(env.length-1))*W, y=mid-env[i]*amp;
      i===0?ctx.moveTo(x,y):ctx.lineTo(x,y);
    }
    for (var i=env.length-1;i>=0;i--) ctx.lineTo((i/(env.length-1))*W,mid+env[i]*amp);
    ctx.closePath();
    ctx.globalAlpha=0.28; ctx.fillStyle=color; ctx.fill(); ctx.globalAlpha=1;
    ctx.restore();
  }

  /* line full */
  ctx.beginPath(); ctx.strokeStyle = color.replace('1)','0.35)') || 'rgba(200,200,200,0.35)';
  ctx.lineWidth=1; ctx.setLineDash([]);
  for (var i=0;i<env.length;i++) {
    var x=(i/(env.length-1))*W, y=mid-env[i]*amp;
    i===0?ctx.moveTo(x,y):ctx.lineTo(x,y);
  }
  ctx.stroke();

  /* played line bright */
  if (played > 0) {
    ctx.save();
    ctx.beginPath(); ctx.rect(0,0,played*W,H); ctx.clip();
    ctx.beginPath(); ctx.strokeStyle=color; ctx.lineWidth=1.8;
    for (var i=0;i<env.length;i++) {
      var x=(i/(env.length-1))*W, y=mid-env[i]*amp;
      i===0?ctx.moveTo(x,y):ctx.lineTo(x,y);
    }
    ctx.stroke(); ctx.restore();
  }

  /* playhead */
  var px = played*W;
  ctx.beginPath(); ctx.strokeStyle='rgba(255,255,255,0.55)'; ctx.lineWidth=1.5;
  ctx.setLineDash([3,3]);
  ctx.moveTo(px,0); ctx.lineTo(px,H); ctx.stroke(); ctx.setLineDash([]);
}

/* main scope */
function drawScope(rawEnv, procEnv, prevRaw, prevNoisy, prevFilt) {
  var cv = document.getElementById('cv');
  if (!cv) return;
  var ctx = cv.getContext('2d');
  var W = cv.width = cv.parentElement.clientWidth || 800;
  var H = cv.height;
  ctx.fillStyle='#06090e'; ctx.fillRect(0,0,W,H);

  ctx.strokeStyle='rgba(255,255,255,0.04)'; ctx.lineWidth=0.5;
  for (var r=0;r<=8;r++){ctx.beginPath();ctx.moveTo(0,(r/8)*H);ctx.lineTo(W,(r/8)*H);ctx.stroke();}
  for (var c=0;c<=12;c++){ctx.beginPath();ctx.moveTo((c/12)*W,0);ctx.lineTo((c/12)*W,H);ctx.stroke();}
  ctx.strokeStyle='rgba(255,255,255,0.09)';ctx.lineWidth=1;
  ctx.beginPath();ctx.moveTo(0,H/2);ctx.lineTo(W,H/2);ctx.stroke();

  var mid=H/2, amp=H*0.4;

  function fillWave(env,colorFill,colorLine,lw) {
    if (!env) return;
    ctx.beginPath();
    for (var i=0;i<env.length;i++){var x=(i/(env.length-1))*W; i===0?ctx.moveTo(x,mid-env[i]*amp):ctx.lineTo(x,mid-env[i]*amp);}
    for (var i=env.length-1;i>=0;i--) ctx.lineTo((i/(env.length-1))*W,mid+env[i]*amp);
    ctx.closePath();
    ctx.globalAlpha=0.12;ctx.fillStyle=colorFill;ctx.fill();ctx.globalAlpha=1;
    ctx.beginPath();
    for (var i=0;i<env.length;i++){var x=(i/(env.length-1))*W,y=mid-env[i]*amp;i===0?ctx.moveTo(x,y):ctx.lineTo(x,y);}
    ctx.strokeStyle=colorLine;ctx.lineWidth=lw;ctx.stroke();
  }

  function line(data,color,lw,dash) {
    ctx.beginPath();ctx.strokeStyle=color;ctx.lineWidth=lw;
    ctx.setLineDash(dash?[4,4]:[]);
    for (var i=0;i<data.length;i++){var x=(i/(data.length-1))*W,y=mid-data[i]*amp;i===0?ctx.moveTo(x,y):ctx.lineTo(x,y);}
    ctx.stroke();ctx.setLineDash([]);
  }

  if (rawEnv||procEnv) {
    fillWave(rawEnv,  '#e8620a','rgba(232,98,10,0.7)',  1.5);
    fillWave(procEnv, '#1d9e75','rgba(29,158,117,0.85)',2);
  } else {
    line(prevNoisy,'rgba(232,98,10,0.45)',1,false);
    line(prevRaw,  'rgba(180,180,180,0.35)',1,true);
    line(prevFilt, '#1d9e75',2,false);
  }
}

function getParams() {
  return {
    taylor:    parseInt(document.getElementById('s-terms').value),
    ruido:     parseInt(document.getElementById('s-noise').value),
    suavizado: parseInt(document.getElementById('s-smooth').value),
    frecuencia:parseInt(document.getElementById('s-freq').value),
    ventana:   parseFloat(document.getElementById('s-win').value)/10,
    bajos:     parseInt(document.getElementById('s-bass').value),
    agudos:    parseInt(document.getElementById('s-treble').value),
    graves:    parseInt(document.getElementById('s-sub').value),
    volumen:   parseFloat(document.getElementById('s-vol').value)/100
  };
}

function showFormula(p) {
  var e = maxError(p.taylor);
  var lines = [];
  lines.push('Maclaurin:   sin(x) \u2248 \u03A3 (-1)\u207F x\u00B2\u207F\u207A\u00B9/(2n+1)!   [n='+p.taylor+', \u03B5='+e.toExponential(2)+']');
  if (p.suavizado>1) lines.push('Trapecio:    y[i] = h/2\u00B7(f\u2080+2\u03A3f\u2096+f\u2099)/n   [win='+p.suavizado+']');
  if (p.graves!==0)  lines.push('Lowshelf:    H(s) = K\u00B7(s+\u03C9\u2080/K)/(s+\u03C9\u2080)   [100Hz, '+fmtDb(p.graves)+']');
  if (p.bajos!==0)   lines.push('Peaking:     H(j\u03C9) biquad orden 2   [260Hz, '+fmtDb(p.bajos)+']');
  if (p.agudos!==0)  lines.push('Highshelf:   H(s) = K\u00B7(s+\u03C9\u2080)/(s+K\u03C9\u2080)   [8.5kHz, '+fmtDb(p.agudos)+']');
  if (p.frecuencia<20000) lines.push('Paso-bajo:   H(j\u03C9)=\u03C9c\u00B2/[(j\u03C9)\u00B2+(\u03C9c/Q)j\u03C9+\u03C9c\u00B2]   ['+p.frecuencia+'Hz, Q='+p.ventana.toFixed(2)+']');
  if (p.ruido>0)     lines.push('Compuerta:   g(x)=x\u00B7(|x|/\u03B8)\u00B2 si |x|<\u03B8='+( p.ruido*0.0007).toFixed(4));
  document.getElementById('formula-display').textContent = lines.join('\n');
}

function updateLabels(p) {
  document.getElementById('v-terms').textContent   = p.taylor;
  document.getElementById('v-noise').textContent   = p.ruido+'%';
  document.getElementById('v-smooth').textContent  = p.suavizado;
  document.getElementById('v-freq').textContent    = p.frecuencia>=20000?'plano':p.frecuencia+'Hz';
  document.getElementById('v-win').textContent     = p.ventana.toFixed(2);
  document.getElementById('v-bass').textContent    = fmtDb(p.bajos);
  document.getElementById('v-treble').textContent  = fmtDb(p.agudos);
  document.getElementById('v-sub').textContent     = fmtDb(p.graves);
  document.getElementById('v-vol').textContent     = Math.round(p.volumen*100);

  var err = maxError(p.taylor);
  document.getElementById('m-err').textContent    = err.toFixed(5);
  document.getElementById('m-terms').textContent  = p.taylor;
  document.getElementById('l-t1').textContent     = taylorSin(Math.PI/4,p.taylor).toFixed(8);
  document.getElementById('l-t2').textContent     = taylorSin(Math.PI/2,p.taylor).toFixed(8);
  document.getElementById('l-max').textContent    = err.toFixed(8);
}

/* cached envelopes */
var envRaw = null, envProc = null;

function refreshEnvelopes() {
  if (!window.AP || !AP.ready()) { envRaw=null; envProc=null; return; }
  var cv = document.getElementById('cv');
  var W = cv ? (cv.parentElement.clientWidth||800) : 800;
  envRaw  = AP.getEnvelope('raw',  W);
  envProc = AP.getEnvelope('processed', W);
}

function updatePreview() {
  var p = getParams();
  updateLabels(p);
  showFormula(p);

  var cv = document.getElementById('cv');
  if (cv) { cv.width=cv.parentElement.clientWidth||800; }

  if (window.AP && AP.ready()) {
    var rmsR=AP.getRMS('raw'), rmsP=AP.getRMS('processed');
    var red = rmsR>0?((1-rmsP/rmsR)*100):0;
    document.getElementById('m-red').textContent    = Math.max(0,red).toFixed(1)+'%';
    document.getElementById('l-varn').textContent   = rmsR.toFixed(6);
    document.getElementById('l-varf').textContent   = rmsP.toFixed(6);
    var info=AP.info();
    document.getElementById('m-samples').textContent = info?info.sr+' Hz':'...';

    var meta = document.getElementById('vol-meta');
    if (meta&&info) meta.textContent = (info.ch===1?'Mono':'Estereo')+' \u00B7 '+info.sr+' Hz \u00B7 '+fmtTime(info.dur);

    drawScope(envRaw,envProc,null,null,null);
    drawPlayerWave('wave-raw',  envRaw,  'rgba(232,98,10,1)',   AP.players.raw.currentPos());
    drawPlayerWave('wave-proc', envProc, 'rgba(29,158,117,1)',  AP.players.proc.currentPos());
  } else {
    var sig  = previewSignal(p.taylor, p.ruido);
    var filt = trapSmooth(sig.noisy, Math.max(2,p.suavizado));
    var vn=variance(sig.noisy), vf=variance(filt);
    var red=vn>0?((1-vf/vn)*100):0;
    document.getElementById('m-red').textContent    = Math.max(0,red).toFixed(1)+'%';
    document.getElementById('l-varn').textContent   = vn.toFixed(6);
    document.getElementById('l-varf').textContent   = vf.toFixed(6);
    document.getElementById('m-samples').textContent = N;
    drawScope(null,null,sig.raw,sig.noisy,filt);
    drawPlayerWave('wave-raw',  null, 'rgba(232,98,10,1)',  0);
    drawPlayerWave('wave-proc', null, 'rgba(29,158,117,1)', 0);
  }
}

function setStatus(msg, state) {
  var dot=document.getElementById('status-dot'), txt=document.getElementById('status-msg');
  if (txt) txt.textContent=msg;
  if (dot) dot.className='status-dot'+(state?' '+state:'');
}

var procTimer=null;
function scheduleProcess() {
  clearTimeout(procTimer);
  procTimer=setTimeout(async function(){
    if (!window.AP||!AP.ready()) return;
    setStatus('procesando...','loading');
    await AP.process(getParams());
    refreshEnvelopes();
    setStatus('listo','active');
    updatePreview();
  },300);
}

/* RAF loop para actualizar barra de reproduccion */
function rafLoop() {
  if (window.AP && AP.ready()) {
    var rp = AP.players.raw, pp = AP.players.proc;

    var posR = rp.currentPos(), posP = pp.currentPos();

    if (window.syncSeek_raw)  syncSeek_raw(posR);
    if (window.syncSeek_proc) syncSeek_proc(posP);

    var dur = rp.buf ? rp.buf.duration : 0;
    var tr = document.getElementById('time-raw');
    var tp = document.getElementById('time-proc');
    if (tr) tr.textContent = fmtTime(posR*dur)+' / '+fmtTime(dur);
    if (tp) tp.textContent = fmtTime(posP*dur)+' / '+fmtTime(dur);

    /* redraw player waves with playhead */
    if (rp.playing) drawPlayerWave('wave-raw',  envRaw,  'rgba(232,98,10,1)',  posR);
    if (pp.playing) drawPlayerWave('wave-proc', envProc, 'rgba(29,158,117,1)', posP);

    /* toggle icon appearance */
    var br=document.getElementById('btn-play-raw'), bp=document.getElementById('btn-play-proc');
    if (br) br.classList.toggle('playing',      rp.playing);
    if (bp) bp.classList.toggle('playing-filt', pp.playing);
  }
  requestAnimationFrame(rafLoop);
}

window._triggerLoad = async function (file) {
  setStatus('cargando...','loading');
  document.getElementById('file-label').textContent = file.name;
  await AP.load(file);
  var info=AP.info();
  setStatus('procesando...','loading');
  await AP.process(getParams());
  refreshEnvelopes();
  var ch=info.ch===1?'Mono':'Estereo';
  setStatus(ch+' \u00B7 '+fmtTime(info.dur),'active');
  updatePreview();
};

document.addEventListener('DOMContentLoaded', function () {

  /* file input */
  document.getElementById('file-input').addEventListener('change', function(e){
    if (e.target.files[0]) window._triggerLoad(e.target.files[0]);
  });

  /* drop zone wired in index.html inline script, also here as fallback */
  var dz=document.getElementById('drop-zone');
  if (dz) {
    dz.addEventListener('drop', function(e){
      e.preventDefault(); dz.classList.remove('drag-over');
      if (e.dataTransfer&&e.dataTransfer.files[0]) window._triggerLoad(e.dataTransfer.files[0]);
    });
  }

  /* play buttons */
  document.getElementById('btn-play-raw').addEventListener('click', function(){
    if (!window.AP||!AP.ready()) return;
    AP.players.proc.stop();
    document.getElementById('btn-play-proc').classList.remove('playing-filt');
    AP.players.raw.toggle();
  });

  document.getElementById('btn-play-proc').addEventListener('click', function(){
    if (!window.AP||!AP.processed) return;
    AP.players.raw.stop();
    document.getElementById('btn-play-raw').classList.remove('playing');
    AP.players.proc.toggle();
  });

  /* wave area click to play */
  document.getElementById('wave-raw-wrap').addEventListener('click', function(e){
    if (e.target.closest('.player-controls')) return;
    if (!window.AP||!AP.ready()) return;
    AP.players.proc.stop();
    AP.players.raw.toggle();
  });

  document.getElementById('wave-proc-wrap').addEventListener('click', function(e){
    if (e.target.closest('.player-controls')) return;
    if (!window.AP||!AP.processed) return;
    AP.players.raw.stop();
    AP.players.proc.toggle();
  });

  document.getElementById('btn-dl').addEventListener('click', function(){
    if (window.AP) AP.download();
  });

  /* controls */
  ['s-terms','s-noise','s-smooth','s-freq','s-win','s-bass','s-treble','s-sub','s-vol'].forEach(function(id){
    var el=document.getElementById(id);
    if (el) el.addEventListener('input',function(){
      updatePreview();
      if (window.AP&&AP.ready()) scheduleProcess();
    });
  });

  window.addEventListener('resize', function(){
    refreshEnvelopes();
    updatePreview();
  });

  rafLoop();
  updatePreview();
});
