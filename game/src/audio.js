/* COBALT HEAT — procedural WebAudio.
   All sound is synthesized; there are no sample files and no network requests. */
(function () {
  'use strict';

  var CH = window.CH = window.CH || {};

  function AudioSystem() {
    this.ctx = null;
    this.master = null;
    this.engineOsc = null;
    this.engineGain = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.muted = false;
    this.ready = false;
    this.station = 0;
    this.musicTimer = 0;
    this.chordIndex = 0;
  }

  AudioSystem.prototype.unlock = function () {
    if (this.ready) {
      if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      this.ctx = new AC();
    } catch (e) { return; }
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.34;
    this.master.connect(this.ctx.destination);
    this.ready = true;
    this.buildEngine();
    this.buildSiren();
    this.startMusic();
  };

  AudioSystem.prototype.buildEngine = function () {
    if (!this.ctx) return;
    var osc = this.ctx.createOscillator();
    var gain = this.ctx.createGain();
    var filter = this.ctx.createBiquadFilter();
    osc.type = 'sawtooth';
    osc.frequency.value = 58;
    filter.type = 'lowpass';
    filter.frequency.value = 220;
    gain.gain.value = 0;
    osc.connect(filter); filter.connect(gain); gain.connect(this.master);
    osc.start();
    this.engineOsc = osc;
    this.engineGain = gain;
    this.engineFilter = filter;
  };

  AudioSystem.prototype.buildSiren = function () {
    if (!this.ctx) return;
    var osc = this.ctx.createOscillator();
    var gain = this.ctx.createGain();
    var lfo = this.ctx.createOscillator();
    var lfoGain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = 660;
    lfo.frequency.value = 1.8;
    lfoGain.gain.value = 210;
    lfo.connect(lfoGain); lfoGain.connect(osc.frequency);
    gain.gain.value = 0;
    osc.connect(gain); gain.connect(this.master);
    osc.start(); lfo.start();
    this.sirenOsc = osc;
    this.sirenGain = gain;
  };

  AudioSystem.prototype.tone = function (freq, duration, type, volume, slideTo) {
    if (!this.ready || this.muted) return;
    var t = this.ctx.currentTime;
    var osc = this.ctx.createOscillator();
    var gain = this.ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + duration);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(volume || 0.08, t + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(gain); gain.connect(this.master);
    osc.start(t); osc.stop(t + duration + 0.03);
  };

  AudioSystem.prototype.noise = function (duration, volume, cutoff, highpass) {
    if (!this.ready || this.muted) return;
    var t = this.ctx.currentTime;
    var len = Math.floor(this.ctx.sampleRate * duration);
    var buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    var data = buffer.getChannelData(0);
    for (var i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    var src = this.ctx.createBufferSource();
    src.buffer = buffer;
    var filter = this.ctx.createBiquadFilter();
    filter.type = highpass ? 'highpass' : 'lowpass';
    filter.frequency.value = cutoff || 1200;
    var gain = this.ctx.createGain();
    gain.gain.value = volume || 0.15;
    src.connect(filter); filter.connect(gain); gain.connect(this.master);
    src.start(t);
  };

  AudioSystem.prototype.shot = function (kind) {
    if (kind === 'shotgun') {
      this.noise(0.34, 0.32, 900);
      this.tone(72, 0.28, 'square', 0.15, 38);
    } else if (kind === 'smg') {
      this.noise(0.09, 0.16, 2100);
      this.tone(155, 0.06, 'square', 0.06, 90);
    } else if (kind === 'pistol') {
      this.noise(0.14, 0.2, 1800);
      this.tone(110, 0.1, 'square', 0.08, 55);
    } else {
      this.noise(0.07, 0.08, 900);
    }
  };

  AudioSystem.prototype.impact = function (metal) {
    this.noise(0.09, metal ? 0.09 : 0.06, metal ? 2800 : 700, metal);
    if (metal) this.tone(880, 0.08, 'triangle', 0.035, 440);
  };

  AudioSystem.prototype.pickup = function () {
    this.tone(740, 0.1, 'triangle', 0.08);
    var self = this;
    setTimeout(function () { self.tone(1108, 0.16, 'triangle', 0.07); }, 75);
  };

  AudioSystem.prototype.cash = function () {
    this.tone(880, 0.07, 'sine', 0.06);
    this.tone(1320, 0.11, 'sine', 0.05);
  };

  AudioSystem.prototype.horn = function () {
    this.tone(392, 0.35, 'square', 0.055);
    this.tone(494, 0.35, 'square', 0.04);
  };

  AudioSystem.prototype.reload = function () {
    this.noise(0.04, 0.06, 3000, true);
    var self = this;
    setTimeout(function () { self.noise(0.05, 0.07, 2200, true); }, 170);
  };

  AudioSystem.prototype.ui = function () {
    this.tone(520, 0.06, 'sine', 0.04, 660);
  };

  AudioSystem.prototype.stinger = function (good) {
    if (good) {
      this.tone(392, 0.3, 'triangle', 0.08);
      var self = this;
      setTimeout(function () { self.tone(523, 0.3, 'triangle', 0.08); }, 150);
      setTimeout(function () { self.tone(659, 0.5, 'triangle', 0.07); }, 310);
    } else {
      this.tone(180, 0.4, 'sawtooth', 0.07, 90);
    }
  };

  AudioSystem.prototype.setEngine = function (active, speed) {
    if (!this.ready || !this.engineGain) return;
    var t = this.ctx.currentTime;
    var target = active ? 0.035 + Math.min(Math.abs(speed) / 48, 1) * 0.055 : 0;
    this.engineGain.gain.setTargetAtTime(target, t, 0.12);
    this.engineOsc.frequency.setTargetAtTime(44 + Math.abs(speed) * 2.2, t, 0.2);
    if (this.engineFilter) this.engineFilter.frequency.setTargetAtTime(180 + Math.abs(speed) * 18, t, 0.2);
  };

  AudioSystem.prototype.setSiren = function (active) {
    if (!this.ready || !this.sirenGain) return;
    var t = this.ctx.currentTime;
    this.sirenGain.gain.setTargetAtTime(active && !this.muted ? 0.025 : 0, t, 0.3);
  };

  AudioSystem.prototype.startMusic = function () {
    if (!this.ready) return;
    this.musicTimer = 0;
    this.playChord();
  };

  AudioSystem.prototype.playChord = function () {
    if (!this.ready || this.muted) return;
    var chords = [
      [130.81, 164.81, 196.0, 293.66],
      [110.0, 138.59, 164.81, 246.94],
      [146.83, 174.61, 220.0, 349.23],
      [98.0, 123.47, 146.83, 220.0]
    ];
    var chord = chords[this.chordIndex % chords.length];
    this.chordIndex++;
    var t = this.ctx.currentTime;
    for (var i = 0; i < chord.length; i++) {
      var osc = this.ctx.createOscillator();
      var gain = this.ctx.createGain();
      var filter = this.ctx.createBiquadFilter();
      osc.type = i === 0 ? 'sine' : 'triangle';
      osc.frequency.value = chord[i];
      filter.type = 'lowpass';
      filter.frequency.value = 900;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.linearRampToValueAtTime(0.012, t + 1.4);
      gain.gain.linearRampToValueAtTime(0.0001, t + 6.5);
      osc.connect(filter); filter.connect(gain); gain.connect(this.master);
      osc.start(t); osc.stop(t + 6.7);
    }
  };

  AudioSystem.prototype.update = function (dt) {
    if (!this.ready) return;
    this.musicTimer += dt;
    if (this.musicTimer > 7.2) {
      this.musicTimer = 0;
      this.playChord();
    }
  };

  AudioSystem.prototype.toggleMute = function () {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.34;
    return this.muted;
  };

  AudioSystem.prototype.nextStation = function () {
    this.station = (this.station + 1) % CH.CONFIG.RADIO.length;
    this.ui();
    return CH.CONFIG.RADIO[this.station];
  };

  CH.Audio = AudioSystem;
}());
