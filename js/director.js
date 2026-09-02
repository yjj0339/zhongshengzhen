// 众生镇 · 事件导演 + 神谕（离线意图 / 可选大模型）
import { bus, G } from './config.js';
import { ORACLE_LINES, EVENTS_META } from './people.js';

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

export class Director {
  constructor(world, fx, skyCtl) {
    this.world = world;
    this.fx = fx;
    this.skyCtl = skyCtl;
    this.nextEventAt = 30 + Math.random() * 25;
    this.weatherUntil = 0;
    bus.on('day', () => { this.nextEventAt = Math.min(this.nextEventAt, 40); });
  }

  setWeather(w, dur) {
    G.weather = w;
    G.weatherUntil = performance.now() / 1000 + dur;
    this.fx.setRain(w === 'rain' || w === 'storm');
  }

  runEvent(id) {
    const W = this.world;
    const meta = EVENTS_META[id];
    if (!meta) return;
    bus.emit('log', { tag: meta.title, text: meta.rumor, rumor: id === 'lakeMonster' || id === 'quarrel' });
    switch (id) {
      case 'festival': {
        this.fx.setFestival(true);
        W.festival = 1;
        W.gatherAt('plaza', 55, 'happy');
        for (const a of W.agents) if (a.state !== 'goto') a.state = 'dance';
        W.spreadRumor('丰收祭上喷泉的光比平时亮', 'good');
        bus.emit('audio', 'festival');
        setTimeout(() => {
          this.fx.setFestival(false);
          W.festival = 0;
          for (const a of W.agents) if (a.state === 'dance') a.state = 'idle';
          bus.emit('log', { tag: '散场', text: '丰收祭散了，人们提着灯慢慢回家，广场上落满彩带。' });
        }, 58000);
        break;
      }
      case 'meteors': {
        this.setWeather('meteor', 34);
        W.setEmotion ? null : 0;
        for (const a of W.agents) if (!a.sleeping) W.setEmotion(a, 'awed', 30);
        W.spreadRumor('昨晚流星划过钟楼，阿萤许了三个愿', 'good');
        this._meteorSpawner = setInterval(() => this.fx.spawnMeteor(), 420);
        setTimeout(() => { clearInterval(this._meteorSpawner); this.setWeather('clear', 0); }, 33000);
        break;
      }
      case 'storm': {
        this.setWeather('storm', 40);
        for (const a of W.agents) if (!a.sleeping) W.setEmotion(a, 'fear', 38);
        W.goHomeAll();
        bus.emit('log', { tag: '雷雨', text: '雨点砸下来了，来不及回家的人举着荷叶跑。' });
        setTimeout(() => { this.setWeather('clear', 0); bus.emit('log', { tag: '雨停', text: '雨过天晴，屋檐还在滴水，空气里有泥土味。' }); }, 40000);
        break;
      }
      case 'lakeMonster': {
        W.spreadRumor('浪里白赌咒发誓，他在湖心看见一条发绿光的影子', 'bad');
        setTimeout(() => {
          W.gatherAt('dock', 30, 'fear');
          bus.emit('log', { tag: '围观', text: '消息传开，胆大的人都挤到栈桥上看湖面。' });
        }, 14000);
        setTimeout(() => {
          bus.emit('log', { tag: '真相', text: '所谓湖怪，原来是渡爷夜里洗船时挂的灯笼。全镇笑了很久。' });
          for (const a of W.agents) if (a.emotion === 'fear') W.setEmotion(a, 'happy', 24);
        }, 38000);
        break;
      }
      case 'quarrel': {
        const cand = W.agents.filter(a => !a.isKid);
        const a = pick(cand); const b = pick(cand.filter(x => x !== a));
        W.gatherAt('plaza', 16);
        setTimeout(() => W.quarrel(a, b), 6000);
        setTimeout(() => {
          bus.emit('log', { tag: '和好', text: `${a.name} 和 ${b.name} 在水井边互相递了一碗凉茶，没事了。` });
          W.makeFriends(a, b);
          W.setEmotion(a, 'calm', 5); W.setEmotion(b, 'calm', 5);
        }, 30000);
        break;
      }
      case 'recital': {
        W.gatherAt('plaza', 36, 'calm');
        const poet = W.agents.find(a => a.job === '诗人') || W.agents[0];
        setTimeout(() => {
          poet.say('风把黄昏折成一封信/落在镇子的屋檐上——', 4.2);
          bus.emit('log', { tag: '诗会', text: `${poet.name} 站在喷泉边念了首新作，听众里有人悄悄抹眼睛。` });
        }, 12000);
        W.spreadRumor('苏小满的新诗里藏着一个名字', 'rumor');
        break;
      }
      case 'sheep': {
        const kid = W.agents.find(a => a.job === '牧童');
        if (kid) {
          W.setEmotion(kid, 'sad', 40);
          bus.emit('log', { tag: '寻羊', text: `${kid.name} 的一只羊从栅栏缝里钻出去了，正在麦田边打转。` });
          setTimeout(() => {
            kid.say('找到了找到了！它自己溜达回来了！', 4);
            W.setEmotion(kid, 'happy', 30);
            bus.emit('log', { tag: '虚惊', text: '羊自己回来了，还带回来一只野花开满身的朋友。' });
          }, 26000);
        }
        break;
      }
    }
  }

  update(dt) {
    const now = performance.now() / 1000;
    if (G.weather !== 'clear' && now > G.weatherUntil) { G.weather = 'clear'; this.fx.setRain(false); }
    this.nextEventAt -= dt;
    if (this.nextEventAt <= 0) {
      this.nextEventAt = 95 + Math.random() * 70;
      const pool = ['festival', 'meteors', 'lakeMonster', 'quarrel', 'recital', 'sheep', 'storm'];
      const id = pick(pool);
      if (G.weather === 'clear' || id === 'festival') this.runEvent(id);
    }
  }
}

/* ── 神谕 ── */
export class Oracle {
  constructor(world, fx, director) {
    this.world = world;
    this.fx = fx;
    this.director = director;
  }

  findName(q) {
    // 模糊匹配人名（两个字或单字特征）
    for (const a of this.world.agents) {
      const n = a.name;
      if (q.includes(n)) return a;
      if (n.length >= 2 && q.includes(n.slice(1))) return a;
    }
    return null;
  }

  async ask(input) {
    // 优先大模型
    const llm = G.llm;
    if (llm && llm.key) {
      try { return await this._askLLM(input); }
      catch (e) { bus.emit('toast', '大模型暂时联系不上，先用本地智慧应答。'); }
    }
    return this._askLocal(input);
  }

  _askLocal(q) {
    const W = this.world, D = this.director;
    const has = (...ws) => ws.some(w => q.includes(w));
    let reply = null;
    const act = (r) => { reply = r; };

    if (has('丰收', '节日', '庆典', '祭典', '办一场')) {
      D.runEvent('festival'); act(pick(ORACLE_LINES.festival));
    } else if (has('流星', '星辰', '星星落')) {
      D.runEvent('meteors'); act(pick(ORACLE_LINES.meteor));
    } else if (has('雷雨', '暴雨', '下雨', '风暴')) {
      D.runEvent('storm'); act(pick(ORACLE_LINES.storm));
    } else if (has('跳舞', '起舞', '舞蹈')) {
      W.gatherAt('plaza', 40, 'happy');
      for (const a of W.agents) if (a.state !== 'goto') a.state = 'dance';
      setTimeout(() => { for (const a of W.agents) if (a.state === 'dance') a.state = 'idle'; }, 40000);
      act(pick(ORACLE_LINES.dance));
    } else if (has('夜晚', '入夜', '黑夜')) {
      G.time.t = 0.90; act(pick(ORACLE_LINES.night));
    } else if (has('白天', '天亮', '清晨', '日出')) {
      G.time.t = 0.30; act(pick(ORACLE_LINES.day));
    } else if (has('黄昏', '日落', '傍晚')) {
      G.time.t = 0.715; act('夕阳正好。我把天色拨回了黄昏。');
    } else if (has('湖怪', '怪物', '湖里有')) {
      D.runEvent('lakeMonster'); act(pick(ORACLE_LINES.lake));
    } else if (has('吵架', '闹矛盾')) {
      D.runEvent('quarrel'); act(pick(ORACLE_LINES.quarrel));
    } else if (has('羊')) {
      D.runEvent('sheep'); act(pick(ORACLE_LINES.sheep));
    } else if (has('诗', '念诗')) {
      D.runEvent('recital'); act('好——让喷泉做听众，让黄昏做背景。');
    } else if (has('安静', '平静', '休息', '睡觉')) {
      W.goHomeAll(); act(pick(ORACLE_LINES.calm));
    } else if (has('认识', '成为朋友', '和好', '喜欢')) {
      const nameA = this.findName(q);
      let a = null, b = null;
      if (nameA) {
        a = nameA;
        b = pick(W.agents.filter(x => x !== a && x.name !== '镇魂猫'));
      } else { a = pick(W.agents); b = pick(W.agents.filter(x => x !== a)); }
      W.makeFriends(a, b);
      W.gatherAt('plaza', 20, 'happy');
      act(`${a.name} 和 ${b.name} 的光，从此会朝着彼此亮。`);
      bus.emit('log', { tag: '神谕', text: `${a.name} 与 ${b.name} 成为了朋友。` });
    } else if (has('赐福', '保佑', '祝福')) {
      const a = this.findName(q) || pick(W.agents);
      W.bless(a);
      act(pick(ORACLE_LINES.bless));
    } else if (has('传谣', '谣言', '消息')) {
      W.spreadRumor('神明昨晚亲口说：今年的麦子会比去年多收三成', 'rumor');
      act('一句话落进小镇，就会自己长脚。走着瞧吧。');
    } else if (has('烟花')) {
      D.runEvent('festival'); act('烟火升空——镇子今晚不睡了。');
    } else {
      act(pick(ORACLE_LINES.default));
      if (Math.random() < 0.4) W.spreadRumor('有人在夜里听见天上有声音', 'rumor');
    }
    bus.emit('log', { tag: '神谕', text: reply });
    return { reply, source: 'local' };
  }

  async _askLLM(input) {
    const llm = G.llm;
    const W = this.world;
    const state = {
      时间: Math.round(G.time.t * 24) + '点',
      天气: G.weather,
      居民: W.agents.slice(0, 24).map(a => ({ 名字: a.name, 职业: a.job, 情绪: a.emotion, 在做什么: a.state })),
      最近事件: this.world.rumors.slice(-4).map(r => r.txt),
    };
    const sys = `你是东方小镇「众生镇」的神明。镇上的居民都是发光的魂火。根据小镇状态和用户的神谕，用 JSON 回复：{"reply":"富有诗意与温度的神谕回应，60字内","action":"可选：festival|meteors|storm|dance|night|day|dusk|calm|lakeMonster|quarrel|sheep|recital"}。只输出 JSON。小镇状态：${JSON.stringify(state)}`;
    const res = await fetch(`${(llm.base || 'https://dashscope.aliyuncs.com/compatible-mode/v1').replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${llm.key}` },
      body: JSON.stringify({ model: llm.model || 'qwen-plus', messages: [{ role: 'system', content: sys }, { role: 'user', content: input }] }),
    });
    if (!res.ok) throw new Error('LLM ' + res.status);
    const data = await res.json();
    let txt = data.choices[0].message.content || '';
    const m = txt.match(/\{[\s\S]*\}/);
    let reply = txt, action = null;
    if (m) { try { const j = JSON.parse(m[0]); reply = j.reply || txt; action = j.action; } catch { reply = txt; } }
    if (action && ['festival', 'meteors', 'storm', 'lakeMonster', 'quarrel', 'sheep', 'recital'].includes(action)) this.director.runEvent(action);
    else if (action === 'dance') { this.world.gatherAt('plaza', 40, 'happy'); for (const a of this.world.agents) if (a.state !== 'goto') a.state = 'dance'; }
    else if (action === 'night') G.time.t = 0.90;
    else if (action === 'day') G.time.t = 0.30;
    else if (action === 'dusk') G.time.t = 0.715;
    else if (action === 'calm') this.world.goHomeAll();
    bus.emit('log', { tag: '神谕', text: reply });
    return { reply, source: 'llm' };
  }
}
