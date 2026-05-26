(function () {
  var TWO_PI = 2 * Math.PI;

  function tSin(x, n) {
    x = x - TWO_PI * Math.floor((x + Math.PI) / TWO_PI);
    var t = x, s = x;
    for (var i = 1; i < n; i++) {
      t *= -(x * x) / ((2 * i) * (2 * i + 1));
      s += t;
    }
    return s;
  }

  function trapSmooth(data, win) {
    if (win < 2) return data;
    var out = new Float32Array(data.length);
    var h = win >> 1;
    for (var i = 0; i < data.length; i++) {
      var a = i - h < 0 ? 0 : i - h;
      var b = i + h >= data.length ? data.length - 1 : i + h;
      var n = b - a;
      if (!n) { out[i] = data[i]; continue; }
      var area = data[a] + data[b];
      for (var j = a + 1; j < b; j++) area += 2 * data[j];
      out[i] = area / (2 * n);
    }
    return out;
  }

  function noiseGate(data, amount) {
    if (amount <= 0) return;
    var thr = amount * 0.04;
    for (var i = 0; i < data.length; i++) {
      var abs = data[i] < 0 ? -data[i] : data[i];
      if (abs < thr) data[i] *= abs / thr;
    }
  }

  function waveshape(data, terms) {
    var sc = Math.PI / 2;
    var ref = tSin(sc, terms);
    if (Math.abs(ref) < 1e-6) return;
    for (var i = 0; i < data.length; i++) {
      var xi = data[i] > 1 ? 1 : data[i] < -1 ? -1 : data[i];
      data[i] = tSin(xi * sc, terms) / ref;
    }
  }

  function readFile(file) {
    return new Promise(function (res, rej) {
      var r = new FileReader();
      r.onload = function (e) { res(e.target.result); };
      r.onerror = rej;
      r.readAsArrayBuffer(file);
    });
  }

  function decode(ctx, ab) {
    return new Promise(function (res, rej) {
      ctx.decodeAudioData(ab, res, rej);
    });
  }

  async function applyEQ(raw, p) {
    var nc = raw.numberOfChannels, sr = raw.sampleRate, len = raw.length;
    var oc = new OfflineAudioContext(nc, len, sr);
    var src = oc.createBufferSource();
    src.buffer = raw;

    var f1 = oc.createBiquadFilter();
    f1.type = 'lowshelf'; f1.frequency.value = 80; f1.gain.value = p.graves;

    var f2 = oc.createBiquadFilter();
    f2.type = 'peaking'; f2.frequency.value = 200; f2.Q.value = 1.2; f2.gain.value = p.bajos;

    var f3 = oc.createBiquadFilter();
    f3.type = 'highshelf'; f3.frequency.value = 6000; f3.gain.value = p.agudos;

    var f4 = oc.createBiquadFilter();
    f4.type = 'lowpass';
    f4.frequency.value = Math.min(p.frecuencia, sr / 2 - 100);
    f4.Q.value = Math.max(0.1, Math.min(15, p.ventana));

    src.connect(f1); f1.connect(f2); f2.connect(f3); f3.connect(f4);
    f4.connect(oc.destination);
    src.start(0);
    return oc.startRendering();
  }

  async function run(raw, p) {
    var eq = await applyEQ(raw, p);
    var nc = eq.numberOfChannels;
    for (var ch = 0; ch < nc; ch++) {
      var data = new Float32Array(eq.getChannelData(ch));
      noiseGate(data, p.ruido / 100);
      if (p.taylor > 1) waveshape(data, p.taylor);
      if (p.suavizado > 1) data = trapSmooth(data, p.suavizado);
      eq.copyToChannel(data, ch);
    }
    return eq;
  }

  function toWAV(buf) {
    var nc = buf.numberOfChannels, sr = buf.sampleRate, len = buf.length;
    var blk = nc * 2, ds = len * blk;
    var ab = new ArrayBuffer(44 + ds);
    var v = new DataView(ab);
    function wr(o, s) { for (var i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); }
    wr(0, 'RIFF'); v.setUint32(4, 36 + ds, true);
    wr(8, 'WAVE'); wr(12, 'fmt ');
    v.setUint32(16, 16, true); v.setUint16(20, 1, true);
    v.setUint16(22, nc, true); v.setUint32(24, sr, true);
    v.setUint32(28, sr * blk, true); v.setUint16(32, blk, true);
    v.setUint16(34, 16, true); wr(36, 'data'); v.setUint32(40, ds, true);
    var off = 44;
    for (var i = 0; i < len; i++) {
      for (var ch = 0; ch < nc; ch++) {
        var s = buf.getChannelData(ch)[i];
        if (s > 1) s = 1; if (s < -1) s = -1;
        v.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
        off += 2;
      }
    }
    return new Blob([ab], { type: 'audio/wav' });
  }

  function envelope(buf, res) {
    var ch = buf.getChannelData(0);
    var step = Math.max(1, (ch.length / res) | 0);
    var out = new Float32Array(res);
    for (var i = 0; i < res; i++) {
      var mx = 0, s = i * step;
      for (var j = 0; j < step && s + j < ch.length; j++) {
        var a = ch[s + j]; if (a < 0) a = -a;
        if (a > mx) mx = a;
      }
      out[i] = mx;
    }
    return out;
  }

  function rms(buf) {
    var ch = buf.getChannelData(0), sum = 0;
    for (var i = 0; i < ch.length; i++) sum += ch[i] * ch[i];
    return Math.sqrt(sum / ch.length);
  }

  var playNode = null, playCtx = null, _which = null;

  window.AP = {
    raw: null, processed: null, fname: 'audio',

    load: async function (file) {
      this.fname = file.name.replace(/\.[^.]+$/, '');
      var ab = await readFile(file);
      var ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.raw = await decode(ctx, ab);
      await ctx.close();
      this.processed = null;
    },

    process: async function (p) {
      if (!this.raw) return;
      this.processed = await run(this.raw, p);
    },

    download: function () {
      if (!this.processed) return;
      var blob = toWAV(this.processed);
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url; a.download = this.fname + '_filtrado.wav';
      document.body.appendChild(a); a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
    },

    play: function (which) {
      var wasWhich = _which;
      if (playNode) {
        try { playNode.stop(); } catch (e) {}
        playNode = null; _which = null;
        if (playCtx) { playCtx.close(); playCtx = null; }
      }
      if (!which || wasWhich === which) return false;
      var buf = which === 'raw' ? this.raw : this.processed;
      if (!buf) return false;
      playCtx = new (window.AudioContext || window.webkitAudioContext)();
      playNode = playCtx.createBufferSource();
      playNode.buffer = buf;
      playNode.connect(playCtx.destination);
      playNode.start(0);
      _which = which;
      playNode.onended = function () {
        playNode = null; _which = null;
        if (playCtx) { playCtx.close(); playCtx = null; }
        document.getElementById('btn-play-raw').classList.remove('on');
        document.getElementById('btn-play-proc').classList.remove('on');
      };
      return true;
    },

    getWaveform: function (which, res) {
      var buf = which === 'raw' ? this.raw : this.processed;
      return buf ? envelope(buf, res) : null;
    },

    getRMS: function (which) {
      var buf = which === 'raw' ? this.raw : this.processed;
      return buf ? rms(buf) : 0;
    },

    info: function () {
      if (!this.raw) return null;
      return { sr: this.raw.sampleRate, ch: this.raw.numberOfChannels, dur: this.raw.duration };
    },

    ready: function () { return !!this.raw; },
    tSin: tSin
  };
})();
