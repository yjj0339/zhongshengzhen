// 众生镇 · 环境粒子：喷泉 / 炊烟 / 萤火虫 / 花瓣 / 烟花 / 流星 / 雨 / 节日光屑
import * as THREE from 'three';

const T = { FOUNTAIN: 0, SMOKE: 1, FIREFLY: 2, PETAL: 3, FIREWORK: 4, METEOR: 5, RAIN: 6, SPARKLE: 7 };

export class EnvFX {
  constructor(scene, quality) {
    const cap = quality === 'high' ? 3000 : 1500;
    this.cap = cap;
    this.pos = new Float32Array(cap * 3);
    this.col = new Float32Array(cap * 3);
    this.size = new Float32Array(cap);
    // 粒子状态
    this.type = new Uint8Array(cap);
    this.vel = new Float32Array(cap * 3);
    this.life = new Float32Array(cap);
    this.maxLife = new Float32Array(cap);
    this.seed = new Float32Array(cap);
    this.baseCol = new Float32Array(cap * 3);
    this.baseSize = new Float32Array(cap);
    this.freelist = [];
    for (let i = cap - 1; i >= 0; i--) this.freelist.push(i);
    this.pos.forEach((_, i) => { this.pos[i * 3 + 1] = -999; });

    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.uni = { uPR: { value: Math.min(devicePixelRatio, 2) } };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uni, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: `
        attribute vec3 aColor; attribute float aSize; uniform float uPR;
        varying vec3 vC;
        void main(){
          vC = aColor;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * uPR * (260.0 / max(-mv.z, 1.0));
          gl_PointSize = min(gl_PointSize, 60.0 * uPR);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        varying vec3 vC;
        void main(){
          vec2 uv = gl_PointCoord - 0.5;
          float d = length(uv);
          float a = smoothstep(0.5, 0.05, d);
          gl_FragColor = vec4(vC, a * 0.9);
        }`,
    });
    this.points = new THREE.Points(this.geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 7;
    scene.add(this.points);

    this.raining = false;
    this.festival = false;
    this._fireworkTimer = 0;
    this._meteorTimer = 0;
    this._petalTimer = 0;
  }

  _spawn(type, x, y, z, vx, vy, vz, life, size, r, g, b) {
    if (!this.freelist.length) return -1;
    const i = this.freelist.pop();
    this.type[i] = type;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.life[i] = 0; this.maxLife[i] = life;
    this.baseSize[i] = size;
    this.baseCol[i * 3] = r; this.baseCol[i * 3 + 1] = g; this.baseCol[i * 3 + 2] = b;
    this.seed[i] = Math.random() * 6.28;
    return i;
  }

  burstFirework(x, y, z, hex) {
    const c = new THREE.Color(hex);
    const n = 60;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1);
      const sp = 5 + Math.random() * 7;
      this._spawn(T.FIREWORK, x, y, z,
        Math.sin(ph) * Math.cos(a) * sp, Math.cos(ph) * sp, Math.sin(ph) * Math.sin(a) * sp,
        1.4 + Math.random() * 0.9, 0.5 + Math.random() * 0.4,
        c.r, c.g, c.b);
    }
  }

  spawnMeteor() {
    const x = -80 + Math.random() * 160, z = -120 + Math.random() * 100;
    this._spawn(T.METEOR, x, 90 + Math.random() * 40, z, 22 + Math.random() * 14, -34, 14, 1.5, 1.6, 1, 0.98, 0.9);
  }

  setRain(on) { this.raining = on; }
  setFestival(on) { this.festival = on; }

  update(dt, timeSec, night, town) {
    const spawnFountain = town && town.fountainTop;
    // 持续发射器
    if (spawnFountain) {
      for (let k = 0; k < 3; k++) {
        const a = Math.random() * Math.PI * 2, sp = 2.4 + Math.random() * 2.2;
        this._spawn(T.FOUNTAIN, 0, town.fountainTop.y, 0,
          Math.cos(a) * sp * 0.5, 6.5 + Math.random() * 2.5, Math.sin(a) * sp * 0.5,
          1.6, 0.4, 0.75, 0.88, 1.0);
      }
    }
    if (town && town.chimneys && night > 0.25) {
      for (const ch of town.chimneys) {
        if (Math.random() < 0.35) {
          this._spawn(T.SMOKE, ch.x, ch.y, ch.z, (Math.random() - 0.5) * 0.3, 1.1, (Math.random() - 0.5) * 0.3, 4.5, 1.4, 0.5, 0.48, 0.45);
        }
      }
    }
    if (night > 0.4 && town) {
      // 萤火虫（林缘 + 湖畔）
      for (let k = 0; k < 2; k++) {
        if (Math.random() < 0.5) {
          const zones = [[-34, -52, 22], [-40, -66, 18], [10, 58, 16], [-20, 40, 14]];
          const zn = zones[Math.floor(Math.random() * zones.length)];
          const x = zn[0] + (Math.random() - 0.5) * zn[2] * 2, z = zn[1] + (Math.random() - 0.5) * zn[2] * 2;
          this._spawn(T.FIREFLY, x, 1.5 + Math.random() * 2.5, z, 0, 0, 0, 6 + Math.random() * 8, 0.5, 0.85, 1, 0.45);
        }
      }
    }
    // 花瓣（白天随风）
    this._petalTimer -= dt;
    if (night < 0.5 && this._petalTimer <= 0) {
      this._petalTimer = 0.25;
      const a = Math.random() * Math.PI * 2, r = 30 + Math.random() * 50;
      this._spawn(T.PETAL, Math.cos(a) * r, 8 + Math.random() * 6, Math.sin(a) * r,
        2.2 + Math.random(), -0.5, 1.4 + Math.random(), 9, 0.34, 1, 0.75, 0.85);
    }
    // 烟花 / 流星 / 节日光屑
    if (this.festival) {
      this._fireworkTimer -= dt;
      if (this._fireworkTimer <= 0) {
        this._fireworkTimer = 1.6 + Math.random() * 1.6;
        const a = Math.random() * Math.PI * 2, r = 8 + Math.random() * 26;
        this.burstFirework(Math.cos(a) * r, 22 + Math.random() * 14, Math.sin(a) * r,
          [0xffcf7d, 0xff8fb0, 0x7fd8ff, 0xb48cff, 0xd8ff8f][Math.floor(Math.random() * 5)]);
      }
      if (Math.random() < 0.7) {
        const a = Math.random() * Math.PI * 2, r = Math.random() * 24;
        this._spawn(T.SPARKLE, Math.cos(a) * r, 0.5 + Math.random() * 3, Math.sin(a) * r, 0, 0.6, 0, 2.4, 0.4, 1, 0.85, 0.5);
      }
    }
    if (this.raining) {
      for (let k = 0; k < 22; k++) {
        const x = -110 + Math.random() * 220, z = -110 + Math.random() * 220;
        this._spawn(T.RAIN, x, 34, z, 1.5, -46, 2, 0.75, 0.5, 0.55, 0.68, 0.9);
      }
    }

    // 更新
    for (let i = 0; i < this.cap; i++) {
      if (this.type[i] === 255 || this.life[i] >= this.maxLife[i]) continue;
      this.life[i] += dt;
      if (this.life[i] >= this.maxLife[i]) {
        this.pos[i * 3 + 1] = -999; this.size[i] = 0; this.type[i] = 255;
        this.freelist.push(i);
        continue;
      }
      const t = this.life[i] / this.maxLife[i];
      const tp = this.type[i];
      let fade = 1;
      switch (tp) {
        case T.FOUNTAIN: {
          this.vel[i * 3 + 1] -= 14 * dt;
          break;
        }
        case T.SMOKE: {
          this.vel[i * 3] += Math.sin(timeSec + this.seed[i]) * 0.12;
          this.size[i] = this.baseSize[i] * (1 + t * 2.2);
          fade = (1 - t) * 0.5;
          break;
        }
        case T.FIREFLY: {
          const s = this.seed[i];
          this.pos[i * 3] += Math.sin(timeSec * 0.9 + s) * dt * 1.4;
          this.pos[i * 3 + 1] += Math.cos(timeSec * 0.7 + s * 2) * dt * 0.5;
          this.pos[i * 3 + 2] += Math.cos(timeSec * 0.8 + s) * dt * 1.4;
          fade = (Math.sin(timeSec * 2.4 + s * 3) * 0.5 + 0.5) * (1 - t) * 1.4;
          break;
        }
        case T.PETAL: {
          this.pos[i * 3 + 1] += Math.sin(timeSec * 2 + this.seed[i]) * dt * 0.8;
          fade = Math.min(1, (1 - t) * 2) * 0.8;
          break;
        }
        case T.FIREWORK: {
          this.vel[i * 3 + 1] -= 4.5 * dt;
          this.vel[i * 3] *= (1 - dt * 0.9); this.vel[i * 3 + 2] *= (1 - dt * 0.9);
          fade = Math.pow(1 - t, 1.6);
          break;
        }
        case T.METEOR: {
          fade = Math.pow(1 - t, 0.5);
          break;
        }
        case T.RAIN: {
          break;
        }
        case T.SPARKLE: {
          fade = Math.sin(t * Math.PI);
          break;
        }
      }
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      if (tp === T.FOUNTAIN && this.pos[i * 3 + 1] < 1.1) { this.life[i] = this.maxLife[i]; continue; }
      if (tp === T.RAIN && this.pos[i * 3 + 1] < 0.2) { this.life[i] = this.maxLife[i]; continue; }
      this.size[i] = this.baseSize[i] * (tp === T.SMOKE ? 1 : 1);
      this.col[i * 3] = this.baseCol[i * 3] * fade;
      this.col[i * 3 + 1] = this.baseCol[i * 3 + 1] * fade;
      this.col[i * 3 + 2] = this.baseCol[i * 3 + 2] * fade;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.aColor.needsUpdate = true;
    this.geo.attributes.aSize.needsUpdate = true;
  }
}
