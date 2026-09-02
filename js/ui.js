// 众生镇 · UI 绑定
import { G, bus, CFG, phaseName, WEATHER_NAME, QPARAM } from './config.js';

const $ = (id) => document.getElementById(id);

export class UI {
  constructor(world, oracle, town, director) {
    this.world = world;
    this.oracle = oracle;
    this.town = town;
    this.director = director;
    this.selected = null;

    // ── HUD 时钟 ──
    this.el = {
      dayN: $('dayN'), timeN: $('timeN'), weatherN: $('weatherN'), popN: $('popN'),
      feed: $('feed'), reply: $('reply'), replyTxt: $('replyTxt'),
      oracleInput: $('oracleInput'), oracleBtn: $('oracleBtn'), chips: $('chips'),
      dossier: $('dossier'), toast: $('toast'),
    };

    // ── 日志 ──
    this.logs = [];
    bus.on('log', ({ tag, text, rumor }) => this.addLog(tag, text, rumor));

    // ── 神谕 ──
    const submit = async () => {
      const q = this.el.oracleInput.value.trim();
      if (!q) return;
      this.el.oracleInput.value = '';
      this.showReply('……');
      const r = await this.oracle.ask(q);
      this.showReply(r.reply);
      bus.emit('audio', 'oracle');
    };
    this.el.oracleBtn.addEventListener('click', submit);
    this.el.oracleInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
    this.el.chips.addEventListener('click', (e) => {
      const chip = e.target.closest('.chip');
      if (!chip) return;
      this.el.oracleInput.value = chip.dataset.q;
      submit();
    });

    // ── 名录 ──
    $('btnRoster').addEventListener('click', () => this.openRoster());
    document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => $(b.dataset.close).classList.remove('show')));
    document.querySelectorAll('.modal').forEach(m => m.addEventListener('click', (e) => { if (e.target === m) m.classList.remove('show'); }));

    // ── 运镜 ──
    this.camModes = ['orbit', 'cinema', 'follow'];
    $('btnCam').addEventListener('click', () => {
      const i = this.camModes.indexOf(G.camMode);
      G.camMode = this.camModes[(i + 1) % 3];
      $('btnCam').textContent = G.camMode === 'orbit' ? '环景' : G.camMode === 'cinema' ? '自动' : '跟随';
      $('btnCam').classList.toggle('on', G.camMode !== 'orbit');
      if (G.camMode === 'cinema') G.focus = null;
    });

    // ── 设置 ──
    $('btnSettings').addEventListener('click', () => $('mSettings').classList.add('show'));
    const segQ = $('segQuality');
    segQ.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      const cur = new URLSearchParams(location.search);
      cur.set('q', b.dataset.v);
      location.search = cur.toString();
    });
    segQ.querySelector(`[data-v="${G.quality}"]`)?.classList.add('on');
    const segS = $('segSpeed');
    segS.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      segS.querySelectorAll('button').forEach(x => x.classList.remove('on'));
      b.classList.add('on');
      G.time.speed = parseFloat(b.dataset.v);
    });
    // LLM 设置
    const keyI = $('llmKey'), baseI = $('llmBase'), modelI = $('llmModel');
    keyI.value = localStorage.getItem('zz_key') || '';
    baseI.value = localStorage.getItem('zz_base') || '';
    modelI.value = localStorage.getItem('zz_model') || '';
    const saveLLM = () => {
      localStorage.setItem('zz_key', keyI.value.trim());
      localStorage.setItem('zz_base', baseI.value.trim());
      localStorage.setItem('zz_model', modelI.value.trim());
      G.llm = keyI.value.trim() ? { key: keyI.value.trim(), base: baseI.value.trim(), model: modelI.value.trim() } : null;
    };
    [keyI, baseI, modelI].forEach(i => i.addEventListener('change', saveLLM));
    saveLLM();

    // ── 点击居民 ──
    bus.on('agentClicked', (a) => this.openDossier(a));
    $('dClose').addEventListener('click', () => this.el.dossier.classList.remove('show'));
    $('dFollow').addEventListener('click', () => {
      if (!this.selected) return;
      G.focus = this.selected;
      G.camMode = 'follow';
      $('btnCam').textContent = '跟随';
      $('btnCam').classList.add('on');
      this.el.dossier.classList.remove('show');
      bus.emit('toast', `镜头正跟着 ${this.selected.name}`);
    });
    $('dBless').addEventListener('click', () => {
      if (!this.selected) return;
      this.world.bless(this.selected);
      this.el.dossier.classList.remove('show');
    });

    bus.on('toast', (t) => this.toast(t));
  }

  addLog(tag, text, rumor) {
    this.logs.unshift({ tag, text, rumor, t: Date.now() });
    if (this.logs.length > 5) this.logs.pop();
    this.el.feed.innerHTML = this.logs.map((l, i) =>
      `<div class="item ${l.rumor ? 'rumor' : ''} ${i > 1 ? 'old' : ''}"><span class="tag">${l.tag}</span>${l.text}</div>`
    ).join('');
  }

  showReply(txt) {
    this.el.reply.classList.add('show');
    this.el.replyTxt.textContent = txt;
    clearTimeout(this._replyTimer);
    this._replyTimer = setTimeout(() => this.el.reply.classList.remove('show'), 9000);
  }

  toast(t) {
    this.el.toast.textContent = t;
    this.el.toast.classList.add('show');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => this.el.toast.classList.remove('show'), 2600);
  }

  tickHud() {
    const t = G.time.t;
    const hh = Math.floor(t * 24), mm = Math.floor((t * 24 - hh) * 60);
    this.el.dayN.textContent = `第 ${G.time.day} 日`;
    this.el.timeN.textContent = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')} ${phaseName(t)}`;
    this.el.weatherN.textContent = WEATHER_NAME[G.weather] || '晴';
    this.el.popN.textContent = `${this.world.agents.filter(a => !a.sleeping).length} 魂醒`;
  }

  openRoster() {
    const grid = $('rosterGrid');
    grid.innerHTML = this.world.agents.map(a =>
      `<div class="rp" data-id="${a.id}"><span class="sw" style="background:#${a.baseColor.getHexString()};color:#${a.baseColor.getHexString()}"></span><div><div class="nm">${a.name}</div><div class="jb">${a.job} · ${a.sleeping ? '安睡' : '醒着'}</div></div></div>`
    ).join('');
    grid.querySelectorAll('.rp').forEach(el => el.addEventListener('click', () => {
      const a = this.world.agents.find(x => x.id === +el.dataset.id);
      $('mRoster').classList.remove('show');
      this.openDossier(a);
    }));
    $('mRoster').classList.add('show');
  }

  openDossier(a) {
    this.selected = a;
    const d = this.el.dossier;
    $('dSeal').textContent = a.name[0];
    $('dSeal').style.background = `linear-gradient(135deg, #${a.baseColor.clone().offsetHSL(0, 0.1, 0.15).getHexString()}, #${a.baseColor.getHexString()})`;
    $('dName').textContent = a.name;
    $('dJob').textContent = `${a.job} · ${a.intro}`;
    const moodMap = { calm: '平静', happy: '欢喜', sad: '低落', angry: '恼火', fear: '不安', love: '幸福', sleep: '安睡', awed: '出神' };
    $('dMood').textContent = `心情 ${moodMap[a.emotion] || '平静'}`;
    $('dDoing').textContent = { idle: '闲着', goto: '在路上', chat: '聊天', dance: '跳舞', sleep: '睡觉' }[a.state] || '——';
    const dot = $('dMoodDot');
    dot.style.background = `#${a.baseColor.getHexString()}`;
    dot.style.color = `#${a.baseColor.getHexString()}`;
    $('dMems').innerHTML = a.memories.length
      ? a.memories.slice(0, 4).map(m => `<span class="${m.kind === 'bad' ? 'bad' : m.kind === 'good' ? 'good' : ''}">${m.txt}</span>`).join('')
      : '<span>最近的日子平平淡淡，没什么事发生。</span>';
    const rels = [...a.affinity.entries()].sort((x, y) => y[1] - x[1]).slice(0, 4);
    $('dRel').innerHTML = rels.length
      ? rels.map(([id, v]) => {
        const o = this.world.agents.find(x => x.id === id);
        if (!o) return '';
        return `<span data-id="${id}">${o.name} · ${v > 12 ? '挚友' : v > 0 ? '相识' : '别扭'}</span>`;
      }).join('')
      : '<span style="opacity:.6">还在认识这个镇……</span>';
    $('dRel').querySelectorAll('span[data-id]').forEach(el => el.addEventListener('click', () => {
      const o = this.world.agents.find(x => x.id === +el.dataset.id);
      if (o) this.openDossier(o);
    }));
    d.classList.add('show');
  }
}
