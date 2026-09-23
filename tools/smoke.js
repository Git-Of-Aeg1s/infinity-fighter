#!/usr/bin/env node
/**
 * smoke —— 无头冒烟测试：在不打开浏览器的情况下加载全部游戏脚本并跑帧验证。
 *
 * 两种模式（自动探测：js/01-config.js 含 import 语句即 modules 模式）：
 *   classic  按序拼接 14 个脚本（与 index.html 加载顺序一致），以 new Function 单作用域执行
 *   modules  按序动态 import 14 个模块（top-level 代码随 import 执行）
 *
 * 场景：主界面空闲 → 点击「开始游戏」→ 方向键移动 / 空弹 / 暂停恢复 / R 重开 / 二次开局，
 * 共约 700 帧（≈11.6s 游戏时间），覆盖出怪、开火、命中、掉落、HUD 更新等主路径。
 *
 * 判定：任何未捕获异常、主循环帧内异常（14-main 的 catch 会 console.error）都记为 FAIL。
 * 用法：node tools/smoke.js    （npm run smoke）
 * 退出码：0 = 通过；1 = 失败
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const jsDir = join(root, 'js');
const files = readdirSync(jsDir).filter(f => /^\d{2}-.*\.js$/.test(f)).sort();
const source = Object.fromEntries(files.map(f => [f, readFileSync(join(jsDir, f), 'utf8')]));
const isModules = /type="module"/.test(readFileSync(join(root, 'index.html'), 'utf8'));
// index.html 中静态存在的元素 id（getElementById 的真实性依据）
const htmlIds = new Set([...readFileSync(join(root, 'index.html'), 'utf8').matchAll(/id="([^"]+)"/g)].map(m => m[1]));

// ---------------- 时钟与帧调度 ----------------
let NOW = 0;                     // smoke 时钟（ms）
let rafQueue = [];               // 待执行的 rAF 回调
const requestAnimationFrame = cb => (rafQueue.push(cb), rafQueue.length);
const cancelAnimationFrame = () => {};
function runFrames(n) {
  for (let i = 0; i < n; i++) {
    NOW += 1000 / 60;
    const cbs = rafQueue; rafQueue = [];
    if (!cbs.length) return false;   // 主循环未排程：提前结束
    for (const cb of cbs) cb(NOW);
  }
  return true;
}

// ---------------- 浏览器桩 ----------------
const errors = [];   // { key, stack }（按消息去重，保留首个堆栈）
const realConsoleError = console.error;
console.error = (...args) => {
  const first = args.find(a => a instanceof Error);
  const key = args.map(a => (a instanceof Error ? a.message : String(a))).join(' ');
  if (!errors.some(e => e.key === key)) errors.push({ key, stack: first ? String(first.stack) : key });
};

// 万能桩：任意属性访问返回自身（可调用），算术运算按 0 处理
const universal = new Proxy(function () {}, {
  get(_t, prop) {
    if (prop === Symbol.toPrimitive) return () => 0;
    if (prop === 'width' || prop === 'height') return 0;
    return universal;
  },
  set() { return true; },
  apply() { return universal; },
});

// 2D 上下文桩：所有方法 no-op，所有属性可写
const CTX = universal;

function makeCanvas() {
  const el = {
    tagName: 'CANVAS', width: 300, height: 150, style: {}, children: [],
    textContent: '', innerHTML: '', className: '', id: '',
  };
  el.listeners = {};
  el.getContext = () => CTX;
  el.addEventListener = (t, f) => { (el.listeners[t] ||= []).push(f); };
  el.removeEventListener = () => {};
  el.getBoundingClientRect = () => ({ width: el.width, height: el.height, top: 0, left: 0 });
  el.appendChild = c => (el.children.push(c), c);
  return el;
}

const elements = {};              // id/selector → 元素桩
const createdElements = [];       // createElement 动态创建的元素（用于触发图鉴等入口）
const docListeners = {};
let PARENT_STUB = null;
function makeElement(tagOrSel) {
  const listeners = {};
  const el = {
    tagName: String(tagOrSel || 'div').replace(/^[.#]/, '').toUpperCase(),
    style: {}, dataset: {}, children: [],
    textContent: '', innerHTML: '', className: '', id: '', title: '', value: '',
    disabled: false, hidden: false,
    offsetWidth: 100, offsetHeight: 40, offsetLeft: 0, offsetTop: 0,
    width: 300, height: 150,
    get childElementCount() { return el.children.length; },
    get parentElement() { return PARENT_STUB ||= makeElement('parent'); },
    get parentNode() { return PARENT_STUB ||= makeElement('parent'); },
    classList: {
      _set: new Set(),
      add(...c) { c.forEach(x => this._set.add(x)); },
      remove(...c) { c.forEach(x => this._set.delete(x)); },
      toggle(c, force) { const has = this._set.has(c); const want = force === undefined ? !has : !!force; want ? this._set.add(c) : this._set.delete(c); return want; },
      contains(c) { return this._set.has(c); },
    },
  };
  el.listeners = listeners;
  el.addEventListener = (t, f) => { (listeners[t] ||= []).push(f); };
  el.removeEventListener = () => {};
  el.appendChild = c => (el.children.push(c), c);
  el.append = (...cs) => cs.forEach(c => el.children.push(c));
  el.prepend = (...cs) => el.children.unshift(...cs);
  el.insertBefore = (c, ref) => { const i = el.children.indexOf(ref); if (i >= 0) el.children.splice(i, 0, c); else el.children.push(c); return c; };
  el.removeChild = c => { const i = el.children.indexOf(c); if (i >= 0) el.children.splice(i, 1); };
  el.remove = () => {};
  el.replaceChild = (n, o) => { const i = el.children.indexOf(o); if (i >= 0) el.children.splice(i, 1, n); return o; };
  el.contains = () => false;
  el.querySelector = () => null;
  el.querySelectorAll = () => [];
  el.closest = () => null;
  el.focus = () => {}; el.blur = () => {};
  el.click = () => fire(listeners, 'click');
  el.getBoundingClientRect = () => ({ width: el.offsetWidth, height: el.offsetHeight, top: el.offsetTop, left: el.offsetLeft });
  el.getContext = () => CTX;
  return el;
}
function fire(listeners, type, ev = {}) {
  const e = { preventDefault() {}, stopPropagation() {}, ...ev };
  for (const f of listeners[type] || []) f(e);
}

const documentStub = {
  hidden: false,
  title: '',
  body: null,
  // 与真实浏览器一致：只有 index.html 里静态存在的 id 才能查到；动态创建的 id 在 createdElements 中找，否则返回 null
  getElementById(id) {
    if (elements[id]) return elements[id];
    if (htmlIds.has(id)) return (elements[id] ||= (id === 'game' ? makeCanvas() : makeElement(id)));
    const dyn = createdElements.find(el => el.id === id);
    return dyn || null;
  },
  createElement(tag) { const el = tag === 'canvas' ? makeCanvas() : makeElement(tag); createdElements.push(el); return el; },
  querySelector(sel) { return (elements[sel] ||= makeElement(sel)); },
  querySelectorAll() { return []; },
  addEventListener(t, f) { (docListeners[t] ||= []).push(f); },
  removeEventListener() {},
};
documentStub.body = makeElement('body');

class ImageStub {
  constructor() { this.onload = null; this.onerror = null; this._src = ''; }
  set src(v) { this._src = v; if (this.onload) queueMicrotask(() => this.onload()); }
  get src() { return this._src; }
}
class AudioStub {
  constructor(src = '') { this.src = src; this.loop = false; this.volume = 1; this.preload = ''; this.currentTime = 0; this.paused = true; }
  play() { this.paused = false; return Promise.resolve(); }
  pause() { this.paused = true; }
}

const winListeners = {};
const windowStub = {
  devicePixelRatio: 1,
  innerWidth: 1280,
  innerHeight: 800,
  addEventListener(t, f) { (winListeners[t] ||= []).push(f); },
  removeEventListener() {},
};

const performanceStub = { now: () => NOW };

// ---------------- 装载游戏脚本 ----------------
const shared = {
  window: windowStub,
  document: documentStub,
  performance: performanceStub,
  requestAnimationFrame,
  cancelAnimationFrame,
  setTimeout, clearTimeout, setInterval, clearInterval,
  Image: ImageStub,
  Audio: AudioStub,
  console,
};

if (isModules) {
  // modules 模式：挂到 globalThis 供模块内裸引用解析
  for (const [k, v] of Object.entries(shared)) globalThis[k] = v;
} else {
  // classic 模式：按序拼接为单作用域执行（等价于 index.html 按序加载的词法环境）
  const code = files.map(f => source[f]).join('\n');
  const paramNames = Object.keys(shared);
  try {
    new Function(...paramNames, code)(...paramNames.map(k => shared[k]));
  } catch (err) {
    realConsoleError('✗ smoke FAIL：脚本装载阶段抛出异常：', err);
    process.exit(1);
  }
}

// ---------------- 驱动场景 ----------------
function key(k, down = true) {
  fire(winListeners, down ? 'keydown' : 'keyup', { key: k });
}
function frames(n) {
  if (!runFrames(n)) errors.push('主循环意外停止排程（scheduleLoop 未续帧）');
}
function sample(label) {
  const enemies = elements.game ? 0 : 0;   // 占位：实体数组在闭包内，外部不可见；只统计帧执行情况
  void enemies;
  console.log(`  [frame ${Math.round(NOW / 16.667)}] ${label}`);
}

try {
  if (isModules) {
    for (const f of files) await import(pathToFileURL(join(jsDir, f)).href);
  }

  console.log(`smoke: ${isModules ? 'modules' : 'classic'} 模式，${files.length} 个脚本装载完成`);
  frames(30);                                   // 主界面空闲
  sample('主界面空闲 30 帧');

  elements.startBtn.click();                    // 开始游戏
  frames(400);                                  // ≈6.6s：出怪 / 开火 / 命中 / 掉落 / HUD
  sample('开局战斗 400 帧');

  key('d'); frames(60); key('d', false);        // 按住右移
  key('w'); frames(40); key('w', false);        // 按住上移
  key(' '); frames(5); key(' ', false);         // 高能爆弹
  sample('移动 + 爆弹');

  key('p'); frames(10); key('p', false);        // 暂停 → 继续
  frames(30);
  key('r'); frames(60);                         // R 立即重开
  sample('暂停/恢复 + R 重开');

  elements.startBtn.click();                    // 再来一局
  frames(120);
  sample('二次开局 120 帧');

  // 驾驶员系统：逐个选中驾驶员跑主路径（可莉绷绷炸弹 / 许凯狗冲刺 / 埃逸 / 天秀量表 /
  // 大无垠之王累积 / 温酒客占位 / 小艺拾取回血 / 陵落 Q 技能），
  // 覆盖 buildPilotCards 卡片选中 → 开局 → 驾驶员技能键 E/Q → 暂停返回主界面
  for (const pid of ['keli', 'xukaigou', 'aiyi', 'tianxiu', 'king', 'wenjiuke', 'xiaoyi', 'lingluo', 'hajimi', 'dagou', 'lingli', 'hudike', 'xiaoyang']) {
    const allCards = [...elements.pilotGridMain.children, ...elements.pilotGridSub.children];
    const card = allCards.find(c => c.dataset && c.dataset.pilot === pid);
    if (!card) { errors.push({ key: '驾驶员卡片缺失', stack: 'pilotGrid 中未找到卡片 ' + pid }); continue; }
    card.click();
    elements.startBtn.click();                  // 以该驾驶员开局
    frames(200);                                // ≈3.3s：出怪 / 冲刺秒杀 / 开火 / 拾取 / HUD
    key('e'); frames(5); key('e', false);       // 驾驶员技能键 E（量表未满 / 无技能驾驶员时为空操作）
    key('q'); frames(5); key('q', false);       // 驾驶员技能键 Q（陵落：冷却未结束时为空操作）
    key('p'); frames(5);                        // 暂停
    elements.pauseHomeBtn.click(); frames(10);  // 返回主界面
    sample('驾驶员 ' + pid + ' 主路径');
  }

  // 怪物图鉴：打开即构建列表 + 全部条目缩略图（drawEncyPreview → 嵌套 withPreviewCtx）
  // 入口按钮现为主菜单静态元素（index.html 内 id=encyEntryBtn），由 getElementById 获取
  const encyBtn = documentStub.getElementById('encyEntryBtn');
  if (encyBtn) { encyBtn.click(); frames(10); sample('打开怪物图鉴（预览渲染）'); }
  else errors.push({ key: '无图鉴入口', stack: '未找到 id=encyEntryBtn 的按钮（index.html 静态入口被改动？）' });

  // 数值与机制图鉴：权重表 / 波次说明等 DOM 构建
  elements.infoEntryBtn.click();
  frames(10);
  sample('打开数值与机制图鉴');

  elements.musicToggle.click();                 // 静音开关
  frames(10);
} catch (err) {
  errors.push({ key: '场景驱动异常', stack: '场景驱动阶段抛出异常：' + (err && err.stack || err) });
}

// ---------------- 结果 ----------------
if (errors.length) {
  realConsoleError(`✗ smoke FAIL：捕获 ${errors.length} 类错误`);
  errors.forEach((e, i) => realConsoleError(`  [${i + 1}] ${e.stack.split('\n').slice(0, 8).join('\n')}`));
  process.exit(1);
} else {
  console.log(`✓ smoke 通过：约 ${Math.round(NOW / 16.667)} 帧（${(NOW / 1000).toFixed(1)}s 游戏时间）无异常`);
}
process.exit(0);
