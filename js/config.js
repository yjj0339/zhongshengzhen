// 众生镇 · 全局配置与调色板
export const CFG = {
  DAY_LENGTH: 240,          // 一昼夜秒数
  START_T: 0.685,           // 开局时刻（黄昏金光）
  MAP_R: 118,               // 地图半径
  FOG_FAR: 340,
  AGENT_N: 24,
  SPIRIT_P: 64,             // 每魂粒子数
};

// 一天内的关键帧：t, 天顶色, 地平色, 雾色, 阳光色, 阳光强度, 环境光强度, 太阳高度角
const K = (t, sky, hor, fog, sun, sunI, ambI, sunEl, sunAz) => ({ t, sky, hor, fog, sun, sunI, ambI, sunEl, sunAz });
const C = (h) => h; // hex passthrough

export const SKY_KEYS = [
  K(0.00, C(0x0a0f22), C(0x101a30), C(0x0c1224), C(0x8fa8ff), 0.30, 0.46, 0.75, 0.4),  // 午夜
  K(0.20, C(0x0d1330), C(0x2a2440), C(0x181a30), C(0xa08fff), 0.32, 0.48, 0.45, 1.2),  // 黎明前
  K(0.26, C(0x2c3a68), C(0xf2905e), C(0xc98a66), C(0xffb070), 0.75, 0.50, 0.06, 1.5),  // 日出
  K(0.35, C(0x5a86c8), C(0xcfe3f2), C(0xbdd2e2), C(0xfff2dd), 1.25, 0.72, 0.45, 1.6),  // 上午
  K(0.50, C(0x4f7fd0), C(0xcfe6f5), C(0xc4dcee), C(0xffffff), 1.45, 0.80, 0.95, 1.7),  // 正午
  K(0.66, C(0x4a76c2), C(0xd8e0ea), C(0xc9d2da), C(0xffeacc), 1.20, 0.70, 0.50, 1.8),  // 午后
  K(0.715,C(0x35486e), C(0xffb169), C(0xd99a6a), C(0xffc07a), 0.95, 0.60, 0.12, 1.95), // 黄昏金
  K(0.755,C(0x1c2340), C(0xe8764e), C(0xa06255), C(0xff8a55), 0.45, 0.42, 0.02, 2.1),  // 日落
  K(0.80, C(0x0d1330), C(0x3c2c48), C(0x1c1c34), C(0xa888ff), 0.30, 0.44, 0.60, 2.6),  // 暮色
  K(0.87, C(0x080d1e), C(0x141c36), C(0x0d1326), C(0x9fb4ff), 0.28, 0.42, 0.80, 2.9),  // 夜
  K(1.00, C(0x0a0f22), C(0x101a30), C(0x0c1224), C(0x8fa8ff), 0.30, 0.46, 0.75, 0.4),  // 回到午夜
];

export const PAL = {
  gold: 0xffcf7d, gold2: 0xff9d5c, cyan: 0x7fd8ff, violet: 0xb48cff,
  ember: 0xff7d4d, leaf: 0x9fd86b, ice: 0xa8e4ff, rose: 0xff8fb0,
  lime: 0xd8ff8f, teal: 0x6fe8c8, lav: 0xcab0ff, sky2: 0x8fb8ff,
  deep: 0x0a0e1a,
};

// 时段名
export function phaseName(t) {
  if (t < 0.22) return '深夜';
  if (t < 0.30) return '黎明';
  if (t < 0.46) return '上午';
  if (t < 0.60) return '正午';
  if (t < 0.70) return '午后';
  if (t < 0.77) return '黄昏';
  if (t < 0.84) return '暮色';
  return '夜';
}
export const WEATHER_NAME = { clear: '晴', cloud: '多云', rain: '雨', storm: '雷暴', meteor: '流星' };

// 极简事件总线
export const bus = {
  m: {},
  on(e, f) { (this.m[e] ||= []).push(f); },
  emit(e, d) { (this.m[e] || []).forEach((f) => f(d)); },
};

// 全局共享状态
const _qs = new URLSearchParams(location.search);
export const QPARAM = {
  q: _qs.get('q'),                 // 强制画质 low/high
  dpr: parseFloat(_qs.get('dpr')) || 0,
  speed: parseFloat(_qs.get('speed')) || 0,
  t: _qs.get('t') !== null ? parseFloat(_qs.get('t')) : null,
  shot: _qs.get('shot') !== null,  // 截图模式：跳过标题直接进入
};
export const G = {
  time: { t: QPARAM.t !== null ? QPARAM.t : CFG.START_T, day: 1, speed: QPARAM.speed || 1, daylight: 1 },
  weather: 'clear',
  weatherUntil: 0,
  quality: QPARAM.q || (/Mobi|Android|iPhone/i.test(navigator.userAgent) ? 'low' : 'high'),
  agents: [],
  byName: {},
  focus: null,        // 跟随的 agent
  camMode: 'orbit',   // orbit | cinema | follow
  festival: false,
  llm: null,
  paused: false,
};

export function lerpKeys(t) {
  const ks = SKY_KEYS;
  for (let i = 0; i < ks.length - 1; i++) {
    const a = ks[i], b = ks[i + 1];
    if (t >= a.t && t <= b.t) {
      const f = (t - a.t) / (b.t - a.t);
      return { a, b, f };
    }
  }
  return { a: ks[0], b: ks[1], f: 0 };
}
