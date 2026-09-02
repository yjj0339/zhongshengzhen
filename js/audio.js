// 众生镇 · 轻音效（WebAudio 合成，无素材）
import { bus, G } from './config.js';

export class AudioCtl {
  constructor() {
    this.on = localStorage.getItem('zz_audio') !== '0';
    this.ctx = null;
    this.started = false;
    bus.on('audio', (k) => { if (k === 'festival') this.bells(); if (k === 'oracle') this.chime(); });
  }

  start() {
    if (this.started) return;
    this.started = true;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      const c = this.ctx;
      this.master = c.createGain();
      this.master.gain.value = this.on ? 0.5 : 0;
      this.master.connect(c.destination);
      // 风声：低通噪声
      const buf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      const wind = c.createBufferSource();
      wind.buffer = buf; wind.loop = true;
      const wf = c.createBiquadFilter(); wf.type = 'lowpass'; wf.frequency.value = 320; wf.Q.value = 0.6;
      this.windGain = c.createGain(); this.windGain.gain.value = 0.05;
      wind.connect(wf); wf.connect(this.windGain); this.windGain.connect(this.master);
      wind.start();
      // 蟋蟀：夜间脉冲
      this.cricketTimer = setInterval(() => {
        if (!this.on || !this.ctx) return;
        if (G.time.t < 0.8 && G.time.t > 0.25) return;
        if (Math.random() < 0.5) return;
        const t = c.currentTime;
        const o = c.createOscillator(), g = c.createGain();
        o.type = 'sine'; o.frequency.value = 3800 + Math.random() * 700;
        const lfo = c.createOscillator(), lg = c.createGain();
        lfo.frequency.value = 24; lg.gain.value = 0.5;
        lfo.connect(lg); lg.connect(g.gain);
        g.gain.value = 0.012;
        o.connect(g); g.connect(this.master);
        o.start(t); o.stop(t + 0.25); lfo.start(t); lfo.stop(t + 0.25);
      }, 900);
    } catch (e) { /* 音频不可用则静默 */ }
  }

  chime() {
    if (!this.ctx || !this.on) return;
    const c = this.ctx, t = c.currentTime;
    [880, 1320].forEach((f, i) => {
      const o = c.createOscillator(), g = c.createGain();
      o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(0.06, t + i * 0.09);
      g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.09 + 0.9);
      o.connect(g); g.connect(this.master);
      o.start(t + i * 0.09); o.stop(t + i * 0.09 + 1);
    });
  }

  bells() {
    if (!this.ctx || !this.on) return;
    const c = this.ctx, t = c.currentTime;
    const notes = [523, 659, 784, 659, 880, 784];
    notes.forEach((f, i) => {
      const o = c.createOscillator(), g = c.createGain();
      o.type = 'triangle'; o.frequency.value = f;
      g.gain.setValueAtTime(0.05, t + i * 0.22);
      g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.22 + 0.8);
      o.connect(g); g.connect(this.master);
      o.start(t + i * 0.22); o.stop(t + i * 0.22 + 0.9);
    });
  }

  toggle() {
    this.on = !this.on;
    localStorage.setItem('zz_audio', this.on ? '1' : '0');
    if (this.master) this.master.gain.value = this.on ? 0.5 : 0;
    return this.on;
  }
}
