// 众生镇 · 居民魂体：粒子小人（头/躯干/四肢骨架，走路摆臂，情绪姿态）
import * as THREE from 'three';
import { CFG } from './config.js';

// 情绪 → 姿态参数：手臂基础角 / 头部下沉 / 步幅倍率 / 颜色亮度 / 色调
const EMO = {
  calm:  { arm: 0,     head: 0,    spd: 1,   bright: 1.0,  tint: 0x000000, tintK: 0,   jit: 0.012 },
  happy: { arm: -2.35, head: 0.03, spd: 1.5, bright: 1.15, tint: 0xffd27a, tintK: 0.18, jit: 0.03 },
  sad:   { arm: 0.15,  head: -0.14, spd: 0.55, bright: 0.72, tint: 0x5a6ac8, tintK: 0.3, jit: 0.008 },
  angry: { arm: 0.9,   head: 0,    spd: 1.7, bright: 1.2,  tint: 0xff4422, tintK: 0.4,  jit: 0.05 },
  fear:  { arm: -2.8,  head: 0.05, spd: 1.9, bright: 0.95, tint: 0x4488ff, tintK: 0.3,  jit: 0.04 },
  love:  { arm: -0.5,  head: 0,    spd: 1.1, bright: 1.2,  tint: 0xff8fb0, tintK: 0.3,  jit: 0.015 },
  sleep: { arm: 0,     head: 0,    spd: 0,   bright: 0.5,  tint: 0x8898c8, tintK: 0.25, jit: 0.005 },
  awed:  { arm: 0.1,   head: -0.08, spd: 0.4, bright: 1.1,  tint: 0xcfe0ff, tintK: 0.2,  jit: 0.008 },
};

// 骨架定义：[x, y, z, group, size, pivotY, pivotZ, swingSign]
function buildSkeleton() {
  const S = [];
  const P = (x, y, z, g, s, py = 0, pz = 0, sw = 0) => S.push({ x, y, z, g, s, py, pz, sw });
  // 头（环 + 核心，pivot 在脖子），与肩膀留出颈距
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    P(Math.cos(a) * 0.15, 1.58 + Math.sin(a) * 0.02, Math.sin(a) * 0.11, 1, 0.24, 1.46, 0);
  }
  P(0, 1.6, 0.03, 1, 0.44, 1.46, 0);
  P(0, 1.46, 0, 1, 0.2, 1.46, 0);   // 脖颈
  // 脊柱与躯干
  P(0, 1.26, 0.015, 0, 0.26);
  P(-0.08, 1.18, 0.01, 0, 0.24); P(0.08, 1.18, 0.01, 0, 0.24);
  P(0, 1.05, 0.015, 0, 0.26);
  P(-0.09, 0.98, 0.01, 0, 0.24); P(0.09, 0.98, 0.01, 0, 0.24);
  P(0, 0.88, 0.012, 0, 0.25);
  P(-0.06, 0.82, 0.01, 0, 0.24); P(0.06, 0.82, 0.01, 0, 0.24);
  // 肩
  P(-0.17, 1.28, 0, 0, 0.26); P(0.17, 1.28, 0, 0, 0.26);
  // 左臂（pivot 肩 L），swing +1
  P(-0.19, 1.06, 0.02, 2, 0.23, -0.17, 1.28, 1);
  P(-0.22, 0.88, 0.03, 2, 0.21, -0.17, 1.28, 1);
  P(-0.23, 0.72, 0.04, 2, 0.24, -0.17, 1.28, 1);
  P(-0.21, 0.9, 0.035, 2, 0.2, -0.17, 1.28, 1);
  // 右臂，swing −1
  P(0.19, 1.06, 0.02, 3, 0.23, 0.17, 1.28, -1);
  P(0.22, 0.88, 0.03, 3, 0.21, 0.17, 1.28, -1);
  P(0.23, 0.72, 0.04, 3, 0.24, 0.17, 1.28, -1);
  P(0.21, 0.9, 0.035, 3, 0.2, 0.17, 1.28, -1);
  // 腿（pivot 髋），与同侧臂反相
  P(-0.07, 0.5, 0.01, 4, 0.23, -0.07, 0.78, -1);
  P(-0.075, 0.28, 0.015, 4, 0.21, -0.07, 0.78, -1);
  P(-0.08, 0.06, 0.02, 4, 0.24, -0.07, 0.78, -1);
  P(0.07, 0.5, 0.01, 5, 0.23, 0.07, 0.78, 1);
  P(0.075, 0.28, 0.015, 5, 0.21, 0.07, 0.78, 1);
  P(0.08, 0.06, 0.02, 5, 0.24, 0.07, 0.78, 1);
  // 灵光微粒
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.4;
    const r = 0.3 + (i % 3) * 0.08;
    P(Math.cos(a) * r, 0.7 + (i % 4) * 0.28, Math.sin(a) * r, 6, 0.13);
  }
  return S;
}

export class Spirits {
  constructor(scene, agents, quality) {
    this.agents = agents;
    this.S = buildSkeleton();
    const P = quality === 'high' ? this.S.length : Math.min(this.S.length, 40);
    const N = agents.length;
    this.N = N; this.P = P;
    const total = N * P;
    this.total = total;

    this.pos = new Float32Array(total * 3);
    this.col = new Float32Array(total * 3);
    this.size = new Float32Array(total);
    this.spd = new Float32Array(total);
    for (let i = 0; i < total; i++) this.spd[i] = 9 + (i * 2654435761 >>> 0) % 700 / 100;
    this.vis = agents.map(() => ({ bright: 1, r: 0.5, g: 0.5, b: 0.5 }));
    this.walkPhase = agents.map(() => Math.random() * 6.28);
    this.prevP = agents.map(a => a.p.clone());
    this.phase = agents.map(() => 0);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.uni = { uPR: { value: Math.min(devicePixelRatio, 2) } };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uni, transparent: true, depthWrite: false,
      vertexShader: `
        attribute vec3 aColor; attribute float aSize;
        uniform float uPR;
        varying vec3 vC;
        void main(){
          vC = aColor;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * uPR * (640.0 / max(-mv.z, 1.0));
          gl_PointSize = min(gl_PointSize, 110.0 * uPR);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        varying vec3 vC;
        void main(){
          vec2 uv = gl_PointCoord - 0.5;
          float d = length(uv);
          float a = smoothstep(0.5, 0.16, d);
          a = a * a;
          gl_FragColor = vec4(vC, a * 0.96);
        }`,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    scene.add(this.points);
  }

  update(dt, timeSec) {
    const { N, P, S } = this;
    for (let s = 0; s < N; s++) {
      const ag = this.agents[s], v = this.vis[s];
      const e = EMO[ag.emotion] || EMO.calm;

      // 移动速度 → 步频
      const moved = ag.p.distanceTo(this.prevP[s]);
      this.prevP[s].copy(ag.p);
      const speed = moved / Math.max(dt, 0.001);
      const walkAmp = Math.min(0.75, speed * 0.4) * e.spd;
      this.walkPhase[s] += dt * (2.5 + speed * 3.2) * (e.spd > 0 ? 1 : 0);
      this.phase[s] += dt;
      const ph = this.walkPhase[s];
      const swing = Math.sin(ph) * walkAmp;

      // 颜色缓变
      const L = (a, b, r = 5) => a + (b - a) * Math.min(1, dt * r);
      const tint = e.tintK, tk = e.tint;
      v.bright = L(v.bright, e.bright * (ag.talking ? 1.15 : 1) * (ag.blessed > 0 ? 1.35 : 1), 3);
      v.r = L(v.r, (ag.baseColor.r * (1 - tint) + ((tk >> 16 & 255) / 255) * tint) * v.bright);
      v.g = L(v.g, (ag.baseColor.g * (1 - tint) + ((tk >> 8 & 255) / 255) * tint) * v.bright);
      v.b = L(v.b, (ag.baseColor.b * (1 - tint) + ((tk & 255) / 255) * tint) * v.bright);

      const sc = ag.scale;
      const sleepK = ag.emotion === 'sleep' ? 1 : 0;
      const breathe = 1 + Math.sin(timeSec * 2.2 + s * 1.7) * 0.02;
      const bob = (ag.emotion === 'happy' ? Math.abs(Math.sin(timeSec * 5.2 + s)) * 0.1 : 0);
      const lean = Math.min(0.22, speed * 0.08) + (ag.emotion === 'sad' ? 0.1 : 0);
      const jit = e.jit;
      const yaw = ag.faceA || 0;
      const cy = Math.cos(yaw), sy = Math.sin(yaw);
      const cl = Math.cos(lean), sl = Math.sin(lean);

      for (let i = 0; i < P; i++) {
        const sk = S[i];
        let x = sk.x, y = sk.y, z = sk.z;
        // 四肢摆动（绕 pivot 在矢状面旋转）
        if (sk.sw !== 0) {
          const isArm = sk.g === 2 || sk.g === 3;
          const armBase = isArm ? e.arm * Math.abs(sk.sw) : 0;
          const a = armBase + swing * sk.sw * (isArm ? 0.55 : 1);
          const dy = sk.y - sk.py, dz = sk.z - sk.pz;
          y = sk.py + dy * Math.cos(a) - dz * Math.sin(a);
          z = sk.pz + dy * Math.sin(a) + dz * Math.cos(a);
        }
        // 头部姿态
        if (sk.g === 1) y += e.head;
        // 呼吸 / 开心跳 / 睡眠收拢
        y *= sleepK ? 0.55 : breathe;
        y += bob;
        if (sleepK) { x *= 1.2; z *= 1.2; }
        // 前倾（绕脚部 y=0.05）
        const yl = y - 0.05;
        const y2 = 0.05 + yl * cl - z * sl;
        const z2 = yl * sl + z * cl;
        y = y2; z = z2;
        // 抖动
        x += Math.sin(timeSec * 6.1 + i * 2.1 + s) * jit;
        y += Math.cos(timeSec * 5.3 + i * 1.7 + s) * jit;
        z += Math.sin(timeSec * 5.7 + i * 2.7 + s) * jit;
        // 朝向旋转
        const wx = x * cy - z * sy;
        const wz = x * sy + z * cy;
        // 灵光微粒淡化色
        const dim = sk.g === 6 ? 0.45 : 1;
        const headCore = (sk.g === 1 && sk.s > 0.4) ? 1 : 0;
        const r = v.r * dim + headCore * 0.55, g = v.g * dim + headCore * 0.55, b = v.b * dim + headCore * 0.5;

        const id = s * P + i;
        const tx = ag.p.x + wx * sc, ty = ag.p.y - 1.2 + y * sc, tz = ag.p.z + wz * sc;
        const k = Math.min(1, dt * this.spd[id] * 0.9);
        this.pos[id * 3] += (tx - this.pos[id * 3]) * k;
        this.pos[id * 3 + 1] += (ty - this.pos[id * 3 + 1]) * k;
        this.pos[id * 3 + 2] += (tz - this.pos[id * 3 + 2]) * k;
        this.col[id * 3] = r; this.col[id * 3 + 1] = g; this.col[id * 3 + 2] = b;
        this.size[id] = sk.s * (0.85 + 0.15 * v.bright);
      }
    }
    const geo = this.points.geometry;
    geo.attributes.position.needsUpdate = true;
    geo.attributes.aColor.needsUpdate = true;
    geo.attributes.aSize.needsUpdate = true;
  }
}
