// 众生镇 · 居民魂体：单批次粒子点云（情绪形变 / 呼吸 / 拖尾）
import * as THREE from 'three';
import { CFG } from './config.js';

const EMO = {
  calm:  { stretch: 1.0,  widen: 1.0,  bright: 1.0,  tint: 0x000000, tintK: 0.0,  jit: 0.05, speed: 6 },
  happy: { stretch: 1.12, widen: 1.08, bright: 1.3,  tint: 0xffe2a8, tintK: 0.3,  jit: 0.10, speed: 8 },
  sad:   { stretch: 0.9,  widen: 0.86, bright: 0.5,  tint: 0x4455aa, tintK: 0.45, jit: 0.04, speed: 3.5 },
  angry: { stretch: 1.05, widen: 1.32, bright: 1.35, tint: 0xff4422, tintK: 0.55, jit: 0.24, speed: 11 },
  fear:  { stretch: 0.85, widen: 0.8,  bright: 0.75, tint: 0x66aaff, tintK: 0.42, jit: 0.2,  speed: 10 },
  love:  { stretch: 1.18, widen: 1.04, bright: 1.35, tint: 0xff8fb0, tintK: 0.5,  jit: 0.06, speed: 6 },
  sleep: { stretch: 0.72, widen: 1.14, bright: 0.38, tint: 0x334466, tintK: 0.5,  jit: 0.03, speed: 2 },
  awed:  { stretch: 1.4,  widen: 0.85, bright: 1.25, tint: 0xcfe0ff, tintK: 0.35, jit: 0.05, speed: 5 },
};

export class Spirits {
  constructor(scene, agents, quality) {
    this.agents = agents;
    const N = agents.length, P = quality === 'high' ? CFG.SPIRIT_P : 40;
    this.N = N; this.P = P;
    const total = N * P;
    this.total = total;

    this.pos = new Float32Array(total * 3);
    this.col = new Float32Array(total * 3);
    this.size = new Float32Array(total);
    this.off = new Float32Array(total * 3);      // 魂体局部形状
    this.ph = new Float32Array(total);
    this.spd = new Float32Array(total);
    this.vis = agents.map(() => ({ sc: 1, stretch: 1, widen: 1, bright: 1, r: 0, g: 0, b: 0, jit: 0.05, speed: 6 }));

    // 泪滴状魂簇
    for (let s = 0; s < N; s++) {
      for (let i = 0; i < P; i++) {
        const id = s * P + i;
        const t = (i + 0.5) / P;
        const a = i * 2.399963;  // 黄金角
        const prof = Math.pow(Math.sin(Math.min(t * 1.15, 1) * Math.PI), 0.65) * (1 - t * 0.3);
        const rr = prof * (0.38 + 0.34 * Math.sqrt(t));
        const y = (t - 0.42) * 1.55;
        const x = Math.cos(a) * rr, z = Math.sin(a) * rr;
        this.off[id * 3] = x; this.off[id * 3 + 1] = y; this.off[id * 3 + 2] = z;
        this.ph[id] = Math.sqrt(t * 7.13 + s * 3.7) % 6.283;
        this.spd[id] = 4 + ((i * 2654435761 >>> 0) % 100) / 100 * 7;
        // 核心粒子更大更亮
        this.size[id] = i < 5 ? 0.95 + Math.random() * 0.2 : 0.34 + Math.sqrt(t) * 0.42;
        // 初始位置在出生点
        this.pos[id * 3] = agents[s].p.x; this.pos[id * 3 + 1] = agents[s].p.y; this.pos[id * 3 + 2] = agents[s].p.z;
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
    this.uni = { uPR: { value: Math.min(devicePixelRatio, 2) }, uTime: { value: 0 } };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uni, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: `
        attribute vec3 aColor; attribute float aSize;
        uniform float uPR;
        varying vec3 vC;
        void main(){
          vC = aColor;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * uPR * (620.0 / max(-mv.z, 1.0));
          gl_PointSize = min(gl_PointSize, 90.0 * uPR);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        varying vec3 vC;
        void main(){
          vec2 uv = gl_PointCoord - 0.5;
          float d = length(uv);
          float a = smoothstep(0.5, 0.06, d);
          a = a * a * (0.55 + 0.45 * smoothstep(0.5, 0.0, d));
          gl_FragColor = vec4(vC * (0.75 + 0.5 * a), a);
        }`,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    scene.add(this.points);
  }

  update(dt, timeSec) {
    const { N, P } = this;
    for (let s = 0; s < N; s++) {
      const ag = this.agents[s], v = this.vis[s];
      const e = EMO[ag.emotion] || EMO.calm;
      // 平滑过渡
      const L = (a, b, r = 4) => a + (b - a) * Math.min(1, dt * r);
      v.sc = L(v.sc, ag.scale);
      v.stretch = L(v.stretch, e.stretch);
      v.widen = L(v.widen, e.widen);
      v.bright = L(v.bright, e.bright * (ag.talking ? 1.3 : 1) * (ag.blessed > 0 ? 1.5 : 1), 3);
      v.jit = L(v.jit, e.jit);
      v.speed = L(v.speed, e.speed);
      const tint = e.tintK * (e.tint ? 1 : 0);
      v.r = L(v.r, (ag.baseColor.r * (1 - tint) + ((e.tint >> 16 & 255) / 255) * tint) * v.bright, 5);
      v.g = L(v.g, (ag.baseColor.g * (1 - tint) + ((e.tint >> 8 & 255) / 255) * tint) * v.bright, 5);
      v.b = L(v.b, (ag.baseColor.b * (1 - tint) + ((e.tint & 255) / 255) * tint) * v.bright, 5);

      const breathe = 1 + Math.sin(timeSec * 2.1 + s * 1.7) * 0.045;
      const sc = v.sc * breathe;
      const px = ag.p.x, py = ag.p.y, pz = ag.p.z;
      const faceA = ag.faceA || 0;
      const wob = 1 + Math.sin(timeSec * 3.7 + s) * 0.06;

      for (let i = 0; i < P; i++) {
        const id = s * P + i;
        const ox = this.off[id * 3], oy = this.off[id * 3 + 1], oz = this.off[id * 3 + 2];
        const ph = this.ph[id];
        const j = v.jit;
        const jx = Math.sin(timeSec * 5.1 + ph * 13.0) * j;
        const jy = Math.cos(timeSec * 4.3 + ph * 17.0) * j;
        const jz = Math.sin(timeSec * 4.7 + ph * 11.0) * j;
        // 朝向 + 情绪拉伸
        const ca = Math.cos(faceA), sa = Math.sin(faceA);
        const lx = (ox * ca + oz * sa) * v.widen * sc * wob;
        const lz = (-ox * sa + oz * ca) * v.widen * sc * wob;
        const ly = oy * v.stretch * sc;
        const tx = px + lx + jx, ty = py + ly + jy, tz = pz + lz + jz;
        const k = Math.min(1, dt * this.spd[id] * (0.75 + 0.25 * Math.sin(ph * 3.1)));
        this.pos[id * 3] += (tx - this.pos[id * 3]) * k;
        this.pos[id * 3 + 1] += (ty - this.pos[id * 3 + 1]) * k;
        this.pos[id * 3 + 2] += (tz - this.pos[id * 3 + 2]) * k;
        this.col[id * 3] = v.r; this.col[id * 3 + 1] = v.g; this.col[id * 3 + 2] = v.b;
        const baseS = i < 5 ? 1.0 : 0.34 + Math.sqrt((i + 0.5) / P) * 0.42;
        this.size[id] = baseS * (0.75 + 0.25 * v.sc) * (0.65 + 0.35 * v.bright);
      }
    }
    const geo = this.points.geometry;
    geo.attributes.position.needsUpdate = true;
    geo.attributes.aColor.needsUpdate = true;
    geo.attributes.aSize.needsUpdate = true;
    this.uni.uTime.value = timeSec;
  }
}
