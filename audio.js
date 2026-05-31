(function () {

  var TWO_PI = 6.283185307179586;

  function taylorSin(x, n) {
    x = x - TWO_PI * Math.floor((x + Math.PI) / TWO_PI);
    var t = x, s = x;
    for (var i = 1; i < n; i++) {
      t *= -(x * x) / ((2 * i) * (2 * i + 1));
      s += t;
    }
    return s;
  }

  function buildWaveCurve(terms) {
    var len = 4096, curve = new Float32Array(len), PI2 = Math.PI / 2;
    var ref = taylorSin(PI2, terms);
    if (Math.abs(ref) < 1e-9) ref = 1;
    for (var i = 0; i < len; i++) {
      var x = (i * 2 / (len - 1)) - 1;
      curve[i] = Math.max(-1, Math.min(1, taylorSin(x * PI2, terms) / ref));
    }
    return curve;
  }

  function trapSmooth(data, win) {
    if (win < 2) return data;
    var out = new Float32Array(data.length), h = win >> 1, L = data.length;
    for (var i = 0; i < L; i++) {
      var a = Math.max(0, i - h), b = Math.min(L - 1, i + h), n = b - a;
      if (!n) { out[i] = data[i]; continue; }
      var area = data[a] + data[b];
      for (var j = a + 1; j < b; j++) area += 2 * data[j];
      out[i] = area / (2 * n);
    }
    return out;
  }

  async function processAudio(raw, p) {
    var nc = raw.numberOfChannels, sr = raw.sampleRate, len = raw.length;
    var oc = new OfflineAudioContext(nc, len, sr);
    var src = oc.createBufferSource();
    src.buffer = raw;

    var gainIn = oc.createGain();
    gainIn.gain.value = p.volumen;

    var hp = oc.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 28; hp.Q.value = 0.65;

    var fGraves = oc.createBiquadFilter();
    fGraves.type = 'lowshelf'; fGraves.frequency.value = 100; fGraves.gain.value = p.graves;

    var fBajos = oc.createBiquadFilter();
    fBajos.type = 'peaking'; fBajos.frequency.value = 260; fBajos.Q.value = 0.9; fBajos.gain.value = p.bajos;

    var fPresencia = oc.createBiquadFilter();
    fPresencia.type = 'peaking'; fPresencia.frequency.value = 3200; fPresencia.Q.value = 1.1; fPresencia.gain.value = p.agudos * 0.45;

    var fAgudos = oc.createBiquadFilter();
    fAgudos.type = 'highshelf'; fAgudos.frequency.value = 8500; fAgudos.gain.value = p.agudos;

    var lp = oc.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = Math.min(p.frecuencia, sr / 2 - 100);
    lp.Q.value = Math.max(0.1, Math.min(20, p.ventana));

    var ws = oc.createWaveShaper();
    ws.curve = buildWaveCurve(p.taylor);
    ws.oversample = '4x';

    var comp = oc.createDynamicsCompressor();
    comp.threshold.value = -20; comp.knee.value = 12;
    comp.ratio.value = 3.5; comp.attack.value = 0.002; comp.release.value = 0.12;

    var gainOut = oc.createGain();
    gainOut.gain.value = 1.15;

    src.connect(gainIn); gainIn.connect(hp); hp.connect(fGraves);
    fGraves.connect(fBajos); fBajos.connect(fPresencia); fPresencia.connect(fAgudos);
    fAgudos.connect(lp); lp.connect(ws); ws.connect(comp); comp.connect(gainOut);
    gainOut.connect(oc.destination);
    src.start(0);

    var rendered = await oc.startRendering();

    for (var ch = 0; ch < rendered.numberOfChannels; ch++) {
      var data = new Float32Array(rendered.getChannelData(ch));
      if (p.ruido > 0) {
        var thr = p.ruido * 0.0007;
        for (var i = 0; i < data.length; i++) {
          var ab = Math.abs(data[i]);
          if (ab < thr) data[i] *= (ab / thr) * (ab / thr);
        }
      }
      if (p.suavizado > 1) data = trapSmooth(data, p.suavizado);
      rendered.copyToChannel(data, ch);
    }
    return rendered;
  }

  function toWAV(buf) {
    var nc = buf.numberOfChannels, sr = buf.sampleRate, len = buf.length;
    var blk = nc * 2, ds = len * blk, ab = new ArrayBuffer(44 + ds), v = new DataView(ab);
    function wr(o, s) { for (var i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); }
    wr(0,'RIFF'); v.setUint32(4,36+ds,true); wr(8,'WAVE'); wr(12,'fmt ');
    v.setUint32(16,16,true); v.setUint16(20,1,true); v.setUint16(22,nc,true);
    v.setUint32(24,sr,true); v.setUint32(28,sr*blk,true); v.setUint16(32,blk,true);
    v.setUint16(34,16,true); wr(36,'data'); v.setUint32(40,ds,true);
    var off = 44;
    for (var i = 0; i < len; i++) {
      for (var ch = 0; ch < nc; ch++) {
        var s = buf.getChannelData(ch)[i];
        s = s > 1 ? 1 : s < -1 ? -1 : s;
        v.setInt16(off, s < 0 ? s*0x8000 : s*0x7FFF, true); off += 2;
      }
    }
    return new Blob([ab], { type: 'audio/wav' });
  }

  function envelope(buf, res) {
    var ch = buf.getChannelData(0), step = Math.max(1, (ch.length / res) | 0), out = new Float32Array(res);
    for (var i = 0; i < res; i++) {
      var mx = 0, s = i * step;
      for (var j = 0; j < step && s + j < ch.length; j++) {
        var a = Math.abs(ch[s+j]); if (a > mx) mx = a;
      }
      out[i] = mx;
    }
    return out;
  }

  function rms(buf) {
    var ch = buf.getChannelData(0), sum = 0;
    for (var i = 0; i < ch.length; i++) sum += ch[i]*ch[i];
    return Math.sqrt(sum / ch.length);
  }

  /* player state */
  var players = {};

  function PlayerState() {
    this.ctx = null; this.node = null;
    this.startTime = 0; this.offset = 0;
    this.playing = false; this.buf = null;
  }

  PlayerState.prototype.play = function (offset) {
    this.stop();
    if (!this.buf) return;
    offset = Math.max(0, Math.min(this.buf.duration, offset || 0));
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.node = this.ctx.createBufferSource();
    this.node.buffer = this.buf;
    this.node.connect(this.ctx.destination);
    this.node.start(0, offset);
    this.offset = offset;
    this.startTime = this.ctx.currentTime;
    this.playing = true;
    var self = this;
    this.node.onended = function () {
      self.playing = false; self.offset = 0;
      if (self.ctx) { self.ctx.close(); self.ctx = null; }
    };
  };

  PlayerState.prototype.stop = function () {
    if (this.node) { try { this.node.stop(); } catch(e){} this.node = null; }
    if (this.ctx) { this.ctx.close(); this.ctx = null; }
    this.playing = false;
  };

  PlayerState.prototype.toggle = function () {
    if (this.playing) { this.stop(); } else { this.play(0); }
  };

  PlayerState.prototype.seek = function (ratio) {
    var wasPlaying = this.playing;
    this.stop();
    if (wasPlaying && this.buf) this.play(ratio * this.buf.duration);
    else this.offset = ratio * (this.buf ? this.buf.duration : 0);
  };

  PlayerState.prototype.currentPos = function () {
    if (!this.buf) return 0;
    if (!this.playing || !this.ctx) return this.offset / this.buf.duration;
    var elapsed = this.ctx.currentTime - this.startTime;
    return Math.min(1, (this.offset + elapsed) / this.buf.duration);
  };

  PlayerState.prototype.currentTime = function () {
    if (!this.buf) return 0;
    return this.currentPos() * this.buf.duration;
  };

  players.raw  = new PlayerState();
  players.proc = new PlayerState();

  window.AP = {
    raw: null, processed: null, fname: 'audio',
    players: players,

    load: async function (file) {
      this.fname = file.name.replace(/\.[^.]+$/, '');
      var ab = await new Promise(function(res,rej){ var r=new FileReader(); r.onload=function(e){res(e.target.result);}; r.onerror=rej; r.readAsArrayBuffer(file); });
      var ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.raw = await new Promise(function(res,rej){ ctx.decodeAudioData(ab,res,rej); });
      await ctx.close();
      players.raw.buf = this.raw;
      players.raw.stop(); players.raw.offset = 0;
      this.processed = null;
      players.proc.buf = null;
    },

    process: async function (p) {
      if (!this.raw) return;
      players.proc.stop();
      this.processed = await processAudio(this.raw, p);
      players.proc.buf = this.processed;
    },

    download: function () {
      if (!this.processed) return;
      var blob = toWAV(this.processed);
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url; a.download = this.fname + '_minnt.wav';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(function(){ URL.revokeObjectURL(url); }, 2000);
    },

    getEnvelope: function (which, res) {
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
    taylorSin: taylorSin
  };

})();
