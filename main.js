// 众生镇 · 主入口
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Sky } from './js/sky.js';
import { Town, terrainH } from './js/town.js';
import { World } from './js/agents.js';
import { EnvFX } from './js/ambient.js';
import { Director, Oracle } from './js/director.js';
import { UI } from './js/ui.js';
import { AudioCtl } from './js/audio.js';
import { G, CFG, bus, QPARAM } from './js/config.js';

/* ── 渲染器 ── */
const app = document.getElementById('app');
const DPR_CAP = QPARAM.dpr || (G.quality === 'high' ? 2 : 1.4);
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, DPR_CAP));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(52, innerWidth / innerHeight, 0.5, 1200);
camera.position.set(0, 22, 104);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.target.set(0, 8, 6);
controls.maxPolarAngle = Math.PI * 0.49;
controls.minDistance = 10;
controls.maxDistance = 200;

/* ── 后期 ── */
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.55, 0.5, 0.8);
if (G.quality === 'high') composer.addPass(bloom);
composer.addPass(new OutputPass());

/* ── 世界 ── */
const setBoot = (p, s) => {
  const bar = document.getElementById('bootBar'), step = document.getElementById('bootStep');
  if (bar) bar.style.width = p + '%';
  if (step) step.textContent = s;
};
setBoot(15, '唤醒天空……');
const sky = new Sky(scene, G.quality);
setBoot(38, '铺展大地……');
const town = new Town(scene, G.quality);
setBoot(62, '召来众生……');
const world = new World(scene, town, G.quality);
G.agents = world.agents;
setBoot(80, '点燃灯火……');
const fx = new EnvFX(scene, G.quality);
fx.fountainTop = town.fountainTop;
const audio = new AudioCtl();
const director = new Director(world, fx);
const oracle = new Oracle(world, fx, director);
const ui = new UI(world, oracle, town, director);
setBoot(100, '镇门已开');

/* ── 点击选择魂体 ── */
const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
let downXY = null;
renderer.domElement.addEventListener('pointerdown', (e) => { downXY = [e.clientX, e.clientY]; });
renderer.domElement.addEventListener('pointerup', (e) => {
  if (!downXY) return;
  const dx = e.clientX - downXY[0], dy = e.clientY - downXY[1];
  downXY = null;
  if (dx * dx + dy * dy > 36) return;   // 拖动不算点击
  ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  let best = null, bestD = 3.2;
  const _v = new THREE.Vector3();
  for (const a of world.agents) {
    _v.copy(a.p).sub(ray.ray.origin);
    const along = _v.dot(ray.ray.direction);
    if (along < 0) continue;
    const perp = _v.sub(ray.ray.direction.clone().multiplyScalar(along)).length();
    if (perp < bestD) { bestD = perp; best = a; }
  }
  if (best) bus.emit('agentClicked', best);
});

/* ── 进入小镇 ── */
let started = false;
function enterTown() {
  if (started) return;
  started = true;
  document.getElementById('title').classList.add('hide');
  document.getElementById('hud').classList.add('show');
  audio.start();
  camera.position.set(0, 26, 96);
  controls.target.set(0, 8, 6);
  if (QPARAM.shot) return;
  // 开场运镜：从高处缓降
  const from = { x: 0, y: 150, z: 8 }, to = { x: 0, y: 26, z: 96 };
  let k = 0;
  const glide = setInterval(() => {
    k += 0.011;
    const e = 1 - Math.pow(1 - Math.min(k, 1), 3);
    camera.position.set(from.x, from.y + (to.y - from.y) * e, from.z + (to.z - from.z) * e);
    if (k >= 1) clearInterval(glide);
  }, 16);
  setTimeout(() => bus.emit('log', { tag: '开镇', text: '黄昏落在镇上。你是今天第一位到访的神明。' }), 1500);
  setTimeout(() => bus.emit('log', { tag: '提示', text: '在下方输入一句话试试：办一场丰收祭 / 降一场流星雨' }), 5200);
}
document.getElementById('btnEnter').addEventListener('click', enterTown);

/* ── 音效开关 ── */
const btnAudio = document.getElementById('btnAudio');
btnAudio.classList.toggle('on', audio.on);
btnAudio.addEventListener('click', () => {
  audio.start();
  btnAudio.classList.toggle('on', audio.toggle());
});

/* ── 主循环 ── */
const clock = new THREE.Clock();
let timeSec = 0, cineA = 0, hudTimer = 0, lightningAt = 0;
function tick() {
  requestAnimationFrame(tick);
  const dt = Math.min(clock.getDelta(), 0.05);
  timeSec += dt;
  const T = G.time;
  T.t += dt * T.speed / CFG.DAY_LENGTH;
  if (T.t >= 1) { T.t -= 1; T.day++; bus.emit('day'); }
  const { night } = sky.update(T.t, timeSec);
  town.update(dt, T.t, timeSec, night);
  town.setFogColor(scene.fog.color);
  world.update(dt, timeSec, T.t, T.day);
  fx.update(dt, timeSec, night, town);
  director.update(dt);

  // 雷电
  if (G.weather === 'storm' && timeSec > lightningAt) {
    lightningAt = timeSec + 3 + Math.random() * 6;
    renderer.toneMappingExposure = 2.6;
    sky.sun.intensity = 3.5;
    setTimeout(() => { renderer.toneMappingExposure = 1.08; }, 120);
  }

  // 相机模式
  if (G.camMode === 'cinema' && started) {
    cineA += dt * 0.055;
    const r = 88;
    camera.position.set(Math.cos(cineA) * r, 42 + Math.sin(cineA * 0.7) * 10, Math.sin(cineA) * r);
    controls.target.set(0, 6, 10);
  } else if (G.camMode === 'follow' && G.focus && started) {
    const f = G.focus;
    const behind = new THREE.Vector3(Math.sin(f.faceA), 0, Math.cos(f.faceA)).multiplyScalar(-7.5);
    const targetPos = new THREE.Vector3(f.p.x + behind.x, f.p.y + 4.2, f.p.z + behind.z);
    camera.position.lerp(targetPos, Math.min(1, dt * 2.4));
    controls.target.lerp(new THREE.Vector3(f.p.x, f.p.y + 0.5, f.p.z), Math.min(1, dt * 3));
  }
  controls.update();
  composer.render();

  // HUD
  hudTimer -= dt;
  if (hudTimer <= 0) { hudTimer = 0.5; ui.tickHud(); }
}
tick();

setTimeout(() => {
  document.getElementById('boot').classList.add('hide');
  document.getElementById('title').classList.remove('hide');
  if (QPARAM.shot) enterTown();
}, 350);

/* ── 调试钩子 ── */
window.__shot = () => { composer.render(); return renderer.domElement.toDataURL('image/png'); };
window.__G = G; window.__world = world;
window.__cam = { camera, controls, set(x, y, z, tx, ty, tz) { camera.position.set(x, y, z); controls.target.set(tx, ty, tz); } };

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
});
