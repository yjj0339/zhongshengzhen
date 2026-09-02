// 众生镇 · 小镇程序化生成：地形 / 道路 / 建筑 / 路点图
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PAL, CFG, lerpKeys } from './config.js';

/* ── 简易值噪声 ── */
function hash2(x, y) { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); }
function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  return hash2(xi, yi) * (1 - u) * (1 - v) + hash2(xi + 1, yi) * u * (1 - v) + hash2(xi, yi + 1) * (1 - u) * v + hash2(xi + 1, yi + 1) * u * v;
}
const smooth = (a, b, x) => { const t = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

export const LAKE = { x: 0, z: 96, r: 36 };
export const WATER_Y = -0.5;

/* 地形高度（纯函数，供网格与智能体共用） */
export function terrainH(x, z) {
  let h = vnoise(x * 0.018, z * 0.018) * 3.0 + vnoise(x * 0.055, z * 0.055) * 0.9 - 1.6;
  const r = Math.hypot(x, z);
  h = THREE.MathUtils.lerp(h * 0.22 + 0.15, h, smooth(38, 78, r));           // 村庄核心压平
  h += 8.0 * Math.exp(-((x + 78) ** 2 + (z + 14) ** 2) / (30 * 30));          // 风车山
  h += smooth(-64, -108, z) * 6.5;                                            // 北方山林隆起（-z 为北）
  h -= 3.6 * Math.exp(-((x - LAKE.x) ** 2 + (z - LAKE.z) ** 2) / (LAKE.r * LAKE.r * 1.15)); // 湖盆
  return h;
}
export function isWater(x, z) {
  const d = Math.hypot(x - LAKE.x, z - LAKE.z);
  return d < LAKE.r - 2 && terrainH(x, z) < WATER_Y - 0.25;
}

/* 道路折线（刷色 + 路点同源） */
const R = (pts) => pts;
export const ROADS = [
  R([[0, 26], [0, 34]]),
  R([[0, 34], [22, 34], [34, 26], [34, 12], [34, -12], [34, -26], [22, -34], [0, -34], [-22, -34], [-34, -26], [-34, -12], [-34, 26], [-22, 34]]),
  R([[0, 34], [0, 52], [0, 64], [0, 72]]),
  R([[0, -26], [0, -34]]),
  R([[62, 0], [57, 24], [44, 40], [24, 57], [0, 62], [-24, 57], [-44, 40], [-57, 24], [-62, 0], [-57, -24], [-44, -40], [-24, -57], [0, -62], [24, -57], [44, -40], [57, -24]]),
  R([[34, 0], [46, 0], [52, 2]]),
  R([[-34, 0], [-46, 4], [-58, 0], [-66, -6], [-74, -8]]),
  R([[-34, 0], [-44, 14], [-48, 24]]),
  R([[-22, -34], [-32, -48], [-36, -58]]),
  R([[22, -34], [18, -42]]),
  R([[22, 34], [30, 40], [44, 40], [52, 32]]),
];

/* 到最近道路的距离（供刷色与建筑避让） */
const _roadSegs = [];
for (const rd of ROADS) for (let i = 0; i < rd.length - 1; i++) _roadSegs.push([rd[i], rd[i + 1]]);
export function distToRoads(x, z) {
  let best = 1e9;
  for (const [[ax, az], [bx, bz]] of _roadSegs) {
    const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz;
    let t = ((x - ax) * dx + (z - az) * dz) / L2; t = Math.max(0, Math.min(1, t));
    const px = ax + dx * t - x, pz = az + dz * t - z;
    const d = px * px + pz * pz; if (d < best) best = d;
  }
  return Math.sqrt(best);
}

/* 路点图 */
function buildGraph(houses) {
  const nodes = [];
  const add = (x, z, tag) => { nodes.push({ x, z, tag, i: nodes.length }); return nodes.length - 1; };
  const P = [], R1 = [], R2 = [];
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2 + Math.PI / 8;
    const c = Math.cos(a), s = Math.sin(a);
    P.push(add(c * 13, s * 13, 'plaza'));
    R1.push(add(c * 34, s * 34, 'ring1'));
    R2.push(add(c * 62, s * 62, 'ring2'));
  }
  const dock = add(0, 72, 'dock'), dockEnd = add(2, 62, 'dockEnd');
  const market = add(52, 2, 'market'), smithy = add(44, 18, 'smithy');
  const mill = add(-74, -8, 'mill'), farm = add(-48, 24, 'farm'), well = add(-14, 12, 'well');
  const tavern = add(28, -28, 'tavern'), school = add(18, -44, 'school');
  const forest = add(-36, -58, 'forest'), east = add(50, 34, 'eastGarden');
  const fixed = [dock, dockEnd, market, smithy, mill, farm, well, tavern, school, forest, east];
  // 连边：环相邻 + 同角度放射 + 特殊点就近（角度按 k/8·2π+π/8 标定）
  const edges = new Set();
  const link = (a, b) => { const k = a < b ? a + '_' + b : b + '_' + a; if (!edges.has(k) && a !== b) { edges.add(k); } };
  for (let k = 0; k < 8; k++) {
    link(P[k], P[(k + 1) % 8]); link(R1[k], R1[(k + 1) % 8]); link(R2[k], R2[(k + 1) % 8]);
    link(P[k], R1[k]); link(R1[k], R2[k]);
  }
  link(dockEnd, R2[1]); link(dockEnd, R1[1]); link(dock, dockEnd);
  link(market, R2[0]); link(market, R2[7]); link(smithy, R1[0]);
  link(mill, R2[4]); link(farm, R2[3]); link(farm, R1[3]); link(well, P[3]); link(well, R1[3]);
  link(tavern, R1[6]); link(tavern, R1[7]); link(school, R1[6]); link(school, R2[6]); link(forest, R2[5]); link(east, R2[0]);
  // 家门（先加节点、连边，再统一建邻接表）
  const doorIdx = [];
  for (const h of houses) {
    const i = add(h.door.x, h.door.z, 'home');
    doorIdx.push(i);
    const ds = nodes.filter(m => m.tag !== 'home' && m.i !== i).map(m => ({ i: m.i, d: Math.hypot(m.x - h.door.x, m.z - h.door.z) })).sort((a, b) => a.d - b.d);
    link(i, ds[0].i); link(i, ds[1].i);
  }
  const adj = nodes.map(() => []);
  const ensureAdj = () => {
    for (const k of edges) { const [a, b] = k.split('_').map(Number); const d = Math.hypot(nodes[a].x - nodes[b].x, nodes[a].z - nodes[b].z); adj[a].push([b, d]); adj[b].push([a, d]); }
  };
  ensureAdj();
  // 就近补边（防止孤岛）
  for (const n of nodes) {
    if (adj[n.i].length) continue;
    const ds = nodes.filter(m => m.i !== n.i).map(m => ({ i: m.i, d: Math.hypot(m.x - n.x, m.z - n.z) })).sort((a, b) => a.d - b.d);
    for (let j = 0; j < 2 && j < ds.length; j++) link(n.i, ds[j].i);
  }
  ensureAdj();
  return { nodes, adj, doorIdx, sites: { dock, dockEnd, market, smithy, mill, farm, well, tavern, school, forest, east, plaza: P[0] } };
}

/* ── 几何小工具 ── */
const _c = new THREE.Color();
function paint(geo, hex) {
  // 原地转为非索引并写入纯色：保证任意来源几何可合并（调用方无需接收返回值）
  const g = geo.index ? geo.toNonIndexed() : geo;
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3); _c.setHex(hex);
  for (let i = 0; i < n; i++) { arr[i * 3] = _c.r; arr[i * 3 + 1] = _c.g; arr[i * 3 + 2] = _c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  g.deleteAttribute('normal'); g.deleteAttribute('uv');
  if (g !== geo) { geo.index = null; geo.attributes = g.attributes; }
  return geo;
}
function boxAt(list, w, h, d, x, y, z, hex, ry = 0) {
  const g = new THREE.BoxGeometry(w, h, d); paint(g, hex);
  if (ry) g.rotateY(ry); g.translate(x, y, z); list.push(g);
}
function cylAt(list, rT, rB, h, seg, x, y, z, hex) {
  const g = new THREE.CylinderGeometry(rT, rB, h, seg); paint(g, hex); g.translate(x, y, z); list.push(g);
}
function coneAt(list, r, h, seg, x, y, z, hex, ry = 0) {
  const g = new THREE.ConeGeometry(r, h, seg); paint(g, hex); if (ry) g.rotateY(ry); g.translate(x, y, z); list.push(g);
}

const ROOFS = [0xb5714f, 0x9a6a48, 0x8a7690, 0xb08a4a, 0xc07a56, 0x7d6a56];
const WALLS = [0xe3d2ac, 0xd6bd94, 0xccae82, 0xdfc19c, 0xd8c8a6, 0xcaa985];

function makeSign(text, w = 2.6) {
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 96;
  const g = cv.getContext('2d');
  g.fillStyle = '#2a1c10'; g.fillRect(0, 0, 256, 96);
  g.strokeStyle = '#8a6a3c'; g.lineWidth = 6; g.strokeRect(6, 6, 244, 84);
  g.fillStyle = '#ffcf7d'; g.font = '600 52px "Noto Serif SC","Songti SC",serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 128, 52);
  const tx = new THREE.CanvasTexture(cv); tx.anisotropy = 4;
  return new THREE.Mesh(new THREE.PlaneGeometry(w, w * 0.375), new THREE.MeshBasicMaterial({ map: tx, side: THREE.DoubleSide }));
}

export class Town {
  constructor(scene, quality) {
    this.group = new THREE.Group();
    this.quality = quality;
    this.chimneys = []; this.anim = [];
    this._buildTerrain();
    this._buildWater();
    const houses = this._buildHouses();
    this._buildLandmarks();
    this._buildPlaza();
    this._buildNature();
    this._buildLights();
    this.graph = buildGraph(houses);
    scene.add(this.group);
  }

  /* ── 地形 ── */
  _buildTerrain() {
    const size = 300, seg = 120;
    const geo = new THREE.PlaneGeometry(size, size, seg, seg);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const cGrassA = new THREE.Color(0x5c8a3c), cGrassB = new THREE.Color(0x8ab356),
      cDirt = new THREE.Color(0x9d7f55), cStone = new THREE.Color(0xb2a68f),
      cSand = new THREE.Color(0xcdb27a), cMud = new THREE.Color(0x55503f), cForest = new THREE.Color(0x47663d);
    const tmp = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      pos.setY(i, terrainH(x, z));
      const r = Math.hypot(x, z);
      const n = vnoise(x * 0.11, z * 0.11);
      tmp.copy(cGrassA).lerp(cGrassB, n);
      if (z < -52) tmp.lerp(cForest, smooth(-52, -70, z) * 0.85);
      const dr = distToRoads(x, z);
      if (dr < 3.4) tmp.lerp(cDirt, smooth(3.4, 1.4, dr));
      const dl = Math.hypot(x - LAKE.x, z - LAKE.z);
      if (dl < LAKE.r + 6) {
        if (pos.getY(i) < WATER_Y - 0.3) tmp.copy(cMud);
        else if (dl > LAKE.r - 7) tmp.lerp(cSand, smooth(LAKE.r - 7, LAKE.r + 1, dl));
      }
      if (r < 27.5) {
        tmp.copy(cStone).multiplyScalar(0.9 + n * 0.18);
        if (r > 24 && r < 25.6) tmp.multiplyScalar(0.82);
        if (r < 6.2) tmp.multiplyScalar(0.88);
      }
      colors[i * 3] = tmp.r; colors[i * 3 + 1] = tmp.g; colors[i * 3 + 2] = tmp.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0, flatShading: true });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    this.group.add(mesh);
    this.terrain = mesh;
  }

  /* ── 湖水 ── */
  _buildWater() {
    this.waterUni = {
      uTime: { value: 0 }, uHorizon: { value: new THREE.Color(0xffb169) },
      uNight: { value: 0 }, uSunAz: { value: new THREE.Vector2(0, -1) }, uGlow: { value: 1 },
    };
    const geo = new THREE.CircleGeometry(46, 40); geo.rotateX(-Math.PI / 2);
    const mat = new THREE.ShaderMaterial({
      transparent: true, uniforms: this.waterUni,
      vertexShader: `varying vec3 vP; void main(){ vP=position; vec4 w=modelMatrix*vec4(position,1.); gl_Position=projectionMatrix*viewMatrix*w; }`,
      fragmentShader: `
        varying vec3 vP; uniform float uTime,uNight,uGlow; uniform vec3 uHorizon; uniform vec2 uSunAz;
        float h21(vec2 p){p=fract(p*vec2(234.34,435.345));p+=dot(p,p+34.23);return fract(p.x*p.y);}
        float vn(vec2 p){vec2 i=floor(p),f=fract(p);vec2 u=f*f*(3.-2.*f);
          return mix(mix(h21(i),h21(i+vec2(1,0)),u.x),mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),u.x),u.y);}
        void main(){
          float r = length(vP.xz);
          vec3 deep = mix(vec3(0.09,0.17,0.24), vec3(0.02,0.04,0.10), uNight);
          vec3 shal = mix(uHorizon*0.5, vec3(0.08,0.12,0.24), uNight);
          vec3 col = mix(deep, shal, smoothstep(40.0, 18.0, r));
          float w1 = vn(vP.xz*0.55 + vec2(uTime*0.25, uTime*0.11));
          float w2 = vn(vP.xz*1.4  - vec2(uTime*0.18, uTime*0.31));
          float sp = smoothstep(0.86, 0.97, w1*0.6 + w2*0.5);
          col += sp * mix(vec3(1.0,0.92,0.75)*0.34, vec3(0.45,0.58,0.9)*0.16, uNight) * uGlow;
          vec2 dir = normalize(vP.xz);
          float streak = pow(max(dot(dir, uSunAz), 0.0), 60.0);
          col += streak * mix(vec3(1.0,0.72,0.42)*0.5, vec3(0.5,0.6,0.95)*0.12, uNight) * uGlow;
          float foam = smoothstep(43.0, 45.5, r) * (0.5 + 0.5*sin(r*6.0 - uTime*1.8 + vn(vP.xz*0.5)*6.0));
          col += foam * vec3(0.85) * 0.1;
          gl_FragColor = vec4(col, 0.93);
        }`,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(LAKE.x, WATER_Y, LAKE.z);
    this.group.add(mesh);
  }

  /* ── 24 栋民居 ── */
  _buildHouses() {
    const walls = [], roofs = [], trims = [], stones = [];
    const winMats = [], chimTop = [];
    const houses = [];
    const exclAz = a => { const d = Math.abs(((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) - Math.PI / 2); return d < 0.62; }; // 排除湖区
    let seed = 7;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    let placed = 0, ring = 0;
    while (placed < CFG.AGENT_N) {
      const baseA = (placed / CFG.AGENT_N) * Math.PI * 2 + ring * 0.12 + rnd() * 0.22;
      const rr = [50, 60, 71][ring % 3] + rnd() * 6 - 3;
      const az = Math.atan2(Math.sin(baseA), Math.cos(baseA));
      const x = Math.cos(baseA) * rr, z = Math.sin(baseA) * rr;
      ring++;
      if (exclAz(baseA) && rr > 46) continue;
      if (Math.hypot(x - LAKE.x, z - LAKE.z) < LAKE.r + 8) continue;
      if (Math.hypot(x + 78, z + 14) < 24) continue;   // 风车山
      if (distToRoads(x, z) < 5.0) continue;           // 让开道路
      let clash = false;
      for (const h of houses) if (Math.hypot(h.x - x, h.z - z) < 13) { clash = true; break; }
      if (clash) continue;
      placed++;
      const w = 5.6 + rnd() * 2.4, d = 4.6 + rnd() * 1.8, hh = 3.4 + rnd() * 1.5 + (rnd() > 0.8 ? 2.2 : 0);
      const ry = Math.atan2(-x, -z) + (rnd() - 0.5) * 0.3;
      const wall = WALLS[Math.floor(rnd() * WALLS.length)], roof = ROOFS[Math.floor(rnd() * ROOFS.length)];
      const gy = terrainH(x, z);
      // 墙体（两截制造腰线）
      boxAt(walls, w, hh, d, x, gy + hh / 2, z, wall, ry);
      boxAt(trims, w + 0.5, 0.35, d + 0.5, x, gy + 0.18, z, 0x6b5138, ry);   // 基座
      boxAt(trims, w + 0.4, 0.22, d + 0.4, x, gy + hh, z, 0x7a5f42, ry);     // 檐口
      // 金字塔屋顶
      coneAt(roofs, Math.hypot(w, d) / 2 * 1.28, 2.5 + rnd() * 1.1, 4, x, gy + hh + 1.35 + rnd() * 0.5, z, roof, ry + Math.PI / 4);
      // 烟囱
      const cx = x + Math.sin(ry) * (d / 2 - 1) + (rnd() - 0.5), cz = z + Math.cos(ry) * (d / 2 - 1) + (rnd() - 0.5);
      boxAt(stones, 0.9, 2.6, 0.9, cx, gy + hh + 1.6, cz, 0x8d8676);
      chimTop.push(new THREE.Vector3(cx, gy + hh + 3.0, cz));
      // 门（正面朝原点）
      const fx2 = -x / Math.hypot(x, z), fz2 = -z / Math.hypot(x, z);
      boxAt(trims, 1.25, 2.15, 0.2, x + fx2 * (d / 2 + 0.12), gy + 1.08, z + fz2 * (d / 2 + 0.12), 0x4e3420, ry);
      // 窗（正面 2~3 扇）
      const put = (wx, wz) => {
        const m = new THREE.Matrix4();
        const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0));
        const up = hh > 4.6 && rnd() > 0.5 ? 1.7 : 0;
        m.compose(new THREE.Vector3(wx, gy + 1.75 + up, wz), q, new THREE.Vector3(1, 1, 1));
        winMats.push({ m });
      };
      put(x + fx2 * (d / 2 + 0.1) - fz2 * w * 0.28, z + fz2 * (d / 2 + 0.1) + fx2 * w * 0.28);
      put(x + fx2 * (d / 2 + 0.1) + fz2 * w * 0.28, z + fz2 * (d / 2 + 0.1) - fx2 * w * 0.28);
      if (rnd() > 0.4) put(x + fx2 * (d / 2 + 0.1), z + fz2 * (d / 2 + 0.1));
      if (rnd() > 0.5) { put(x - fx2 * (d / 2 + 0.1) - fz2 * w * 0.28, z - fz2 * (d / 2 + 0.1) + fx2 * w * 0.28); }
      houses.push({ x, z, gy, ry, door: { x: x + fx2 * (d / 2 + 2.4), z: z + fz2 * (d / 2 + 2.4) } });
    }
    // 厨房烟囱取样（供炊烟）
    this.chimneys = chimTop.slice(0, 10);
    this.houses = houses;

    const wallMesh = new THREE.Mesh(mergeGeometries(walls), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true }));
    const roofMesh = new THREE.Mesh(mergeGeometries(roofs), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, flatShading: true }));
    const trimMesh = new THREE.Mesh(mergeGeometries(trims), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true }));
    const stoneMesh = new THREE.Mesh(mergeGeometries(stones), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true }));
    for (const m of [wallMesh, roofMesh, trimMesh, stoneMesh]) { m.castShadow = true; m.receiveShadow = true; this.group.add(m); }

    // 窗户（实例化，夜晚点亮）
    const winGeo2 = new THREE.PlaneGeometry(0.95, 1.15);
    this.winMat = new THREE.MeshStandardMaterial({ color: 0x241d12, emissive: 0xffb45e, emissiveIntensity: 0, side: THREE.DoubleSide, roughness: 0.4 });
    const winMesh = new THREE.InstancedMesh(winGeo2, this.winMat, winMats.length);
    winMats.forEach((w, i) => winMesh.setMatrixAt(i, w.m));
    winMesh.instanceMatrix.needsUpdate = true;
    this.group.add(winMesh);
    return houses;
  }

  /* ── 地标：钟楼 / 酒馆 / 学堂 / 铁匠铺 / 风车 / 磨坊 ── */
  _buildLandmarks() {
    const walls = [], roofs = [], trims = [], stones = [];

    // 钟楼（广场北缘）
    const tx = 0, tz = -30, ty = terrainH(tx, tz);
    boxAt(stones, 5.6, 15, 5.6, tx, ty + 7.5, tz, 0x9a9184);
    boxAt(stones, 6.6, 0.8, 6.6, tx, ty + 15.2, tz, 0x7d766b);
    coneAt(roofs, 5.2, 4.6, 4, tx, ty + 17.6, tz, 0x6e4f3a, Math.PI / 4);
    cylAt(trims, 0.28, 0.28, 0.9, 8, tx, ty + 20.4, tz, 0xd8b25e);  // 顶针
    // 钟面（四面对）
    this.clockFaces = [];
    for (let k = 0; k < 2; k++) {
      const fgeo = new THREE.CircleGeometry(1.7, 20);
      const fmat = new THREE.MeshStandardMaterial({ color: 0xf5ead0, emissive: 0xfff1cc, emissiveIntensity: 0.25 });
      const face = new THREE.Mesh(fgeo, fmat);
      face.position.set(tx, ty + 12.5, tz + (k ? 2.85 : -2.85));
      if (k) face.rotateY(Math.PI);
      this.group.add(face); this.clockFaces.push(fmat);
      // 指针
      const hand = new THREE.Group();
      const hm = new THREE.MeshBasicMaterial({ color: 0x2a2118 });
      const long = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.35, 0.06), hm); long.position.y = 0.62;
      const short = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.9, 0.06), hm); short.position.y = 0.4;
      short.rotation.z = -1.1;
      hand.add(long, short);
      hand.position.set(tx, ty + 12.5, tz + (k ? 2.9 : -2.9));
      if (k) hand.rotation.y = Math.PI;
      hand.userData.long = long; hand.userData.short = short;
      this.group.add(hand);
      (this.clockHands ||= []).push(hand);
    }
    boxAt(trims, 1.3, 2.2, 0.3, tx, ty + 1.2, tz + 2.9, 0x4e3420);  // 楼门

    // 大酒馆「九酿居」
    const vx = 30, vz = -30, vy = terrainH(vx, vz);
    boxAt(walls, 11, 4.6, 8, vx, vy + 2.3, vz, 0xcfa878, Math.PI / 4);
    coneAt(roofs, Math.hypot(11, 8) / 2 * 1.3, 3.4, 4, vx, vy + 6.3, vz, 0x8a5236, Math.PI / 4 + Math.PI / 4);
    boxAt(trims, 6, 0.3, 3.4, vx - 5.2, vy + 2.6, vz + 2.4, 0x7a5a3a, Math.PI / 4); // 门廊雨棚
    boxAt(trims, 0.3, 2.6, 0.3, vx - 7.4, vy + 1.3, vz + 3.9, 0x5c4328);
    boxAt(trims, 0.3, 2.6, 0.3, vx - 3.0, vy + 1.3, vz + 0.9, 0x5c4328);
    boxAt(trims, 1.5, 2.4, 0.25, vx - 4.0, vy + 1.2, vz + 5.62, 0x3f2a16, Math.PI / 4); // 大门
    const sign = makeSign('九酿居'); sign.position.set(vx - 5.1, vy + 3.6, vz + 4.6); sign.rotation.y = Math.PI / 4;
    this.group.add(sign);
    // 灯笼
    this.lanternMats = [];
    for (const [lx, lz] of [[vx - 7.8, vz + 4.4], [vx - 2.4, vz + 5.4]]) {
      const lm = new THREE.MeshStandardMaterial({ color: 0x7a2c18, emissive: 0xff9d4e, emissiveIntensity: 0 });
      const l = new THREE.Mesh(new THREE.SphereGeometry(0.34, 10, 8), lm);
      l.position.set(lx, vy + 2.9, lz); this.group.add(l); this.lanternMats.push(lm);
    }

    // 学堂
    const sx = 18, sz = -44, sy = terrainH(sx, sz);
    boxAt(walls, 8.5, 3.8, 6, sx, sy + 1.9, sz, 0xd6c3a2, 0.5);
    coneAt(roofs, Math.hypot(8.5, 6) / 2 * 1.3, 2.8, 4, sx, sy + 5.2, sz, 0x74607a, 0.5 + Math.PI / 4);
    const sign2 = makeSign('学堂', 2.2); sign2.position.set(sx - 2.2, sy + 3.1, sz + 4.4); sign2.rotation.y = 0.5;
    this.group.add(sign2);

    // 铁匠铺（东，永远烧着炉火）
    const fx = 44, fz = 18, fy = terrainH(fx, fz);
    boxAt(walls, 7.5, 3.4, 6.5, fx, fy + 1.7, fz, 0x9c8468, 0.9);
    coneAt(roofs, 5.6, 2.4, 4, fx, fy + 4.6, fz, 0x554438, 0.9 + Math.PI / 4);
    boxAt(stones, 1.6, 2.2, 1.6, fx + 4.2, fy + 3.4, fz + 2.4, 0x7d766b);
    this.forgeGlow = new THREE.MeshStandardMaterial({ color: 0x441c08, emissive: 0xff7a2e, emissiveIntensity: 1.6 });
    const coal = new THREE.Mesh(new THREE.SphereGeometry(0.7, 10, 8), this.forgeGlow);
    coal.position.set(fx + 2.4, fy + 0.5, fz + 4.4); this.group.add(coal);
    boxAt(trims, 1.6, 0.9, 0.8, fx + 2.4, fy + 0.45, fz + 4.4, 0x3c3630);
    const sign3 = makeSign('铁匠铺', 2.2); sign3.position.set(fx - 2.6, fy + 2.8, fz + 4.6); sign3.rotation.y = 0.9;
    this.group.add(sign3);
    this.chimneys.push(new THREE.Vector3(fx + 4.2, fy + 4.8, fz + 2.4));
    // 铁砧
    boxAt(trims, 1.0, 0.55, 0.45, fx - 1.6, fy + 0.9, fz + 3.6, 0x3a3a40, 0.9);

    // 风车（西山丘顶）
    const mx = -78, mz = -14, my = terrainH(mx, mz);
    cylAt(stones, 2.6, 3.4, 11, 8, mx, my + 5.5, mz, 0xb3a184);
    coneAt(roofs, 3.1, 2.6, 8, mx, my + 12.3, mz, 0x6e4f3a);
    const blades = new THREE.Group();
    const bm = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, flatShading: true });
    const bgeos = [];
    for (let k = 0; k < 4; k++) {
      const g = new THREE.BoxGeometry(1.15, 8.2, 0.16); paint(g, 0xe6d4ae);
      const hub = new THREE.BoxGeometry(0.5, 0.5, 0.5); paint(hub, 0x5c4328);
      g.translate(0, 4.3, 0);
      const gg = mergeGeometries([g]); gg.rotateZ((k / 4) * Math.PI * 2);
      bgeos.push(gg);
    }
    const bladeMesh = new THREE.Mesh(mergeGeometries(bgeos), bm);
    bladeMesh.position.set(mx, my + 10.8, mz + 3.1);
    bladeMesh.castShadow = true;
    blades.add(bladeMesh);
    this.group.add(blades);
    this.windmill = blades;
    const sign4 = makeSign('磨坊', 2.0); sign4.position.set(mx, my + 3.4, mz + 3.5);
    this.group.add(sign4);

    const wallMesh = new THREE.Mesh(mergeGeometries(walls), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true }));
    const roofMesh = new THREE.Mesh(mergeGeometries(roofs), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, flatShading: true }));
    const trimMesh = new THREE.Mesh(mergeGeometries(trims), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true }));
    const stoneMesh = new THREE.Mesh(mergeGeometries(stones), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true }));
    for (const m of [wallMesh, roofMesh, trimMesh, stoneMesh]) { m.castShadow = true; m.receiveShadow = true; this.group.add(m); }
  }

  /* ── 广场：喷泉 / 水井 / 市集 / 长椅 / 彩旗 / 麦田 / 稻草人 ── */
  _buildPlaza() {
    const stones = [], trims = [], woods = [];
    // 喷泉（三层叠盘）
    cylAt(stones, 7.0, 7.6, 1.35, 16, 0, 0.66, 0, 0xb2a68f);
    cylAt(stones, 6.0, 6.0, 0.32, 16, 0, 1.16, 0, 0x7fa0a8);
    cylAt(stones, 1.0, 1.25, 3.2, 12, 0, 2.6, 0, 0xb2a68f);
    cylAt(stones, 2.6, 0.3, 0.7, 14, 0, 4.4, 0, 0xb2a68f);
    cylAt(stones, 1.9, 1.9, 0.25, 14, 0, 3.6, 0, 0x7fa0a8);
    cylAt(stones, 0.5, 0.7, 1.0, 10, 0, 5.2, 0, 0xb2a68f);
    this.fountainTop = new THREE.Vector3(0, 5.7, 0);
    // 水井
    const wx = -14, wz = 12, wy = terrainH(wx, wz);
    cylAt(stones, 1.15, 1.25, 1.15, 10, wx, wy + 0.57, wz, 0x968d7c);
    boxAt(woods, 0.18, 2.4, 0.18, wx - 0.9, wy + 1.2, wz, 0x6b5138);
    boxAt(woods, 0.18, 2.4, 0.18, wx + 0.9, wy + 1.2, wz, 0x6b5138);
    coneAt(woods, 1.7, 0.9, 4, wx, wy + 2.85, wz, 0x8a5a3c, Math.PI / 4);
    cylAt(woods, 0.09, 0.09, 1.9, 6, wx, wy + 2.0, wz, 0x4e3420);

    // 市集摊位 ×4（条纹棚）
    const stripeTex = (c1, c2) => {
      const cv = document.createElement('canvas'); cv.width = 64; cv.height = 64;
      const g = cv.getContext('2d');
      for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? c1 : c2; g.fillRect(i * 8, 0, 8, 64); }
      const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 1); return t;
    };
    const stalls = [[44, -2, 0, '#d8493e', '#f2e3c8'], [47, 5, 0.4, '#3e7ad8', '#f2e3c8'], [41, -9, -0.5, '#d8a43e', '#42382c'], [50, 11, 0.9, '#5a48a8', '#f2e3c8']];
    for (const [px, pz, ry0, c1, c2] of stalls) {
      const py = terrainH(px, pz);
      const g = new THREE.BoxGeometry(4.4, 0.22, 2.6);
      const aw = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: stripeTex(c1, c2), roughness: 0.8, side: THREE.DoubleSide }));
      aw.position.set(px, py + 2.5, pz); aw.rotation.set(-0.35, ry0, 0); aw.castShadow = true;
      this.group.add(aw);
      boxAt(woods, 4.2, 0.9, 2.2, px, py + 0.45, pz, 0x8a6a44, ry0);
      for (const [ox, oz] of [[-2, -1.1], [2, -1.1], [-2, 1.1], [2, 1.1]]) {
        boxAt(woods, 0.14, 2.6, 0.14, px + Math.cos(ry0) * ox + Math.sin(ry0) * oz, py + 1.3, pz - Math.sin(ry0) * ox + Math.cos(ry0) * oz, 0x6b5138);
      }
      // 货物
      cylAt(woods, 0.4, 0.42, 0.7, 8, px + Math.sin(ry0) * 1.2, py + 1.28, pz + Math.cos(ry0) * 1.2, 0xb08850);
      boxAt(woods, 0.7, 0.5, 0.7, px - Math.cos(ry0) * 1.1, py + 1.16, pz + Math.sin(ry0) * 1.1, 0x9c7848, ry0);
    }

    // 长椅 ×6（环广场）
    for (let k = 0; k < 6; k++) {
      const a = k / 6 * Math.PI * 2 + 0.3;
      const bx = Math.cos(a) * 18.5, bz = Math.sin(a) * 18.5, by = terrainH(bx, bz);
      boxAt(woods, 2.4, 0.14, 0.62, bx, by + 0.5, bz, 0x8a6a44, -a);
      boxAt(woods, 2.4, 0.5, 0.12, bx + Math.cos(a) * 0.3, by + 0.78, bz + Math.sin(a) * 0.3, 0x8a6a44, -a);
      boxAt(woods, 0.14, 0.5, 0.5, bx - Math.sin(a) * 1.0, by + 0.25, bz + Math.cos(a) * 1.0, 0x5c4328);
      boxAt(woods, 0.14, 0.5, 0.5, bx + Math.sin(a) * 1.0, by + 0.25, bz - Math.cos(a) * 1.0, 0x5c4328);
    }

    // 彩旗（挂广场上空）
    const flagGeos = [];
    const flagCols = [PAL.gold, PAL.rose, PAL.cyan, PAL.leaf, PAL.lav, PAL.ember];
    const poles = [];
    for (let k = 0; k < 6; k++) {
      const a = k / 6 * Math.PI * 2 + 0.5;
      poles.push([Math.cos(a) * 23, Math.sin(a) * 23]);
    }
    for (const [px, pz] of poles) {
      const py = terrainH(px, pz);
      cylAt(woods, 0.09, 0.12, 6.4, 6, px, py + 3.2, pz, 0x6b5138);
    }
    for (let k = 0; k < 6; k++) {
      const [ax, az] = poles[k], [bx, bz] = poles[(k + 1) % 6];
      const ay = terrainH(ax, az) + 6.1, by = terrainH(bx, bz) + 6.1;
      const sag = Math.hypot(bx - ax, bz - az) * 0.14;
      for (let j = 1; j < 11; j++) {
        const t = j / 11;
        const x = ax + (bx - ax) * t, z = az + (bz - az) * t;
        const y = ay + (by - ay) * t - Math.sin(t * Math.PI) * sag;
        const g = new THREE.ConeGeometry(0.32, 0.85, 3);
        paint(g, flagCols[(k + j) % flagCols.length]);
        g.rotateX(Math.PI);
        g.translate(x, y - 0.4, z);
        flagGeos.push(g);
      }
    }
    const flagMesh = new THREE.Mesh(mergeGeometries(flagGeos), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, flatShading: true, side: THREE.DoubleSide }));
    this.flagMesh = flagMesh;
    this.group.add(flagMesh);

    // 麦田（西区，风摆）
    const wheatGeo = new THREE.PlaneGeometry(1.35, 1.15); wheatGeo.translate(0, 0.57, 0);
    const wheatGeo2 = wheatGeo.clone(); wheatGeo2.rotateY(Math.PI / 2);
    const wCount = this.quality === 'high' ? 760 : 420;
    const phases = new Float32Array(wCount), wCols = new Float32Array(wCount * 3);
    const wMesh = new THREE.InstancedMesh(mergeGeometries([wheatGeo, wheatGeo2]), this._wheatMat(), wCount);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
    let wi = 0;
    for (let gx = -66; gx <= -34 && wi < wCount; gx += 2.4) {
      for (let gz = 6; gz <= 42 && wi < wCount; gz += 2.2) {
        if (vnoise(gx * 0.3, gz * 0.3) < 0.25) continue;
        if (Math.hypot(gx + 48, gz - 24) > 19) continue;
        const x = gx + (hash2(gx, gz) - 0.5) * 1.6, z = gz + (hash2(gz, gx) - 0.5) * 1.6;
        if (Math.abs(x + 44 - gz * 0.28) < 3.4) continue; // 让开田埂
        const y = terrainH(x, z);
        q.setFromEuler(new THREE.Euler(0, hash2(x, z) * Math.PI, 0));
        const s = 0.8 + hash2(gx * 3, gz * 3) * 0.5;
        sc.set(s, s, s);
        m4.compose(new THREE.Vector3(x, y, z), q, sc);
        wMesh.setMatrixAt(wi, m4);
        phases[wi] = hash2(x * 7, z * 7) * Math.PI * 2;
        _c.setHex(0xd8b25e).lerp(new THREE.Color(0xb89044), hash2(gx, gz * 3));
        wCols[wi * 3] = _c.r; wCols[wi * 3 + 1] = _c.g; wCols[wi * 3 + 2] = _c.b;
        wi++;
      }
    }
    wMesh.count = wi; wMesh.instanceMatrix.needsUpdate = true;
    wMesh.geometry.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phases, 1));
    wMesh.geometry.setAttribute('aCol', new THREE.InstancedBufferAttribute(wCols, 3));
    this.group.add(wMesh);
    this.wheatMesh = wMesh;
    // 稻草人
    const sx2 = -48, sz2 = 24, sy2 = terrainH(sx2, sz2);
    boxAt(woods, 0.16, 2.6, 0.16, sx2, sy2 + 1.3, sz2, 0x6b5138);
    boxAt(woods, 1.9, 0.14, 0.14, sx2, sy2 + 1.9, sz2, 0x6b5138);
    boxAt(trims, 0.9, 1.1, 0.5, sx2, sy2 + 1.75, sz2, 0xb0543e);
    coneAt(trims, 0.55, 0.5, 4, sx2, sy2 + 2.5, sz2, 0xc2a352, Math.PI / 4);
    const scMap = new THREE.Mesh(new THREE.SphereGeometry(0.32, 8, 8), new THREE.MeshStandardMaterial({ color: 0xe8d3a8 }));
    scMap.position.set(sx2, sy2 + 2.15, sz2); this.group.add(scMap);
  }

  _wheatMat() {
    if (this._swayMat) return this._swayMat;   // 共享一份风摆材质（麦田/花/芦苇统一驱动）
    const uni = { uTime: { value: 0 }, uFogColor: { value: new THREE.Color(0xd99a6a) }, uFogNear: { value: 70 }, uFogFar: { value: 340 }, uWind: { value: 1 } };
    this.wheatUni = uni;
    const mat = new THREE.ShaderMaterial({
      uniforms: uni, side: THREE.DoubleSide,
      vertexShader: `
        attribute mat4 instanceMatrix; attribute float aPhase; attribute vec3 aCol;
        uniform float uTime, uWind;
        varying vec3 vC; varying float vD;
        void main(){
          vec3 p = position;
          float sw = (sin(uTime*1.5 + aPhase) + sin(uTime*2.3 + aPhase*1.7)*0.4) * 0.16 * max(position.y, 0.2) * uWind;
          vec4 wp = modelMatrix * instanceMatrix * vec4(p.x + sw, p.y, p.z, 1.0);
          vC = aCol; vD = length((viewMatrix * wp).xyz);
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: `
        varying vec3 vC; varying float vD;
        uniform vec3 uFogColor; uniform float uFogNear, uFogFar;
        void main(){
          float f = smoothstep(uFogNear, uFogFar, vD);
          gl_FragColor = vec4(mix(vC, uFogColor, f), 1.0);
        }`,
    });
    this._swayMat = mat;
    return mat;
  }

  /* ── 自然：树 / 花 / 石头 / 蘑菇 / 芦苇 / 栈桥 / 小船 / 莲叶 ── */
  _buildNature() {
    const rnd = (() => { let s = 42; return () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; })();
    // 树（松 + 圆冠）
    const pineParts = [], trunkParts = [];
    const cPine = 0x3f6b38, cTrunk = 0x5c4328;
    coneAt(pineParts, 2.3, 3.2, 7, 0, 4.1, 0, cPine);
    coneAt(pineParts, 1.75, 2.7, 7, 0, 6.0, 0, 0x47793e);
    coneAt(pineParts, 1.15, 2.2, 7, 0, 7.6, 0, 0x528848);
    cylAt(trunkParts, 0.32, 0.42, 2.8, 6, 0, 1.4, 0, cTrunk);
    const pineGeo = mergeGeometries([...pineParts, ...trunkParts]);
    const roundGeo = (() => {
      const blob = new THREE.IcosahedronGeometry(2.1, 1); paint(blob, 0x5a8a46); blob.scale(1, 0.85, 1); blob.translate(0, 4.6, 0);
      const blob2 = new THREE.IcosahedronGeometry(1.5, 1); paint(blob2, 0x6b9a52); blob2.translate(1.1, 3.6, 0.4);
      const tr = new THREE.CylinderGeometry(0.3, 0.45, 3.2, 6); paint(tr, cTrunk); tr.translate(0, 1.6, 0);
      return mergeGeometries([blob, blob2, tr]);
    })();
    const treePts = [];
    for (let i = 0; i < 150; i++) {
      const a = rnd() * Math.PI * 2, r = 66 + rnd() * 62;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (Math.hypot(x - LAKE.x, z - LAKE.z) < LAKE.r + 5) continue;
      if (Math.abs(x) < 40 && Math.abs(z) < 40) continue;
      if (Math.hypot(x + 78, z + 14) < 18) continue;
      if (terrainH(x, z) < WATER_Y) continue;
      treePts.push([x, z, rnd(), rnd()]);
    }
    // 村内点缀几棵
    for (const [x, z] of [[-24, 18], [24, 20], [-20, -20], [26, -16], [12, 30]]) treePts.push([x, z, rnd(), rnd()]);
    const nMesh = new THREE.InstancedMesh(pineGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true }), treePts.length);
    const rMesh = new THREE.InstancedMesh(roundGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true }), treePts.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
    let pi = 0, ri = 0;
    for (const [x, z, r1, r2] of treePts) {
      const y = terrainH(x, z), s = 0.75 + r1 * 0.7;
      q.setFromEuler(new THREE.Euler(0, r2 * Math.PI * 2, 0));
      sc.set(s, s * (0.9 + r1 * 0.3), s);
      m4.compose(new THREE.Vector3(x, y - 0.15, z), q, sc);
      if (z < -40 || r1 > 0.62) { nMesh.setMatrixAt(pi++, m4); } else { rMesh.setMatrixAt(ri++, m4); }
    }
    nMesh.count = pi; rMesh.count = ri;
    nMesh.castShadow = rMesh.castShadow = true;
    this.group.add(nMesh, rMesh);
    this.treeCount = pi + ri;

    // 花丛（广场环 + 屋前）
    const fGeo = new THREE.PlaneGeometry(0.5, 0.5); fGeo.translate(0, 0.2, 0);
    const fGeo2 = fGeo.clone(); fGeo2.rotateY(Math.PI / 2);
    const fMat = this._wheatMat();
    const fCount = this.quality === 'high' ? 360 : 200;
    const fMesh = new THREE.InstancedMesh(mergeGeometries([fGeo, fGeo2]), fMat, fCount);
    const fPh = new Float32Array(fCount), fCols = new Float32Array(fCount * 3);
    const fColList = [0xff8fb0, 0xffcf7d, 0xfff3e0, 0xb48cff, 0x7fd8ff];
    let fi = 0;
    const putFlower = (x, z) => {
      if (fi >= fCount) return;
      const y = terrainH(x, z);
      m4.compose(new THREE.Vector3(x, y, z), q.setFromEuler(new THREE.Euler(0, rnd() * Math.PI, 0)), sc.set(1, 1, 1));
      fMesh.setMatrixAt(fi, m4);
      fPh[fi] = rnd() * Math.PI * 2;
      _c.setHex(fColList[Math.floor(rnd() * fColList.length)]);
      fCols[fi * 3] = _c.r; fCols[fi * 3 + 1] = _c.g; fCols[fi * 3 + 2] = _c.b;
      fi++;
    };
    for (let k = 0; k < 90; k++) {
      const a = rnd() * Math.PI * 2, r = 28.5 + rnd() * 3.2;
      putFlower(Math.cos(a) * r, Math.sin(a) * r);
    }
    for (const h of this.houses) for (let k = 0; k < 7; k++) putFlower(h.x + (rnd() - 0.5) * 9, h.z + (rnd() - 0.5) * 9);
    fMesh.count = fi; fMesh.instanceMatrix.needsUpdate = true;
    fMesh.geometry.setAttribute('aPhase', new THREE.InstancedBufferAttribute(fPh, 1));
    fMesh.geometry.setAttribute('aCol', new THREE.InstancedBufferAttribute(fCols, 3));
    this.group.add(fMesh);

    // 石头
    const rockGeo = new THREE.DodecahedronGeometry(0.7, 0); paint(rockGeo, 0x8d8676);
    const rockM = new THREE.InstancedMesh(rockGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true }), 26);
    for (let i = 0; i < 26; i++) {
      const a = rnd() * Math.PI * 2, r = 36 + rnd() * 60;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      m4.compose(new THREE.Vector3(x, terrainH(x, z), z), q.setFromEuler(new THREE.Euler(rnd(), rnd() * 3, rnd())), sc.set(0.6 + rnd(), 0.5 + rnd() * 0.6, 0.6 + rnd()));
      rockM.setMatrixAt(i, m4);
    }
    rockM.castShadow = true;
    this.group.add(rockM);

    // 蘑菇圈 ×2（夜光）
    this.shroomMat = new THREE.MeshStandardMaterial({ color: 0xe8dcc8, emissive: 0x6fe8c8, emissiveIntensity: 0 });
    const shroomGeo = mergeGeometries([
      (() => { const g = new THREE.CylinderGeometry(0.07, 0.1, 0.24, 5); paint(g, 0xe8dcc8); g.translate(0, 0.12, 0); return g; })(),
      (() => { const g = new THREE.ConeGeometry(0.2, 0.16, 7); paint(g, 0x6fe8c8); g.translate(0, 0.28, 0); return g; })(),
    ]);
    const shroomM = new THREE.InstancedMesh(shroomGeo, this.shroomMat, 26);
    let si = 0;
    for (const [cx, cz] of [[-30, -52], [36, -40]]) {
      const R0 = 2.6;
      for (let k = 0; k < 13 && si < 26; k++) {
        const a = k / 13 * Math.PI * 2;
        const x = cx + Math.cos(a) * R0, z = cz + Math.sin(a) * R0;
        m4.compose(new THREE.Vector3(x, terrainH(x, z), z), q.setFromEuler(new THREE.Euler(0, rnd() * 3, 0)), sc.set(1, 1, 1));
        shroomM.setMatrixAt(si++, m4);
      }
    }
    shroomM.count = si;
    this.group.add(shroomM);

    // 芦苇（湖畔）
    const reedGeo = new THREE.PlaneGeometry(0.16, 1.7); reedGeo.translate(0, 0.85, 0);
    const reedGeo2 = reedGeo.clone(); reedGeo2.rotateY(Math.PI / 2);
    const reedMat = this._wheatMat();
    const reedCount = 150;
    const reedM = new THREE.InstancedMesh(mergeGeometries([reedGeo, reedGeo2]), reedMat, reedCount);
    const rPh = new Float32Array(reedCount), rCols = new Float32Array(reedCount * 3);
    let di = 0;
    for (let i = 0; i < 300 && di < reedCount; i++) {
      const a = rnd() * Math.PI * 2, r = LAKE.r - 2 + rnd() * 5;
      const x = LAKE.x + Math.cos(a) * r, z = LAKE.z + Math.sin(a) * r;
      const y = terrainH(x, z);
      if (y < WATER_Y - 0.6 || y > WATER_Y + 0.8) continue;
      m4.compose(new THREE.Vector3(x, y, z), q.setFromEuler(new THREE.Euler(0, rnd() * 3, 0)), sc.set(1, 1, 1));
      reedM.setMatrixAt(di, m4);
      rPh[di] = rnd() * 6.28;
      _c.setHex(0x8a9a50).lerp(new THREE.Color(0xb0a45e), rnd());
      rCols[di * 3] = _c.r; rCols[di * 3 + 1] = _c.g; rCols[di * 3 + 2] = _c.b;
      di++;
    }
    reedM.count = di; reedM.instanceMatrix.needsUpdate = true;
    reedM.geometry.setAttribute('aPhase', new THREE.InstancedBufferAttribute(rPh, 1));
    reedM.geometry.setAttribute('aCol', new THREE.InstancedBufferAttribute(rCols, 3));
    this.group.add(reedM);

    // 栈桥
    const woods = [];
    const dockX = 2, planks = [];
    for (let i = 0; i < 9; i++) {
      const z = 63 + i * 1.5;
      boxAt(woods, 3.2, 0.22, 1.28, dockX, WATER_Y + 0.55, z, i % 2 ? 0x8a6a44 : 0x7d5f3c);
    }
    for (const [px, pz] of [[dockX - 1.5, 64], [dockX + 1.5, 64], [dockX - 1.5, 72], [dockX + 1.5, 72], [dockX - 1.5, 75], [dockX + 1.5, 75]]) {
      cylAt(woods, 0.14, 0.16, 2.4, 6, px, WATER_Y + 0.4, pz, 0x5c4328);
    }
    const dockMesh = new THREE.Mesh(mergeGeometries(woods), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true }));
    dockMesh.castShadow = true;
    this.group.add(dockMesh);
    // 小船
    const boat = new THREE.Group();
    const hullG = new THREE.CylinderGeometry(1.15, 0.55, 3.6, 6, 1);
    paint(hullG, 0x8a5f3c); hullG.rotateZ(Math.PI / 2); hullG.scale(1, 0.62, 1);
    const hull = new THREE.Mesh(hullG, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, flatShading: true }));
    hull.castShadow = true;
    const bench = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.1, 1.4), new THREE.MeshStandardMaterial({ color: 0x6b5138 }));
    bench.position.y = 0.3;
    boat.add(hull, bench);
    boat.position.set(6, WATER_Y + 0.28, 72);
    boat.rotation.y = 0.6;
    this.group.add(boat);
    this.boat = boat;
    // 莲叶
    const lilyG = new THREE.CircleGeometry(0.5, 7); lilyG.rotateX(-Math.PI / 2);
    const lilyM = new THREE.InstancedMesh(lilyG, new THREE.MeshStandardMaterial({ color: 0x4f7a3a, roughness: 0.7, side: THREE.DoubleSide }), 14);
    for (let i = 0; i < 14; i++) {
      const a = rnd() * Math.PI * 2, r = 10 + rnd() * 20;
      m4.compose(new THREE.Vector3(LAKE.x + Math.cos(a) * r, WATER_Y + 0.06, LAKE.z + Math.sin(a) * r), q.identity(), sc.set(0.7 + rnd() * 0.7, 1, 0.7 + rnd() * 0.7));
      lilyM.setMatrixAt(i, m4);
    }
    this.group.add(lilyM);
  }

  /* ── 路灯（夜晚亮起 + 地面光池） ── */
  _buildLights() {
    const posts = [], heads = [];
    this.lampPts = [];
    const addLamp = (x, z) => {
      const y = terrainH(x, z);
      cylAt(posts, 0.09, 0.13, 4.3, 6, x, y + 2.15, z, 0x3a3630);
      heads.push(new THREE.Vector3(x, y + 4.55, z));
      this.lampPts.push([x, y, z]);
    };
    for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2 + 0.5; addLamp(Math.cos(a) * 23, Math.sin(a) * 23); }
    for (let i = 0; i < 3; i++) { addLamp(0, 40 + i * 12); }
    for (let i = 0; i < 3; i++) { addLamp(38 + i * 10, 1 + i * 1.5); }
    addLamp(-42, 4); addLamp(-56, 2); addLamp(-64, -5); addLamp(-72, -7);
    addLamp(-26, -38); addLamp(20, -40); addLamp(26, 38); addLamp(48, 36);

    const postMesh = new THREE.Mesh(mergeGeometries(posts), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0.4, flatShading: true }));
    postMesh.castShadow = true;
    this.group.add(postMesh);
    this.lampMat = new THREE.MeshStandardMaterial({ color: 0x553c1c, emissive: 0xffc069, emissiveIntensity: 0 });
    const headMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.32, 10, 8), this.lampMat, heads.length);
    const m4 = new THREE.Matrix4();
    heads.forEach((p, i) => { m4.makeTranslation(p.x, p.y, p.z); headMesh.setMatrixAt(i, m4); });
    this.group.add(headMesh);

    // 地面光池
    this.poolUni = { uNight: { value: 0 }, uColor: { value: new THREE.Color(0xffbe6a) } };
    const poolGeo = new THREE.CircleGeometry(6.8, 20); poolGeo.rotateX(-Math.PI / 2);
    const poolMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: this.poolUni,
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }`,
      fragmentShader: `varying vec2 vUv; uniform float uNight; uniform vec3 uColor;
        void main(){ float d = length(vUv - 0.5) * 2.0; float a = pow(1.0 - clamp(d,0.,1.), 1.8) * 0.75 * uNight; gl_FragColor = vec4(uColor * a, a); }`,
    });
    const poolMesh = new THREE.InstancedMesh(poolGeo, poolMat, this.lampPts.length);
    this.lampPts.forEach(([x, y, z], i) => { m4.makeTranslation(x, y + 0.06, z); poolMesh.setMatrixAt(i, m4); });
    this.group.add(poolMesh);
  }

  /* ── 每帧 ── */
  update(dt, t, timeSec, night) {
    if (this.windmill) this.windmill.rotation.z += dt * 0.5;
    if (this.boat) {
      this.boat.position.y = WATER_Y + 0.28 + Math.sin(timeSec * 0.7) * 0.09;
      this.boat.rotation.z = Math.sin(timeSec * 0.5) * 0.035;
      this.boat.rotation.x = Math.sin(timeSec * 0.33) * 0.02;
    }
    if (this.clockHands) {
      const ang = t * Math.PI * 2;
      this.clockHands.forEach(h => { h.userData.long.rotation.z = -ang * 12; h.userData.short.rotation.z = -ang; });
    }
    if (this.waterUni) {
      this.waterUni.uTime.value = timeSec;
      this.waterUni.uNight.value = night;
      const { a, b, f } = lerpKeys(t);
      const az = a.sunAz + (b.sunAz - a.sunAz) * f;
      this.waterUni.uSunAz.value.set(Math.cos(az), Math.sin(az));
      this.waterUni.uHorizon.value.setHex(a.hor).lerp(new THREE.Color().setHex(b.hor), f);
    }
    if (this.wheatUni) this.wheatUni.uTime.value = timeSec;
    if (this.winMat) this.winMat.emissiveIntensity = night * 2.4;
    if (this.lampMat) this.lampMat.emissiveIntensity = night * 3.2;
    if (this.poolUni) this.poolUni.uNight.value = night;
    if (this.shroomMat) this.shroomMat.emissiveIntensity = night * 1.1;
    if (this.lanternMats) this.lanternMats.forEach(m => m.emissiveIntensity = 0.2 + night * 2.6);
    if (this.clockFaces) this.clockFaces.forEach(m => m.emissiveIntensity = 0.25 + night * 1.3);
    if (this.flagMesh) this.flagMesh.rotation.y = Math.sin(timeSec * 0.8) * 0.006;
  }
  setFogColor(c) { this._fogColor = c; if (this.wheatUni) this.wheatUni.uFogColor.value.copy(c); }
}
