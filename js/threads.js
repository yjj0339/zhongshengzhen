// 众生镇 · 关系光丝：情谊金线 / 谣言红脉冲
import * as THREE from 'three';

const SEGS = 10;   // 每根丝的段数

export class Threads {
  constructor(scene, agents, quality) {
    this.agents = agents;
    this.max = quality === 'high' ? 34 : 20;
    const verts = this.max * SEGS * 2;
    this.pos = new Float32Array(verts * 3);
    this.col = new Float32Array(verts * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: `attribute vec3 color; varying vec3 vC; varying float vT;
        void main(){ vC = color; vec4 mv = modelViewMatrix * vec4(position,1.); vT = clamp(220.0 / max(-mv.z, 1.0), 0.0, 1.6); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `varying vec3 vC; varying float vT;
        void main(){ gl_FragColor = vec4(vC * (0.5 + 0.5 * vT), min(vT, 1.0) * 0.85); }`,
    });
    this.lines = new THREE.LineSegments(geo, mat);
    this.lines.frustumCulled = false;
    this.lines.renderOrder = 6;
    scene.add(this.lines);
    this.pulses = [];   // {a,b,t,color} 谣言/事件脉冲
  }

  // 发一枚脉冲（谣言 / 事件）
  pulse(a, b, color) {
    if (this.pulses.length > 14) this.pulses.shift();
    this.pulses.push({ ai: a.id, bi: b.id, t: 0, color });
  }

  update(dt, timeSec) {
    const ags = this.agents;
    // 选出最强的关系对
    const pairs = [];
    for (let i = 0; i < ags.length; i++) {
      for (const [j, aff] of ags[i].affinity) {
        if (j <= i) continue;
        const o = ags.find(x => x.id === j);
        if (!o) continue;
        const d = ags[i].p.distanceTo(o.p);
        if (d > 90) continue;
        pairs.push({ a: ags[i], b: o, w: aff });
      }
    }
    pairs.sort((x, y) => y.w - x.w);
    const top = pairs.slice(0, this.max);
    let vi = 0;
    const put = (x, y, z, r, g, bl) => { this.pos[vi] = x; this.pos[vi + 1] = y; this.pos[vi + 2] = z; this.col[vi] = r; this.col[vi + 1] = g; this.col[vi + 2] = bl; vi += 3; };
    for (const pr of top) {
      const { a, b, w } = pr;
      const strength = Math.min(1, Math.max(0, w / 60));
      const warm = w >= 0;
      const baseR = warm ? 1.0 : 1.0, baseG = warm ? 0.72 : 0.3, baseB = warm ? 0.35 : 0.3;
      const alpha = 0.1 + strength * 0.55;
      // 悬链弧线
      const mx = (a.p.x + b.p.x) / 2, mz = (a.p.z + b.p.z) / 2;
      const sag = a.p.distanceTo(b.p) * 0.12;
      for (let s = 0; s < SEGS; s++) {
        const t0 = s / SEGS, t1 = (s + 1) / SEGS;
        const wave = Math.sin(timeSec * 2.2 + s * 0.9 + a.id) * 0.12;
        const pt = (t) => {
          const x = a.p.x + (b.p.x - a.p.x) * t;
          const z = a.p.z + (b.p.z - a.p.z) * t;
          const y = a.p.y + (b.p.y - a.p.y) * t - Math.sin(t * Math.PI) * sag + wave * Math.sin(t * Math.PI);
          return [x, y, z];
        };
        const [x0, y0, z0] = pt(t0), [x1, y1, z1] = pt(t1);
        const g0 = alpha * Math.sin(t0 * Math.PI) * 0.9 + 0.06, g1 = alpha * Math.sin(t1 * Math.PI) * 0.9 + 0.06;
        put(x0, y0, z0, baseR * g0, baseG * g0, baseB * g0);
        put(x1, y1, z1, baseR * g1, baseG * g1, baseB * g1);
      }
    }
    // 脉冲（谣言传播）
    for (let i = this.pulses.length - 1; i >= 0; i--) {
      const pl = this.pulses[i];
      pl.t += dt * 0.9;
      if (pl.t >= 1) { this.pulses.splice(i, 1); continue; }
      const a = ags.find(x => x.id === pl.ai), b = ags.find(x => x.id === pl.bi);
      if (!a || !b) continue;
      const head = pl.t;
      for (let s = 0; s < SEGS; s++) {
        const t0 = s / SEGS, t1 = (s + 1) / SEGS;
        const glow = (t) => {
          const d = Math.abs(t - head);
          return Math.max(0, 1 - d * 6);
        };
        const g0 = glow(t0), g1 = glow(t1);
        if (g0 <= 0 && g1 <= 0) continue;
        const x0 = a.p.x + (b.p.x - a.p.x) * t0, y0 = a.p.y + (b.p.y - a.p.y) * t0, z0 = a.p.z + (b.p.z - a.p.z) * t0;
        const x1 = a.p.x + (b.p.x - a.p.x) * t1, y1 = a.p.y + (b.p.y - a.p.y) * t1, z1 = a.p.z + (b.p.z - a.p.z) * t1;
        put(x0, y0, z0, pl.color[0] * g0, pl.color[1] * g0, pl.color[2] * g0);
        put(x1, y1, z1, pl.color[0] * g1, pl.color[1] * g1, pl.color[2] * g1);
      }
    }
    // 剩余槽位置零（不绘制）
    for (; vi < this.pos.length; vi += 3) { this.pos[vi] = 0; this.pos[vi + 1] = -999; this.pos[vi + 2] = 0; }
    const geo = this.lines.geometry;
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
  }
}
