// 众生镇 · 天空穹顶 / 光照 / 雾 / 日夜循环
import * as THREE from 'three';
import { SKY_KEYS, lerpKeys } from './config.js';

const NOISE = /* glsl */`
  float hash21(vec2 p){ p = fract(p*vec2(234.34,435.345)); p += dot(p,p+34.23); return fract(p.x*p.y); }
  float vnoise(vec2 p){
    vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.-2.*f);
    return mix(mix(hash21(i),hash21(i+vec2(1,0)),u.x), mix(hash21(i+vec2(0,1)),hash21(i+vec2(1,1)),u.x), u.y);
  }
  float fbm(vec2 p){ float v=0., a=.5; for(int i=0;i<4;i++){ v+=a*vnoise(p); p*=2.03; a*=.55; } return v; }
`;

export class Sky {
  constructor(scene, quality) {
    this.scene = scene;
    this.quality = quality;

    // ── 天穹 ──
    this.uniforms = {
      uHorizon: { value: new THREE.Color(0xffb169) },
      uZenith: { value: new THREE.Color(0x35486e) },
      uSunDir: { value: new THREE.Vector3(0, .3, -1) },
      uSunCol: { value: new THREE.Color(0xffc07a) },
      uNight: { value: 0 },
      uTime: { value: 0 },
      uCloud: { value: 0.42 },
    };
    const geo = new THREE.SphereGeometry(900, 40, 24);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: this.uniforms,
      vertexShader: /* glsl */`
        varying vec3 vDir;
        void main(){
          vDir = normalize(position);
          vec4 mv = modelViewMatrix * vec4(position,1.);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */`
        varying vec3 vDir;
        uniform vec3 uHorizon, uZenith, uSunDir, uSunCol;
        uniform float uNight, uTime, uCloud;
        ${NOISE}
        void main(){
          vec3 d = normalize(vDir);
          float h = clamp(d.y, -0.12, 1.0);
          float grad = pow(1.0 - max(h, 0.0), 1.9);
          vec3 col = mix(uZenith, uHorizon, grad);
          // 太阳
          float sd = max(dot(d, normalize(uSunDir)), 0.0);
          col += uSunCol * (pow(sd, 900.0) * 1.6 + pow(sd, 90.0) * 0.42 + pow(sd, 7.0) * 0.12);
          // 月亮（反方向偏移）
          vec3 md = normalize(vec3(-uSunDir.x, max(0.25, -uSunDir.y + 0.3), -uSunDir.z));
          float mdd = max(dot(d, md), 0.0);
          float moon = smoothstep(0.9993, 0.9996, mdd);
          float mglow = pow(mdd, 260.0) * 0.32;
          vec3 mcol = vec3(0.92, 0.95, 1.0);
          col += uNight * (moon * 1.5 + mglow) * mcol;
          // 星空
          if (d.y > 0.02 && uNight > 0.01) {
            vec2 sp = d.xz / (d.y + 0.35) * 5.5;
            vec2 cell = floor(sp * 14.0);
            float h1 = hash21(cell);
            float star = step(0.992, h1) * pow(fract(h1 * 913.7), 2.0);
            float tw = 0.6 + 0.4 * sin(uTime * (1.5 + h1 * 3.0) + h1 * 40.0);
            star *= tw * smoothstep(0.02, 0.25, d.y);
            col += vec3(0.9, 0.95, 1.0) * star * uNight * 1.35;
          }
          // 云
          if (d.y > 0.015) {
            vec2 cp = d.xz / (d.y + 0.22);
            float cn = fbm(cp * 0.75 + vec2(uTime * 0.008, uTime * 0.0045));
            float cm = smoothstep(uCloud, uCloud + 0.28, cn) * smoothstep(0.015, 0.18, d.y);
            vec3 ccol = mix(uHorizon, vec3(1.0), 0.35) * (0.55 + 0.65 * pow(sd, 3.0));
            ccol = mix(ccol, vec3(0.05, 0.06, 0.12), uNight * 0.95);
            col = mix(col, ccol, cm * mix(0.55, 0.3, uNight));
          }
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    this.dome = new THREE.Mesh(geo, mat);
    this.dome.frustumCulled = false;
    scene.add(this.dome);

    // ── 光照 ──
    this.sun = new THREE.DirectionalLight(0xffc07a, 1);
    const sh = quality === 'high' ? 2048 : 1024;
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(sh, sh);
    const c = this.sun.shadow.camera;
    c.left = -140; c.right = 140; c.top = 140; c.bottom = -140; c.near = 10; c.far = 520;
    this.sun.shadow.bias = -0.0008;
    this.sun.shadow.normalBias = 0.6;
    scene.add(this.sun, this.sun.target);
    this.hemi = new THREE.HemisphereLight(0xbdd2e2, 0x39412e, 0.7);
    scene.add(this.hemi);
    this.amb = new THREE.AmbientLight(0x30405c, 0.25);
    scene.add(this.amb);

    scene.fog = new THREE.Fog(0xd99a6a, 60, 340);
    this._col = { sky: new THREE.Color(), hor: new THREE.Color(), fog: new THREE.Color(), sun: new THREE.Color() };
  }

  update(t, timeSec) {
    const { a, b, f } = lerpKeys(t);
    const mix = (va, vb) => va + (vb - va) * f;
    this._col.sky.setHex(a.sky).lerp(new THREE.Color().setHex(b.sky), f);
    this._col.hor.setHex(a.hor).lerp(new THREE.Color().setHex(b.hor), f);
    this._col.fog.setHex(a.fog).lerp(new THREE.Color().setHex(b.fog), f);
    this._col.sun.setHex(a.sun).lerp(new THREE.Color().setHex(b.sun), f);
    const sunI = mix(a.sunI, b.sunI), ambI = mix(a.ambI, b.ambI), el = mix(a.sunEl, b.sunEl), az = mix(a.sunAz, b.sunAz);

    this.uniforms.uZenith.value.copy(this._col.sky);
    this.uniforms.uHorizon.value.copy(this._col.hor);
    this.uniforms.uSunCol.value.copy(this._col.sun);
    this.uniforms.uNight.value = THREE.MathUtils.clamp((0.34 - Math.max(el, 0)) * 3.2, 0, 1);
    this.uniforms.uTime.value = timeSec;

    const dir = new THREE.Vector3(Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az));
    this.uniforms.uSunDir.value.copy(dir);

    // 夜里太阳光变成月光（换向、换色、弱化）
    const night = this.uniforms.uNight.value;
    const lightDir = night > 0.6 ? dir.clone().multiplyScalar(-1).setY(Math.abs(dir.y) + 0.35) : dir;
    this.sun.position.copy(lightDir).multiplyScalar(260);
    this.sun.target.position.set(0, 0, 0);
    this.sun.color.copy(this._col.sun).lerp(new THREE.Color(0x93a8ff), night * 0.85);
    this.sun.intensity = Math.max(sunI, night * 0.5);
    this.hemi.intensity = ambI * 0.95;
    this.hemi.color.copy(this._col.hor);
    this.amb.intensity = ambI * 0.4;
    this.scene.fog.color.copy(this._col.fog);
    this.scene.fog.near = 95; this.scene.fog.far = 300;
    return { night, daylight: THREE.MathUtils.clamp(1 - night, 0, 1) };
  }
}
