// 众生镇 · 全局配置与调色板
export const CFG = {
  DAY_LENGTH: 240,          // 一昼夜秒数
  START_T: 0.34,            // 开局时刻（上午晴光）
  MAP_R: 118,               // 地图半径
  FOG_FAR: 340,
  AGENT_N: 24,
  SPIRIT_P: 64,             // 每魂粒子数
};

// 一天内的关键帧：t, 天顶色, 地平色, 雾色, 阳光色, 阳光强度, 环境光强度, 太阳高度角
// 明亮主题：夜晚是"明亮的蓝调星夜"，不是黑
const K = (t, sky, hor, fog, sun, sunI, ambI, sunEl, sunAz) => ({ t, sky, hor, fog, sun, sunI, ambI, sunEl, sunAz });
const C = (h) => h;

export const SKY_KEYS = [
  K(0.00, C(0x8fb2de), C(0xffe2ba), C(0xd9e3ee), C(0xfff0d8), 0.5, 0.66, 0.75, 0.4),   // 星夜（亮）
  K(0.20, C(0x96b8e2), C(0xffe6c2), C(0xdde6f0), C(0xffe8c8), 0.55, 0.68, 0.45, 1.2),  // 黎明前
  K(0.26, C(0x9ec8ee), C(0xffd9a6), C(0xf4e5d4), C(0xffcf90), 0.95, 0.76, 0.06, 1.5),  // 日出
  K(0.35, C(0x8ecaf2), C(0xecf5fc), C(0xe6eff6), C(0xfff6e2), 1.35, 0.88, 0.45, 1.6),  // 上午
  K(0.50, C(0x7fc2f2), C(0xeaf6fc), C(0xe6eff6), C(0xffffff), 1.5, 0.95, 0.95, 1.7),   // 正午
  K(0.66, C(0x88bcec), C(0xf2f2f4), C(0xeaf0f4), C(0xfff2dc), 1.3, 0.88, 0.5, 1.8),    // 午后
  K(0.715,C(0x8cacdf), C(0xffd29a), C(0xf7e3c6), C(0xffcf88), 1.1, 0.8, 0.12, 1.95),   // 黄昏金
  K(0.755,C(0x84a0d2), C(0xffba88), C(0xeccec4), C(0xffb070), 0.75, 0.7, 0.02, 2.1),   // 日落
  K(0.80, C(0x8ca8da), C(0xffdcba), C(0xdce2f0), C(0xffe0b8), 0.55, 0.66, 0.5, 2.6),   // 暮色（亮）
  K(0.87, C(0x82a0d6), C(0xffd6b0), C(0xd4e0ee), C(0xffe4c0), 0.5, 0.64, 0.8, 2.9),    // 夜（明亮星夜）
  K(1.00, C(0x8fb2de), C(0xffe2ba), C(0xd9e3ee), C(0xfff0d8), 0.5, 0.66, 0.75, 0.4),   // 回到星夜
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
