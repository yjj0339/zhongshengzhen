// 众生镇 · 智能体：决策 / 寻路 / 对话 / 记忆 / 谣言
import * as THREE from 'three';
import { terrainH } from './town.js';
import { Spirits } from './spirits.js';
import { Threads } from './threads.js';
import { PEOPLE, CHAT, GREET, FAREWELL } from './people.js';
import { bus } from './config.js';

/* ── 对话气泡（Sprite 池） ── */
const bubbleCache = new Map();
function bubbleTexture(text) {
  if (bubbleCache.has(text)) return bubbleCache.get(text);
  const cv = document.createElement('canvas');
  const pad = 28, fs = 44;
  const font = `500 ${fs}px "PingFang SC","Microsoft YaHei",sans-serif`;
  const ctx0 = cv.getContext('2d');
  ctx0.font = font;
  const w = Math.min(ctx0.measureText(text).width + pad * 2, 560);
  cv.width = w; cv.height = 96;
  const g = cv.getContext('2d');
  g.font = font;
  g.fillStyle = 'rgba(12,16,30,0.82)';
  const r = 26;
  g.beginPath();
  g.moveTo(r, 8); g.lineTo(w - r, 8); g.quadraticCurveTo(w - 8, 8, w - 8, r + 8);
  g.lineTo(w - 8, 88 - r); g.quadraticCurveTo(w - 8, 88, w - r, 88);
  g.lineTo(r, 88); g.quadraticCurveTo(8, 88, 8, 88 - r);
  g.lineTo(8, r + 8); g.quadraticCurveTo(8, 8, r, 8);
  g.fill();
  g.strokeStyle = 'rgba(255,207,125,0.4)'; g.lineWidth = 3; g.stroke();
  g.fillStyle = '#f4ecdc';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, w / 2, 50, w - pad * 2);
  const tx = new THREE.CanvasTexture(cv);
  const tex = { tx, w: w / 96 };
  bubbleCache.set(text, tex);
  if (bubbleCache.size > 90) { const k0 = bubbleCache.keys().next().value; bubbleCache.delete(k0); }
  return tex;
}

class Bubbles {
  constructor(scene) {
    this.pool = [];
    for (let i = 0; i < 14; i++) {
      const mat = new THREE.SpriteMaterial({ transparent: true, depthWrite: false, depthTest: false, opacity: 0 });
      const sp = new THREE.Sprite(mat);
      sp.renderOrder = 20;
      sp.visible = false;
      scene.add(sp);
      this.pool.push({ sp, until: 0 });
    }
  }
  show(text, x, y, z, dur) {
    const slot = this.pool.find(s => !s.sp.visible) || this.pool[0];
    const tex = bubbleTexture(text);
    slot.sp.material.map = tex.tx;
    slot.sp.material.needsUpdate = true;
    slot.sp.scale.set(tex.w * 0.62, 0.62, 1);
    slot.sp.position.set(x, y, z);
    slot.sp.visible = true;
    slot.sp.material.opacity = 0;
    slot.until = dur;
    slot.age = 0;
  }
  update(dt) {
    for (const s of this.pool) {
      if (!s.sp.visible) continue;
      s.age += dt;
      const left = s.until - s.age;
      if (left <= 0) { s.sp.visible = false; continue; }
      const o = Math.min(1, s.age * 5) * Math.min(1, left * 2.2);
      s.sp.material.opacity = o * 0.95;
      s.sp.position.y += dt * 0.12;
    }
  }
}

/* ── 智能体 ── */
let UID = 0;
class Agent {
  constructor(def, town) {
    this.id = UID++;
    this.def = def;
    this.name = def.name; this.job = def.job; this.intro = def.intro; this.talkStyle = def.talk;
    this.baseColor = new THREE.Color(def.hue);
    this.town = town;
    this.p = new THREE.Vector3();
    this.faceA = Math.random() * 6.28;
    this.state = 'idle';
    this.path = []; this.pathI = 0;
    this.target = null;          // {x,z,node}
    this.goalSite = null;
    this.needs = { social: Math.random() * 0.6 + 0.2, rest: Math.random() * 0.4, play: Math.random() * 0.6 };
    this.emotion = 'calm'; this.emotionUntil = 0;
    this.scale = 1; this.talking = false; this.blessed = 0;
    this.memories = [];
    this.affinity = new Map();
    this.chatUntil = 0; this.chatPartner = null; this.chatLines = null; this.chatLineI = 0; this.chatNext = 0;
    this.lastChat = -999;
    this.decideAt = Math.random() * 0.8;
    this.speed = 2.1 + Math.random() * 0.9;
    this.danceA = Math.random() * 6.28;
    this.watchMeteor = 0;
    this.sleeping = false;
    this.arrived = true;
    // 出生点
    const s = town.graph.sites.plaza;
    const a = Math.random() * 6.28;
    this.x = s.x + Math.cos(a) * 8; this.z = s.z + Math.sin(a) * 8;
  }
  get isKid() { return this.job.includes('双胞胎') || this.job === '牧童'; }
  say(text, dur) { bus.emit('bubble', { a: this, text, dur: dur || 3.4 }); }
  addMemory(txt, kind) {
    this.memories.unshift({ txt, kind: kind || 'good', day: this._day || 1 });
    if (this.memories.length > 6) this.memories.pop();
  }
  affOf(id) { return this.affinity.get(id) || 0; }
  affAdd(id, v) { this.affinity.set(id, Math.max(-30, Math.min(80, this.affOf(id) + v))); }
}

/* ── 世界（居民总控） ── */
export class World {
  constructor(scene, town, quality) {
    this.town = town;
    this.agents = PEOPLE.map(d => new Agent(d, town));
    // 分配家与工作点
    const doors = town.graph.doorIdx, sites = town.graph.sites;
    this.agents.forEach((a, i) => {
      a.homeNode = doors[i % doors.length];
      a.workNode = sites[a.def.site] !== undefined ? sites[a.def.site] : sites.plaza;
      const h = town.graph.nodes[a.homeNode];
      a.x = h.x; a.z = h.z;
    });
    this.spirits = new Spirits(scene, this.agents, quality);
    this.threads = new Threads(scene, this.agents, quality);
    this.bubbles = new Bubbles(scene);
    this.rumors = [];
    this.day = 1;
    this.festival = 0;
    bus.on('bubble', ({ a, text, dur }) => {
      this.bubbles.show(text, a.p.x, a.p.y + 1.15, a.p.z, dur);
      a.talking = true;
      setTimeout(() => { a.talking = false; }, dur * 900);
    });
    bus.on('day', () => { this.day++; this.agents.forEach(a => { a.needs.rest = Math.max(0, a.needs.rest - 0.3); }); });
  }

  nearestNode(x, z) {
    const ns = this.town.graph.nodes;
    let bi = 0, bd = 1e9;
    for (const n of ns) { const d = (n.x - x) ** 2 + (n.z - z) ** 2; if (d < bd) { bd = d; bi = n.i; } }
    return bi;
  }

  pathTo(fromX, fromZ, toNode) {
    const { nodes, adj } = this.town.graph;
    const start = this.nearestNode(fromX, fromZ);
    // BFS
    const prev = new Array(nodes.length).fill(-1);
    const seen = new Uint8Array(nodes.length);
    const q = [start]; seen[start] = 1;
    while (q.length) {
      const cur = q.shift();
      if (cur === toNode) break;
      for (const [nb] of adj[cur]) if (!seen[nb]) { seen[nb] = 1; prev[nb] = cur; q.push(nb); }
    }
    if (!seen[toNode]) return [toNode];
    const path = [];
    let c = toNode;
    while (c !== -1 && c !== start) { path.unshift(c); c = prev[c]; }
    return path;
  }

  goTo(a, node) {
    if (node === undefined || node === null || !this.town.graph.nodes[node]) {
      console.error('[zhongshengzhen] goTo 非法节点:', node, '| agent:', a.name, '| state:', a.state, new Error().stack);
      return;
    }
    a.path = this.pathTo(a.x, a.z, node);
    a.pathI = 0;
    a.state = 'goto';
    a.arrived = false;
  }

  /* ── 事件 API（导演调用） ── */
  gatherAt(siteKey, dur, emotion) {
    const sites = this.town.graph.sites;
    const site = sites[siteKey] !== undefined ? sites[siteKey] : sites.plaza;
    const n = this.town.graph.nodes[site];
    for (const a of this.agents) {
      if (a.sleeping) continue;
      a.goalSite = siteKey;
      a.eventUntil = performance.now() / 1000 + dur;
      if (emotion) this.setEmotion(a, emotion, dur);
      const ang = Math.random() * 6.28, r = 3 + Math.random() * 12;
      a._eventSpot = { x: n.x + Math.cos(ang) * r, z: n.z + Math.sin(ang) * r, node: site };
      this.goTo(a, site);
    }
  }
  goHomeAll() {
    for (const a of this.agents) if (!a.sleeping) { this.goTo(a, a.homeNode); a._goingHome = true; }
  }
  setEmotion(a, e, dur) { a.emotion = e; a.emotionUntil = performance.now() / 1000 + (dur || 20); }
  spreadRumor(txt, kind, fromName) {
    const id = 'R' + Math.random().toString(36).slice(2, 7);
    const rumor = { id, txt, kind: kind || 'rumor', spread: 0 };
    this.rumors.push(rumor);
    // 从随机人开始传
    const a = this.agents[Math.floor(Math.random() * this.agents.length)];
    a.addMemory(txt, kind);
    a._hasRumor = rumor;
    if (fromName) bus.emit('log', { tag: '传闻', text: `${fromName}说：「${txt}」`, rumor: true });
    else bus.emit('log', { tag: '传闻', text: `镇上开始流传：「${txt}」`, rumor: true });
    return rumor;
  }
  quarrel(a, b) {
    a.affAdd(b.id, -10); b.affAdd(a.id, -10);
    this.setEmotion(a, 'angry', 26); this.setEmotion(b, 'angry', 26);
    this.threads.pulse(a, b, [1, 0.25, 0.18]);
    bus.emit('log', { tag: '口角', text: `${a.name} 和 ${b.name} 在广场上吵了几句。`, rumor: false });
  }
  makeFriends(a, b) {
    a.affAdd(b.id, 24); b.affAdd(a.id, 24);
    this.threads.pulse(a, b, [1, 0.8, 0.35]);
  }
  bless(a) {
    a.blessed = performance.now() / 1000 + 26;
    this.setEmotion(a, 'love', 22);
    a.say('……我好像听到了什么温柔的东西。', 3.4);
    bus.emit('log', { tag: '赐福', text: `${a.name} 被神明赐福了，光都变亮了几分。` });
  }

  /* ── 每帧 ── */
  update(dt, timeSec, t, day) {
    const now = timeSec;
    const night = t > 0.86 || t < 0.235;
    for (const a of this.agents) {
      a._day = day;
      // 情绪到期回落
      if (a.emotionUntil && now > a.emotionUntil && a.emotion !== 'calm' && a.emotion !== 'sleep') { a.emotion = 'calm'; a.emotionUntil = 0; }
      if (a.blessed && now > a.blessed) a.blessed = 0;

      // 决策
      a.decideAt -= dt;
      if (a.decideAt <= 0 && a.state !== 'chat' && a.state !== 'dance') {
        a.decideAt = 0.5 + Math.random() * 0.5;
        this._decide(a, t, night);
      }

      // 移动
      this._move(a, dt, night, timeSec);

      // 聊天推进
      if (a.state === 'chat') this._chatTick(a, dt, now);
    }

    // 聊天配对
    this._pairTimer = (this._pairTimer || 0) - dt;
    if (this._pairTimer <= 0) {
      this._pairTimer = 0.7;
      this._tryPairChats(t);
    }

    // 魂体与光丝
    for (const a of this.agents) {
      a.p.set(a.x, terrainH(a.x, a.z) + 1.35 + Math.sin(timeSec * 1.7 + a.id * 1.9) * 0.12, a.z);
      if (a.sleeping) a.scale = 0.55; else if (a.state === 'dance') a.scale = 1.18; else a.scale = 1;
    }
    this.spirits.update(dt, timeSec);
    this.threads.update(dt, timeSec);
    this.bubbles.update(dt);
  }

  _decide(a, t, night) {
    const now = performance.now() / 1000;
    // 事件优先
    if (a.eventUntil && now < a.eventUntil && a._eventSpot) {
      if (a.state === 'idle') { const d = Math.hypot(a.x - a._eventSpot.x, a.z - a._eventSpot.z); if (d > 2.5) this.goTo(a, a._eventSpot.node); }
      return;
    }
    if (a.eventUntil && now >= a.eventUntil) { a.eventUntil = 0; a._eventSpot = null; a.goalSite = null; }
    // 夜晚回家睡
    if (night && !a.sleeping) {
      this.goTo(a, a.homeNode);
      a.state = 'goto';
      a._goingHome = true;
      return;
    }
    if (!night && a.sleeping) {
      a.sleeping = false; a.emotion = 'calm';
      if (Math.random() < 0.4) a.say('早安——又是新的一天。', 3);
    }
    if (a.state !== 'idle') return;

    // 需求增长
    a.needs.social = Math.min(1, a.needs.social + 0.012);
    a.needs.play = Math.min(1, a.needs.play + 0.008);

    const sites = this.town.graph.sites;
    const roll = Math.random();
    if (a.isKid) {
      // 孩子满镇玩
      const opts = ['plaza', 'eastGarden', 'farm', 'well'];
      const pick = opts[Math.floor(Math.random() * opts.length)];
      if (roll < 0.5) { this.goTo(a, sites[pick]); a.goalSite = pick; }
      return;
    }
    // 白天工作倾向，傍晚上街
    const evening = t > 0.70 && t < 0.86;
    if (roll < (evening ? 0.25 : 0.62)) {
      this.goTo(a, a.workNode);
      a.goalSite = null;
      a.needs.rest = Math.min(1, a.needs.rest + 0.15);
    } else if (roll < 0.78 || a.needs.social > 0.55) {
      const opts = ['plaza', 'tavern', 'well', 'dock', 'market'];
      const pick = opts[Math.floor(Math.random() * opts.length)];
      this.goTo(a, sites[pick]);
      a.goalSite = pick;
      a.needs.social = Math.max(0, a.needs.social - 0.2);
    } else {
      // 在附近溜达
      const n = this.town.graph.nodes[a.workNode];
      a._eventSpot = { x: n.x + (Math.random() - 0.5) * 14, z: n.z + (Math.random() - 0.5) * 14, node: a.workNode };
      a.eventUntil = now + 4;
    }
  }

  _move(a, dt, night, timeSec) {
    if (a.state === 'dance') {
      a.danceA += dt * 0.7;
      const r = 9 + (a.id % 4);
      const ft = this.town.fountainTop || { x: 0, z: 0 };
      a.x = ft.x + Math.cos(a.danceA) * r;
      a.z = ft.z + Math.sin(a.danceA) * r;
      return;
    }
    if (a.state !== 'goto' || !a.path) return;
    const nodes = this.town.graph.nodes;
    let tx, tz;
    if (a.pathI < a.path.length) {
      const n = nodes[a.path[a.pathI]];
      if (!n) { a.state = 'idle'; a.path = []; return; }
      tx = n.x; tz = n.z;
    } else if (a._eventSpot) { tx = a._eventSpot.x; tz = a._eventSpot.z; }
    else {
      // 到达
      a.state = 'idle'; a.path = []; a.arrived = true;
      if (a._goingHome) { a._goingHome = false; a.sleeping = true; a.emotion = 'sleep'; a.eventUntil = 0; }
      return;
    }
    const dx = tx - a.x, dz = tz - a.z;
    const d = Math.hypot(dx, dz);
    const sp = a.speed * (a.sleeping ? 0.5 : 1) * (a.emotion === 'fear' ? 1.6 : 1);
    if (d < 1.2) {
      if (a.pathI < a.path.length) a.pathI++;
    } else {
      a.x += dx / d * sp * dt;
      a.z += dz / d * sp * dt;
      a.faceA = Math.atan2(dx, dz);
    }
  }

  _tryPairChats(t) {
    const idle = this.agents.filter(a => (a.state === 'idle' || (a.state === 'goto' && a.arrived)) && !a.sleeping && performance.now() / 1000 - a.lastChat > 24);
    for (let i = 0; i < idle.length; i++) {
      for (let j = i + 1; j < idle.length; j++) {
        const a = idle[i], b = idle[j];
        if (a.state === 'chat' || b.state === 'chat') continue;
        const d = Math.hypot(a.x - b.x, a.z - b.z);
        if (d > 13 || d < 1.5) continue;
        const want = (a.needs.social + b.needs.social) / 2;
        if (Math.random() > 0.25 + want * 0.55) continue;
        this._startChat(a, b, t);
        break;
      }
    }
  }

  _startChat(a, b, t) {
    a.lastChat = performance.now() / 1000; b.lastChat = a.lastChat;
    a.state = b.state = 'chat';
    a.chatPartner = b; b.chatPartner = a;
    a.needs.social = 0; b.needs.social = 0;
    a.affAdd(b.id, 2); b.affAdd(a.id, 2);
    // 话题
    const topics = ['daily', 'weather', 'food', 'work'];
    if (t > 0.8) topics.push('night', 'night', 'lake');
    if (t > 0.6 && t < 0.8) topics.push('poetry');
    const kid = a.isKid || b.isKid;
    if (kid) topics.push('kids', 'kids');
    // 谣言传播
    let rumor = null;
    if (a._hasRumor && Math.random() < 0.75) rumor = { from: a, r: a._hasRumor };
    else if (b._hasRumor && Math.random() < 0.75) rumor = { from: b, r: b._hasRumor };
    const lines = [];
    lines.push(GREET[Math.floor(Math.random() * GREET.length)].replace(/\{o\}/g, b.name));
    const pickTopic = () => {
      const tp = topics[Math.floor(Math.random() * topics.length)];
      const pool = CHAT[tp];
      return pool[Math.floor(Math.random() * pool.length)];
    };
    const l1 = pickTopic(), l2 = pickTopic();
    lines.push(l1); lines.push(l2);
    if (rumor) {
      const holder = rumor.from, other = holder === a ? b : a;
      lines.push(rumor.r.txt + '——你可别说出去。');
      other.addMemory(rumor.r.txt, rumor.r.kind);
      other._hasRumor = { ...rumor.r };
      rumor.r.spread++;
      this.threads.pulse(holder, other, rumor.r.kind === 'bad' ? [1, 0.28, 0.2] : [1, 0.85, 0.4]);
      bus.emit('log', { tag: '传谣', text: `「${rumor.r.txt}」从 ${holder.name} 传给了 ${other.name}（已传 ${rumor.r.spread} 人）`, rumor: rumor.r.kind === 'bad' });
    }
    lines.push(FAREWELL[Math.floor(Math.random() * FAREWELL.length)]);
    a.chatLines = lines; a.chatLineI = 0; a.chatNext = 0;
    a.chatUntil = b.chatUntil = performance.now() / 1000 + lines.length * 3.6 + 2;
    a.faceA = Math.atan2(b.x - a.x, b.z - a.z);
    b.faceA = Math.atan2(a.x - b.x, a.z - b.z);
  }

  _chatTick(a, dt, now) {
    const b = a.chatPartner;
    if (!b || b.chatPartner !== a || performance.now() / 1000 > a.chatUntil) {
      a.state = 'idle'; a.chatPartner = null; a.chatLines = null;
      if (b && b.chatPartner === a) { b.state = 'idle'; b.chatPartner = null; b.chatLines = null; }
      return;
    }
    a.chatNext -= dt;
    if (a.chatNext <= 0 && a.chatLines && a.chatLineI < a.chatLines.length) {
      const line = a.chatLines[a.chatLineI];
      a.say(line, 3.2);
      a.chatLineI++;
      a.chatNext = 3.6;
      // b 只是听（简单化：一半的话由 b 说）
      if (a.chatLineI < a.chatLines.length) {
        const bLine = a.chatLines[a.chatLineI];
        setTimeout(() => { if (b.state === 'chat') b.say(bLine, 3.2); }, 3500);
        a.chatLineI++;
      }
    }
  }
}
