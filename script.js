var N = 512;
var TWO_PI = 2 * Math.PI;

function taylorSin(x, n) {
  x = x - TWO_PI * Math.floor((x + Math.PI) / TWO_PI);
  var t = x, s = x;
  for (var i = 1; i < n; i++) {
    t *= -(x * x) / ((2 * i) * (2 * i + 1));
    s += t;
  }
  return s;
}

function makePreviewSignal(terms, noiseLevel, harmonics) {
  var raw = new Float64Array(N), noisy = new Float64Array(N);
  var amp = noiseLevel / 100;
  for (var i = 0; i < N; i++) {
    var t = (i / N) * TWO_PI * 2;
    var v = 0, totalW = 0;
    for (var h = 1; h <= harmonics; h++) {
      var w = 1 / h;
      v += w * taylorSin(t * h, terms);
      totalW += w;
    }
    v /= totalW;
    raw[i] = v;
    var r = Math.sin(i * 127.1) * Math.sin(i * 311.7 + 17.3);
    noisy[i] = v + r * amp;
  }
  return { raw: raw, noisy: noisy };
}

function trapSmooth(signal, win) {
  var out = new Float64Array(N), half = win >> 1;
  for (var i = 0; i < N; i++) {
    var a = i - half < 0 ? 0 : i - half;
    var b = i + half >= N ? N - 1 : i + half;
    var len = b - a;
    if (!len) { out[i] = signal[i]; continue; }
    var area = signal[a] + signal[b];
    for (var j = a + 1; j < b; j++) area += 2 * signal[j];
    out[i] = area / (2 * len);
  }
  return out;
}

function maxError(terms) {
  var max = 0;
  for (var i = 0; i <= 200; i++) {
    var x = -Math.PI + (i / 200) * TWO_PI;
    var e = Math.abs(taylorSin(x, terms) - Math.sin(x));
    if (e > max) max = e;
  }
  return max;
}

function variance(arr) {
  var mean = 0;
  for (var i = 0; i < arr.length; i++) mean += arr[i];
  mean /= arr.length;
  var v = 0;
  for (var i = 0; i < arr.length; i++) v += (arr[i] - mean) * (arr[i] - mean);
  return v / arr.length;
}

function drawScope(audioRaw, audioProc, previewRaw, previewNoisy, previewFilt) {
  var cv = document.getElementById('cv');
  var ctx = cv.getContext('2d');
  var W = cv.width, H = cv.height;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#060a0e';
  ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = 'rgba(255,255,255,0.05)';
  ctx.lineWidth = 0.5;
  for (var r = 0; r <= 6; r++) {
    ctx.beginPath(); ctx.moveTo(0, (r/6)*H); ctx.lineTo(W, (r/6)*H); ctx.stroke();
  }
  for (var c = 0; c <= 10; c++) {
    ctx.beginPath(); ctx.moveTo((c/10)*W, 0); ctx.lineTo((c/10)*W, H); ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.1)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, H/2); ctx.lineTo(W, H/2); ctx.stroke();

  var mid = H / 2, amp = H * 0.38;

  function line(data, color, lw, dashed) {
    ctx.beginPath(); ctx.strokeStyle = color; ctx.lineWidth = lw;
    ctx.setLineDash(dashed ? [3,3] : []);
    for (var i = 0; i < data.length; i++) {
      var x = (i / (data.length - 1)) * W, y = mid - data[i] * amp;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke(); ctx.setLineDash([]);
  }

  function waveEnv(env, color, lw) {
    if (!env) return;
    ctx.beginPath();
    for (var i = 0; i < env.length; i++) {
      var x = (i / (env.length - 1)) * W;
      i === 0 ? ctx.moveTo(x, mid - env[i] * amp) : ctx.lineTo(x, mid - env[i] * amp);
    }
    for (var i = env.length - 1; i >= 0; i--) {
      ctx.lineTo((i / (env.length - 1)) * W, mid + env[i] * amp);
    }
    ctx.closePath();
    ctx.globalAlpha = 0.14; ctx.fillStyle = color; ctx.fill(); ctx.globalAlpha = 1;
    ctx.beginPath();
    for (var i = 0; i < env.length; i++) {
      var x = (i / (env.length - 1)) * W, y = mid - env[i] * amp;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.stroke();
  }

  if (audioRaw || audioProc) {
    waveEnv(audioRaw,  'rgba(240,153,123,0.9)', 1.5);
    waveEnv(audioProc, '#1d9e75', 2);
  } else {
    line(previewNoisy, 'rgba(240,153,123,0.55)', 1, false);
    line(previewRaw,   'rgba(136,135,128,0.5)',  1, true);
    line(previewFilt,  '#1d9e75', 2, false);
  }
}

function getParams() {
  return {
    taylor:    parseInt(document.getElementById('s-terms').value),
    ruido:     parseInt(document.getElementById('s-noise').value),
    suavizado: parseInt(document.getElementById('s-smooth').value),
    frecuencia:parseInt(document.getElementById('s-freq').value),
    ventana:   parseFloat(document.getElementById('s-win').value) / 10,
    bajos:     parseInt(document.getElementById('s-bass').value),
    agudos:    parseInt(document.getElementById('s-treble').value),
    graves:    parseInt(document.getElementById('s-sub').value),
    volumen:   parseFloat(document.getElementById('s-vol').value) / 100
  };
}

function showFormula(p) {
  var lines = [];
  if (p.taylor > 1)
    lines.push('sin(x) \u2248 \u03A3 (-1)\u207F x\u00B2\u207F\u207A\u00B9/(2n+1)!  [' + p.taylor + ' terminos]');
  if (p.suavizado > 1)
    lines.push('y[i] = h/2 \u00B7 (f\u2080 + 2\u03A3f\u2096 + f\u2099) / n  [win=' + p.suavizado + ']');
  if (p.graves !== 0)
    lines.push('H(s) = K(s + \u03C9\u2080/K) / (s + \u03C9\u2080)  [lowshelf 80Hz ' + (p.graves >= 0 ? '+' : '') + p.graves + 'dB]');
  if (p.bajos !== 0)
    lines.push('H(j\u03C9) = A / (1 + j\u03C9/\u03C9\u2080)  [peak 200Hz ' + (p.bajos >= 0 ? '+' : '') + p.bajos + 'dB]');
  if (p.agudos !== 0)
    lines.push('H(s) = K(s + \u03C9\u2080) / (s + K\u03C9\u2080)  [highshelf 6kHz ' + (p.agudos >= 0 ? '+' : '') + p.agudos + 'dB]');
  if (p.frecuencia < 20000)
    lines.push('H(j\u03C9) = \u03C9c / (j\u03C9 + \u03C9c)  [lowpass ' + p.frecuencia + 'Hz Q=' + p.ventana.toFixed(2) + ']');
  if (p.ruido > 0)
    lines.push('g(x) = x\u00B7|x|/\u03B8, |x|<\u03B8=' + (p.ruido * 0.04).toFixed(3) + '  [noise gate]');
  document.getElementById('formula-display').textContent = lines.length ? lines.join('\n') : 'Ajusta los parametros para ver las operaciones';
}

function updateLabels(p) {
  document.getElementById('v-terms').textContent  = p.taylor;
  document.getElementById('v-noise').textContent  = p.ruido + '%';
  document.getElementById('v-smooth').textContent = p.suavizado;
  document.getElementById('v-freq').textContent   = p.frecuencia >= 20000 ? 'flat' : p.frecuencia + 'Hz';
  document.getElementById('v-win').textContent    = (p.ventana).toFixed(2);
  document.getElementById('v-bass').textContent   = (p.bajos >= 0 ? '+' : '') + p.bajos + 'dB';
  document.getElementById('v-treble').textContent = (p.agudos >= 0 ? '+' : '') + p.agudos + 'dB';
  document.getElementById('v-sub').textContent    = (p.graves >= 0 ? '+' : '') + p.graves + 'dB';

  var err = maxError(p.taylor);
  document.getElementById('m-err').textContent   = err.toFixed(5);
  document.getElementById('m-terms').textContent = p.taylor;

  var pi4 = Math.PI / 4, pi2 = Math.PI / 2;
  document.getElementById('l-t1').textContent  = taylorSin(pi4, p.taylor).toFixed(8);
  document.getElementById('l-t2').textContent  = taylorSin(pi2, p.taylor).toFixed(8);
  document.getElementById('l-max').textContent = err.toFixed(8);
}

function updatePreview() {
  var p = getParams();
  updateLabels(p);
  showFormula(p);

  var cv = document.getElementById('cv');
  cv.width  = cv.parentElement.clientWidth || 700;
  cv.height = 200;

  if (window.AP && AP.ready()) {
    var rawEnv  = AP.getWaveform('raw', cv.width);
    var procEnv = AP.getWaveform('processed', cv.width);
    var rmsR = AP.getRMS('raw'), rmsP = AP.getRMS('processed');
    var red = rmsR > 0 ? ((1 - rmsP / rmsR) * 100) : 0;
    document.getElementById('m-red').textContent   = Math.max(0, red).toFixed(1) + '%';
    document.getElementById('l-varn').textContent  = rmsR.toFixed(6);
    document.getElementById('l-varf').textContent  = rmsP.toFixed(6);
    var info = AP.info();
    document.getElementById('m-samples').textContent = info ? info.sr + ' Hz' : '...';
    drawScope(rawEnv, procEnv, null, null, null);
  } else {
    var sig  = makePreviewSignal(p.taylor, p.ruido, 2);
    var filt = trapSmooth(sig.noisy, p.suavizado > 1 ? p.suavizado : 2);
    var vn = variance(sig.noisy), vf = variance(filt);
    var red = vn > 0 ? ((1 - vf / vn) * 100) : 0;
    document.getElementById('m-red').textContent   = Math.max(0, red).toFixed(1) + '%';
    document.getElementById('l-varn').textContent  = vn.toFixed(6);
    document.getElementById('l-varf').textContent  = vf.toFixed(6);
    document.getElementById('m-samples').textContent = N;
    drawScope(null, null, sig.raw, sig.noisy, filt);
  }
}

function setStatus(msg, state) {
  var dot = document.getElementById('status-dot');
  var txt = document.getElementById('status-msg');
  txt.textContent = msg;
  dot.className = 'status-dot' + (state ? ' ' + state : '');
}

var processTimer = null;
function scheduleProcess() {
  clearTimeout(processTimer);
  processTimer = setTimeout(async function () {
    if (!window.AP || !AP.ready()) return;
    setStatus('procesando...', 'loading');
    var p = getParams();
    await AP.process(p);
    setStatus('listo', 'active');
    updatePreview();
  }, 300);
}

function animVU() {
  var lvl = 0.5 + 0.5 * Math.abs(Math.sin(Date.now() / 350 + Math.cos(Date.now() / 190) * 0.5));
  var dots = document.querySelectorAll('.vu-dot');
  var n = dots.length, active = Math.floor(lvl * n);
  dots.forEach(function (d, i) {
    var pos = n - 1 - i;
    d.className = pos < active ? (pos >= n-2 ? 'vu-dot r' : pos >= n-5 ? 'vu-dot o' : 'vu-dot g') : 'vu-dot';
  });
  requestAnimationFrame(animVU);
}

document.addEventListener('DOMContentLoaded', function () {
  animVU();

  var ids = ['s-terms','s-noise','s-smooth','s-freq','s-win','s-bass','s-treble','s-sub','s-vol'];
  ids.forEach(function (id) {
    document.getElementById(id).addEventListener('input', function () {
      updatePreview();
      if (window.AP && AP.ready()) scheduleProcess();
    });
  });

  document.getElementById('file-input').addEventListener('change', async function (e) {
    var f = e.target.files[0];
    if (!f) return;
    setStatus('cargando...', 'loading');
    document.getElementById('file-label').textContent = f.name;
    await AP.load(f);
    var info = AP.info();
    var p = getParams();
    setStatus('procesando...', 'loading');
    await AP.process(p);
    setStatus((info.ch === 1 ? 'mono' : 'stereo') + ' ' + info.dur.toFixed(1) + 's', 'active');
    updatePreview();
  });

  document.getElementById('drop-zone').addEventListener('click', function () {
    document.getElementById('file-input').click();
  });

  var dz = document.getElementById('drop-zone');
  dz.addEventListener('dragover', function (e) { e.preventDefault(); dz.classList.add('drag-over'); });
  dz.addEventListener('dragleave', function () { dz.classList.remove('drag-over'); });
  dz.addEventListener('drop', async function (e) {
    e.preventDefault(); dz.classList.remove('drag-over');
    var f = e.dataTransfer.files[0];
    if (!f) return;
    setStatus('cargando...', 'loading');
    document.getElementById('file-label').textContent = f.name;
    await AP.load(f);
    var p = getParams();
    setStatus('procesando...', 'loading');
    await AP.process(p);
    var info = AP.info();
    setStatus((info.ch === 1 ? 'mono' : 'stereo') + ' ' + info.dur.toFixed(1) + 's', 'active');
    updatePreview();
  });

  document.getElementById('btn-play-raw').addEventListener('click', function () {
    if (!window.AP || !AP.ready()) return;
    var on = AP.play('raw');
    this.classList.toggle('on', on);
    document.getElementById('btn-play-proc').classList.remove('on');
  });

  document.getElementById('btn-play-proc').addEventListener('click', function () {
    if (!window.AP || !AP.processed) return;
    var on = AP.play('processed');
    this.classList.toggle('on', on);
    document.getElementById('btn-play-raw').classList.remove('on');
  });

  document.getElementById('btn-dl').addEventListener('click', function () {
    if (window.AP) AP.download();
  });

  window.addEventListener('resize', updatePreview);
  updatePreview();
});
