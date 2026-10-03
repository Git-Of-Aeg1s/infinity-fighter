#!/usr/bin/env node
/**
 * smoke —— 无头冒烟测试：在不打开浏览器的情况下加载全部游戏脚本并跑帧验证。
 *
 * 两种模式（自动探测：js/01-config.js 含 import 语句即 modules 模式）：
 *   classic  按序拼接 14 个脚本（与 index.html 加载顺序一致），以 new Function 单作用域执行
 *   modules  按序动态 import 14 个模块（top-level 代码随 import 执行）
 *
 * 场景：主界面空闲 → 点击「开始游戏」→ 方向键移动 / 空弹 / 暂停恢复 / 重开 / 二次开局，
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
    if (prop === 'then') return undefined;   // 防 thenable 误判
    return validateFn(prop);
  },
  set() { return true; },
  apply() { return universal; },
});

// 画布参数校验：真实 Canvas2D 对 非有限坐标 / 负半径 会抛异常（每帧抛错 → 游戏表现为冻结）。
// 无头桩默认不校验会漏掉这类缺陷——按真实语义对最易出错的调用做参数检查
const validateCache = new Map();
function validateFn(prop) {
  if (!validateCache.has(prop)) {
    const fn = (...args) => {
      const nums = args.filter(v => typeof v === 'number');
      const bad = msg => { throw new Error('CTX ' + prop + ' ' + msg + '：' + args.map(v => typeof v === 'number' ? v.toFixed(2) : String(v)).join(', ')); };
      if (nums.some(v => !Number.isFinite(v))) bad('非有限参数');
      if ((prop === 'createRadialGradient' && (args[2] < 0 || args[5] < 0)) || ((prop === 'arc' || prop === 'ellipse') && args[2] < 0)) bad('负半径');
      return universal;   // 调用结果仍返回万能桩（createLinearGradient 等返回值需可继续调用 addColorStop）
    };
    fn[Symbol.toPrimitive] = () => 0;   // 属性读取被当数值使用时按 0 处理（与旧行为一致，如 measureText 的包围盒）
    validateCache.set(prop, fn);
  }
  return validateCache.get(prop);
}

// 2D 上下文桩：所有方法 no-op（但经参数校验），所有属性可写
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
  elements.startBtn.click(); frames(60);        // 再来一局重开（R 键已改为原石抽卡道具，快捷重开已移除）
  sample('暂停/恢复 + 重开');

  elements.startBtn.click();                    // 再来一局
  frames(120);
  sample('二次开局 120 帧');

  // 驾驶员系统：逐个选中驾驶员跑主路径（可莉绷绷炸弹 / 许凯狗冲刺 / 埃逸 / 天秀量表 /
  // 大无垠之王累积 / 温酒客占位 / 小艺拾取回血 / 陵落 Q 技能），
  // 覆盖 buildPilotCards 卡片选中 → 开局 → 驾驶员技能键 Q → 暂停返回主界面
  for (const pid of ['keli', 'xukaigou', 'aiyi', 'tianxiu', 'king', 'wenjiuke', 'xiaoyi', 'lingluo', 'hajimi', 'dagou', 'lingli', 'hudike', 'xiaoyang']) {
    const allCards = [...elements.pilotGridMain.children, ...elements.pilotGridSub.children];
    const card = allCards.find(c => c.dataset && c.dataset.pilot === pid);
    if (!card) { errors.push({ key: '驾驶员卡片缺失', stack: 'pilotGrid 中未找到卡片 ' + pid }); continue; }
    card.click();
    elements.startBtn.click();                  // 以该驾驶员开局
    frames(200);                                // ≈3.3s：出怪 / 冲刺秒杀 / 开火 / 拾取 / HUD
    key('q'); frames(5); key('q', false);       // 驾驶员技能键 Q（天秀忧郁王子量表未满 / 陵落冷却未结束时为空操作）
    key('p'); frames(5);                        // 暂停
    elements.pauseHomeBtn.click(); frames(10);  // 返回主界面
    sample('驾驶员 ' + pid + ' 主路径');
  }

  // 副武器系统：逐个选中副武器跑主路径（主菜单演示发射 → 开局战斗 → 重开），
  // 覆盖 buildSubWeaponCards 卡片选中 / fireSubWeapon 各 kind / updateXinRings / updateFeijianWaves /
  // updateDagouMissiles（捣蛋）与 resetGame 副武器初始冷却（捣蛋 / 辛国栋）
  const subCards = [...elements.subGrid.children];
  for (const card of subCards) {
    const sid = card.dataset && card.dataset.sub;
    if (!sid) continue;
    card.click();
    frames(240);                                // 主菜单演示：updateDemo 发射副武器弹道
    elements.startBtn.click();
    frames(400);                                // 战斗：发射 / 命中 / 灼烧 / 爆炸
    elements.startBtn.click(); frames(120);     // 重开（resetGame 副武器初始冷却路径）
    elements.pauseHomeBtn.click(); frames(10);  // 返回主界面（下一把换装）
    sample('副武器 ' + sid + ' 主路径');
  }
  if (!subCards.length) errors.push({ key: '副武器卡片缺失', stack: 'subGrid 无卡片（buildSubWeaponCards 未执行？）' });

  // 怪物图鉴：打开即构建列表 + 全部条目缩略图（drawEncyPreview → 嵌套 withPreviewCtx）
  // 入口按钮现为主菜单静态元素（index.html 内 id=encyEntryBtn），由 getElementById 获取
  const encyBtn = documentStub.getElementById('encyEntryBtn');
  if (encyBtn) { encyBtn.click(); frames(10); sample('打开怪物图鉴（预览渲染）'); }
  else errors.push({ key: '无图鉴入口', stack: '未找到 id=encyEntryBtn 的按钮（index.html 静态入口被改动？）' });

  // 数值与机制图鉴：权重表 / 波次说明等 DOM 构建
  elements.infoEntryBtn.click();
  frames(10);
  sample('打开数值与机制图鉴');

  // 波次测试按钮：权重表 →「波次」子页 → 行内「▶ 试波」→ 波次挑战开局
  //（updateChallenge 整波驱动 / 场上清空自动补刷 / = 额外追加一整波——14-main 键盘入口）
  const waveChip = [...createdElements].reverse().find(el => el.tagName === 'BUTTON' && el.textContent === '波次');
  if (waveChip) {
    waveChip.click();
    const testBtn = [...createdElements].reverse().find(el => el.tagName === 'BUTTON' && el.className === 'ency-challenge-btn wave-test');
    if (testBtn) {
      testBtn.click();                            // 试波：开局波次挑战（任一编队行）
      frames(200);                                // ≈3.3s：updateChallenge 刷整波 / 敌机入场
      key('='); frames(60); key('=', false);      // 额外追加一整波（不清场，可叠加）
      frames(120);
      sample('波次测试挑战（试波 + = 补波）');
    } else errors.push({ key: '试波按钮缺失', stack: '波次权重表未找到 wave-test 按钮（infoFormationRows / buildWeightTable 改动回归？）' });
  } else errors.push({ key: '波次子页缺失', stack: '权重表未找到「波次」子页 chip（renderInfoWeights 改动回归？）' });

  // 持续刷怪测试（Lv20 无限刷怪）回归：
  // （2026-09-30 事故：正常刷怪通道 !state.challenge 门控把 swarm 一并跳过 → 开局空场一只怪都没有）
  // 覆盖：图鉴按钮进入 swarm 挑战 / 14-main 正常通道放行 + 锁 Lv20 / 04-spawn swarm 分支不误补刷
  const swarmBtn = [...createdElements].reverse().find(el => el.tagName === 'BUTTON' && el.textContent.includes('持续刷怪测试'));
  if (swarmBtn) {
    swarmBtn.click();                             // 开局持续刷怪测试（challenge.kind==='swarm'）
    frames(400);                                  // ≈6.7s：spawnTimer 出怪 + 编队入场
    if (isModules) {
      const coreSw = await import(pathToFileURL(join(jsDir, '02-core.js')).href);
      if (coreSw.enemies.length === 0) {
        errors.push({ key: '持续刷怪测试空场', stack: 'swarm 模式 400 帧后场上无敌人（正常刷怪通道 challenge 门控回归？）' });
      }
      if (coreSw.levelFlow.level !== 20) {
        errors.push({ key: '持续刷怪测试等级未锁', stack: 'swarm 模式 levelFlow.level=' + coreSw.levelFlow.level + '（预期恒 20）' });
      }
    }
    sample('持续刷怪测试 Lv20 出怪');
  } else errors.push({ key: '刷怪测试按钮缺失', stack: '权重页未找到「持续刷怪测试」按钮（renderInfoWeights 改动回归？）' });

  // 诗篇波次制（wip 实测）：modules 模式下直接 setDifficulty 到 poem（绕过主菜单 wip 选择限制）→ 开局跑帧——
  // 覆盖 14-main 波次制分支（清场驱动 / clearDelay / 波 N = 等级 N / BOSS 触发改波次计数）、
  // 04-spawn 附加先兆者与加血节流递减、08-entities 35% 回复、06-enemy 波次节流（无 BOSS 阶段不触发脚本化置满）
  if (isModules) {
    const cfg = await import(pathToFileURL(join(jsDir, '01-config.js')).href);
    const core = await import(pathToFileURL(join(jsDir, '02-core.js')).href);
    if (cfg.DIFFICULTIES && cfg.DIFFICULTIES.poem && cfg.setDifficulty) {
      cfg.setDifficulty(cfg.DIFFICULTIES.poem);
      key('p'); frames(5); key('p', false);         // 暂停（退出上一场景的波次挑战）
      elements.pauseHomeBtn.click(); frames(10);    // 返回主界面：resetGame(false) 清 challenge/keepTest 态
      elements.startBtn.click();
      frames(400);                                  // ≈6.6s：首波刷出 / 清场计时 / 波次制关卡推进
      if (core.levelFlow.poemWaveIdx < 1) {
        errors.push({ key: '诗篇波次制未出波', stack: '400 帧后 poemWaveIdx=' + core.levelFlow.poemWaveIdx + '（波次制刷怪分支未生效？）' });
      }
      elements.startBtn.click();                    // 重开：同步 resetGame（波次制字段归零）
      if (core.levelFlow.poemWaveIdx !== 0) {
        errors.push({ key: '诗篇波次制重开未归零', stack: '重开后 poemWaveIdx=' + core.levelFlow.poemWaveIdx + '（resetGame 归零缺失？）' });
      }
      frames(120);                                  // 新局：立即刷第 1 波
      if (core.levelFlow.poemWaveIdx < 1) {
        errors.push({ key: '诗篇波次制重开未出波', stack: '重开 120 帧后 poemWaveIdx=' + core.levelFlow.poemWaveIdx + '（新局波次制未生效？）' });
      }
      key('p'); frames(5); key('p', false);
      elements.pauseHomeBtn.click(); frames(10);    // 返回主界面
      sample('诗篇波次制跑帧');
      cfg.setDifficulty(cfg.DIFFICULTIES.realme);   // 还原默认难度，避免影响后续场景
    }
  }

  // 破片U型（诗篇新敌）跑帧：modules 模式直调 spawnPopianU（强制停留点在玩家侧上方、避开主武器弹道）——
  // 覆盖移动/开火状态机 U型分支：① 入场即计时（不等锁停，atkT 1.8~2s）② 途中旋转瞄准玩家
  // ③ 延迟到期后红圈预警 → 三连发出弹（U型伤害路径 spawnPopianMissile dmgF/dmgW）
  if (isModules) {
    const core = await import(pathToFileURL(join(jsDir, '02-core.js')).href);
    const spawn = await import(pathToFileURL(join(jsDir, '04-spawn.js')).href);
    const playerMod = await import(pathToFileURL(join(jsDir, '07-player.js')).href);
    if (spawn.spawnPopianU && core.enemies && core.player) {
      key('p'); frames(5); key('p', false);
      elements.pauseHomeBtn.click(); frames(10);    // 从上一场景干净返回
      elements.startBtn.click(); frames(10);        // 开局（玩家就位）
      // 出生/停留点整体避开玩家主武器竖直弹道（玩家固定不动、弹幕持续上扫，且屏外实体也可被命中——
      // 生成在弹道正上方会在入场途中被击毁，实体移除后 atkT 冻结，断言全部失真）
      const sx = core.player.x - 180;
      const e = spawn.spawnPopianU(sx, -50, {
        tpX: sx + 80,
        tpY: 360,
      });
      if (!e || e.type !== 'popianU') {
        errors.push({ key: '破片U型生成失败', stack: 'spawnPopianU 未返回 popianU 实体' });
      } else {
        const atk0 = e.atkT;
        if (!(atk0 > 1.5 && atk0 <= 2.0 + 1e-6)) {
          errors.push({ key: '破片U型首攻延迟初值异常', stack: 'atkT=' + atk0 + '（真我难度应为 1.8~2s 随机，见 POPIAN_U.firstDelay）' });
        }
        // 每帧隔离：清他机 / 清敌弹 / 清我方弹——本场景只验证 U型状态机（途中瞄准 + 入场即计时 + 延迟开火），不验证其生存性
        const isolate = () => {
          for (let i = core.enemies.length - 1; i >= 0; i--) if (core.enemies[i] !== e) core.enemies.splice(i, 1);
          if (playerMod.clearEnemyBullets) playerMod.clearEnemyBullets();
          if (core.pBullets) core.pBullets.length = 0;
        };
        for (let f = 0; f < 100; f++) { frames(1); isolate(); }   // ≈1.67s：仍在入场飞行（行程 ≈2.2s）
        if (e.hp <= 0) {
          errors.push({ key: '破片U型测量窗口内被击毁', stack: 'hp=' + e.hp + '（场景隔离不足：我方弹幕仍命中 U型）' });
        }
        if (e.atkT > atk0 - 1.0) {
          errors.push({ key: '破片U型入场未计时', stack: '飞行中 atkT=' + e.atkT.toFixed(2) + '（初值 ' + atk0.toFixed(2) + '）——U型应入场即计时，不等锁停' });
        }
        let sawMissiles = false;
        for (let f = 0; f < 420 && !sawMissiles; f++) {   // 最多 7s：入场 ≈2.2s + 延迟 ≤2s + 索敌增长至覆盖 + 红圈 0.8s + 出弹
          frames(1);
          isolate();
          if (core.popianMissiles.length > 0) sawMissiles = true;
        }
        if (!sawMissiles) {
          errors.push({ key: '破片U型未开火', stack: '420 帧内未见三连发导弹（延迟门控/途中瞄准/索敌分支异常？）' });
        }
        sample('破片U型 跑帧（途中瞄准 + 延迟开火）');
      }
      key('p'); frames(5); key('p', false);
      elements.pauseHomeBtn.click(); frames(10);    // 返回主界面
    }
  }

  // 战争幽灵（诗篇新敌）跑帧：modules 模式直调 spawnWarGhost——覆盖状态机全相位：
  // ① 入场风波 1s → 极速冲刺（逐帧步长 ≤ 巡航速上限，速度曲线铁律）→ 抵达演出 → 驻留
  // ② 技能序列（强制首技能 2 → 之后固定 1→2→3）：技能2/技能1 均出双刃斩击流 wgSlashes → 技能3 排入 scheduled 出弹幕
  // ③ 驻留倒计时置短：离场直线预警 1s → 加速斩出（wgSpd 单调升、步长 ≤ 满速上限）→ 出界移除
  if (isModules) {
    const core = await import(pathToFileURL(join(jsDir, '02-core.js')).href);
    const spawn = await import(pathToFileURL(join(jsDir, '04-spawn.js')).href);
    const playerMod = await import(pathToFileURL(join(jsDir, '07-player.js')).href);
    const cfg = await import(pathToFileURL(join(jsDir, '01-config.js')).href);
    if (spawn.spawnWarGhost && core.enemies && core.player) {
      key('p'); frames(5); key('p', false);
      elements.pauseHomeBtn.click(); frames(10);    // 从上一场景干净返回
      elements.startBtn.click(); frames(10);        // 开局（玩家就位）
      const e = spawn.spawnWarGhost(false);
      if (!e || e.type !== 'warGhost') {
        errors.push({ key: '战争幽灵生成失败', stack: 'spawnWarGhost 未返回 warGhost 实体' });
      } else {
        // 停留点挪到玩家侧上方（避开主武器弹道与冲撞路径）；首技能强制 2（序列 2→3→1 全可断言）
        e.wgStay = { x: core.player.x - 190, y: 300 };
        e.wgFirst = 2; e.wgNext = null;
        if (e.wgPhase !== 0) {
          errors.push({ key: '战争幽灵初始相位异常', stack: 'wgPhase=' + e.wgPhase + '（应为 0 入场预警）' });
        }
        // 每帧隔离：清他机 / 清敌弹 / 清我方弹（只验证幽灵状态机本身）
        const isolate = () => {
          for (let i = core.enemies.length - 1; i >= 0; i--) if (core.enemies[i] !== e) core.enemies.splice(i, 1);
          if (playerMod.clearEnemyBullets) playerMod.clearEnemyBullets();
          if (core.pBullets) core.pBullets.length = 0;
        };
        // ① 入场全程跟踪（预警 2.667s[2026-10-03 -40% 增速] + 登场延迟 0.35s[2026-10-03 三档削减] + 冲刺 ≈1s + 演出 0.9s ≈ 305 帧，给 400 余量）
        let maxStep = 0, prev = null, sawArrive = false, sawDelay = false;
        for (let f = 0; f < 400 && !sawArrive; f++) {
          frames(1); isolate();
          if (prev) maxStep = Math.max(maxStep, Math.hypot(e.x - prev.x, e.y - prev.y));
          prev = { x: e.x, y: e.y };
          if (e.wgPhase === 0 && e.wgWarnT >= cfg.WAR_GHOST.entryWarn) sawDelay = true;   // 预警完毕后的登场延迟期
          if (e.wgPhase >= 3) sawArrive = true;
        }
        if (!sawArrive) {
          errors.push({ key: '战争幽灵未抵达驻留', stack: '400 帧内未进入相位 3（wgPhase=' + e.wgPhase + '）' });
        }
        if (!sawDelay) {
          errors.push({ key: '战争幽灵登场延迟缺失', stack: '全程未见「预警完毕（wgWarnT≥entryWarn）但停留在相位 0」的延迟期——entryDelay 未生效？' });
        }
        if (maxStep > 42) {
          errors.push({ key: '战争幽灵入场存在瞬跳', stack: '相邻帧最大位移 ' + maxStep.toFixed(1) + 'px（> 42px，巡航 1500px/s @60fps 上限余量）——速度曲线铁律' });
        }
        // ② 技能序列 2→3→1（严格轮换）：≈1.2（首技能间隔）+ 1.35（技能2 跟随0.5+锁定预警0.85，2026-10-03 -0.15s）
        //    + 2.2 + 1.89（技能3 弹幕 2×0.945）+ 2.2 + 1.985（技能1 预警1.2[内含双刃伸长]+扫斩0.185+停持0.1+归鞘0.5）≈ 10.8s ≈ 650 帧，给 780 帧余量
        let sawSlashes = false, sawBarrage = false, sawSkill1 = false;
        for (let f = 0; f < 780 && !(sawSlashes && sawBarrage && sawSkill1); f++) {
          frames(1);
          // 断言先于隔离：隔离会 clearEnemyBullets，弹幕存在性必须在清理前采样
          if (e.wgSkill && e.wgSkill.kind === 1) sawSkill1 = true;
          if (core.wgSlashes.length >= 2) sawSlashes = true;
          if (core.eBullets.some(b => b.owner === e)) sawBarrage = true;
          isolate();
        }
        if (!sawSlashes) errors.push({ key: '战争幽灵技能2未出斩击流', stack: '780 帧内 wgSlashes 未出现 ≥2 道（锁定后发射分支异常？）' });
        if (!sawBarrage) errors.push({ key: '战争幽灵技能3未出弹幕', stack: '780 帧内未见幽灵子弹（scheduled 排弹 / fire 分支内推进异常？）' });
        if (!sawSkill1) errors.push({ key: '战争幽灵技能1未施放', stack: '780 帧内未进入技能1（序列应 2→3→1，技能1=两刃斩击扇面预警→扫斩）' });

        // 半血召唤校验：hp 置 50% → 推进 2 帧（不隔离，保留召唤物）——
        // 光环配置应为 ×2（+100%）；铁砧 / 破片U型目标点须在幽灵左右身侧略微后方（后方即上方）
        if (cfg.WAR_GHOST.auraSpdMul !== 2 || cfg.WAR_GHOST.auraAccMul !== 2) {
          errors.push({ key: '战争幽灵光环倍率异常', stack: 'auraSpdMul=' + cfg.WAR_GHOST.auraSpdMul + ' auraAccMul=' + cfg.WAR_GHOST.auraAccMul + '（应均为 2）' });
        }
        e.hp = e.maxHp * 0.5;
        const gx = e.x, gy = e.y;                    // 快照：召唤在本帧内按此位置取点（下帧幽灵自身会摆动）
        frames(2);
        const aS = core.enemies.find(x => x !== e && x.type === 'anvil');
        const uS = core.enemies.find(x => x !== e && x.type === 'popianU');
        if (!aS || !uS) {
          errors.push({ key: '战争幽灵半血未召唤', stack: 'anvil=' + !!aS + ' popianU=' + !!uS });
        } else {
          const W = core.canvas.width;
          const expY = Math.max(60, gy - cfg.WAR_GHOST.summonBackY);
          const expAnvilX = Math.max(46, Math.min(W - 46, gx - cfg.WAR_GHOST.summonSideGap));
          const expUX = Math.max(46, Math.min(W - 46, gx + cfg.WAR_GHOST.summonSideGap));
          if (!(aS.hoverY < e.y && uS.tpY < e.y)) {
            errors.push({ key: '召唤目标点不在后方', stack: 'anvil.hoverY=' + aS.hoverY.toFixed(1) + ' popianU.tpY=' + uS.tpY.toFixed(1) + ' ghost.y=' + e.y.toFixed(1) + '（应均在幽灵上方）' });
          }
          // 召唤在帧内「幽灵移动之后」发生，取点相对帧前快照有 <1px 的帧内摆动偏移，按 ±1px 容差校验
          if (Math.abs(aS.hoverY - expY) > 1 || Math.abs(uS.tpY - expY) > 1) {
            errors.push({ key: '召唤后方偏移量异常', stack: 'anvil.hoverY=' + aS.hoverY + ' U.tpY=' + uS.tpY + ' 期望=' + expY });
          }
          if (Math.abs(aS.x - expAnvilX) > 1 || Math.abs(uS.tpX - expUX) > 1) {
            errors.push({ key: '召唤身侧间距异常', stack: 'anvil.x=' + aS.x.toFixed(1) + '（期望 ' + expAnvilX.toFixed(1) + '）U.tpX=' + uS.tpX + '（期望 ' + expUX + '）' });
          }
          if (!((aS.x - e.x) * (uS.x - e.x) < 0)) {
            errors.push({ key: '召唤物未分居两侧', stack: 'anvil.x=' + aS.x.toFixed(1) + ' U.x=' + uS.x.toFixed(1) + ' ghost.x=' + e.x.toFixed(1) });
          }
        }

        // ③ 离场：驻留倒计时置短 → 相位 4 直线预警 1s → 相位 5 加速斩出 → 出界移除
        e.wgDwellT = 0.1;
        let prevSpd = -1, spdMono = true, maxExitStep = 0, gone = false;
        prev = { x: e.x, y: e.y };
        for (let f = 0; f < 400 && !gone; f++) {
          frames(1); isolate();
          maxExitStep = Math.max(maxExitStep, Math.hypot(e.x - prev.x, e.y - prev.y));
          prev = { x: e.x, y: e.y };
          if (e.wgPhase === 5) {
            if (prevSpd >= 0 && e.wgSpd + 1e-6 < prevSpd) spdMono = false;
            prevSpd = e.wgSpd;
          }
          gone = !core.enemies.includes(e);
        }
        if (!gone) errors.push({ key: '战争幽灵离场未出界', stack: '400 帧后仍在场（wgPhase=' + e.wgPhase + ' wgSpd=' + (e.wgSpd || 0).toFixed(0) + '）' });
        if (!spdMono) errors.push({ key: '战争幽灵离场速度回退', stack: '相位 5 内 wgSpd 出现下降（应为固定加速度平滑积分）' });
        if (maxExitStep > 45) errors.push({ key: '战争幽灵离场存在瞬跳', stack: '相邻帧最大位移 ' + maxExitStep.toFixed(1) + 'px（> 45px，满速 2400px/s @60fps 上限余量）——速度曲线铁律' });
        sample('战争幽灵 跑帧（入场 / 技能 2→3→1 / 离场斩出）');
      }
      key('p'); frames(5); key('p', false);
      elements.pauseHomeBtn.click(); frames(10);    // 返回主界面
    }
  }

  // 脉冲矩阵自爆跑帧：直调 spawnPulseMatrix(1e9)——覆盖登场 20s 自爆全链路（2026-10-02）：
  // ① pmAgeT 逐帧累计（登场起算、全模式生效——1e9 永驻不再豁免）→ 20s 置 pmSelfDestruct
  // ② 自爆模式下一波半径 = selfDestructR 160（pmWaveR）
  // ③ 自爆波扩散完毕瞬间：本体死亡（killEnemy 正常结算）+ 分裂三座法术矩阵
  if (isModules) {
    const core = await import(pathToFileURL(join(jsDir, '02-core.js')).href);
    const spawn = await import(pathToFileURL(join(jsDir, '04-spawn.js')).href);
    const playerMod = await import(pathToFileURL(join(jsDir, '07-player.js')).href);
    const cfg = await import(pathToFileURL(join(jsDir, '01-config.js')).href);
    if (spawn.spawnPulseMatrix && core.enemies && core.player) {
      key('p'); frames(5); key('p', false);
      elements.pauseHomeBtn.click(); frames(10);    // 从上一场景干净返回
      elements.startBtn.click(); frames(10);        // 开局（玩家就位）
      const e = spawn.spawnPulseMatrix(1e9);
      if (!e || e.type !== 'pulseMatrix') {
        errors.push({ key: '脉冲矩阵生成失败', stack: 'spawnPulseMatrix 未返回 pulseMatrix 实体' });
      } else {
        // 每帧隔离：清他机 / 清敌弹 / 清我方弹 + 本体回满血（防我方弹幕/敌弹干扰，只验证自爆链路本身）
        const isolate = () => {
          for (let i = core.enemies.length - 1; i >= 0; i--) if (core.enemies[i] !== e) core.enemies.splice(i, 1);
          if (playerMod.clearEnemyBullets) playerMod.clearEnemyBullets();
          if (core.pBullets) core.pBullets.length = 0;
          e.hp = e.maxHp;
        };
        // 登场 20s + 下一波 ≤2.2s + 波扩散 0.45s ≈ 22.7s ≈ 1362 帧，给 1560 帧余量
        let sawSD = false, sawWaveR160 = false, boom = false, fashiN = 0;
        for (let f = 0; f < 1560 && !boom; f++) {
          frames(1);
          // 断言采样先于隔离
          if (e.pmSelfDestruct) sawSD = true;
          if (e.pmSelfDestruct && (e.pmWaveR || 0) === cfg.PULSE_MATRIX.selfDestructR) sawWaveR160 = true;
          if (!core.enemies.includes(e)) {   // 本帧本体死亡（自爆移除）——本帧不隔离，采样分裂产物
            boom = true;
            fashiN = core.enemies.filter(x => x.type === 'fashiMatrix').length;
            break;
          }
          isolate();
        }
        if (!sawSD) errors.push({ key: '脉冲矩阵未进入自爆模式', stack: '1560 帧内 pmSelfDestruct 未置位（pmAgeT=' + (e.pmAgeT || 0).toFixed(1) + 's，应为登场 20s 起算）' });
        if (!sawWaveR160) errors.push({ key: '自爆波半径未达 160', stack: '自爆模式下未见 pmWaveR=' + cfg.PULSE_MATRIX.selfDestructR + ' 的释放' });
        if (!boom) errors.push({ key: '脉冲矩阵自爆未死亡', stack: '1560 帧后本体仍在场（pmSelfDestruct=' + !!e.pmSelfDestruct + ' pmWaveR=' + (e.pmWaveR || 0) + '）' });
        else if (fashiN < 3) errors.push({ key: '自爆未分裂三座法术矩阵', stack: '本体死亡帧场上 fashiMatrix=' + fashiN + '（应 ≥3）' });
        // 分裂体逐帧不瞬跳：爆散飞离（burst easeOut 峰速 ~230px/s ≈ 4px/帧）+ 胡乱移动（wanderSpd 限速），
        // 任何一帧位移 > 12px 即为瞬移（回归点：mxPhase 1 全局带 clamp 曾把分裂体单帧上拉 ~270px）
        {
          const splits = core.enemies.filter(x => x.type === 'fashiMatrix').slice(0, 3);
          const prevs = splits.map(m => ({ x: m.x, y: m.y }));
          let maxSplitStep = 0;
          for (let f = 0; f < 90; f++) {
            frames(1);
            splits.forEach((m, mi) => {
              if (!core.enemies.includes(m) || !prevs[mi]) return;
              maxSplitStep = Math.max(maxSplitStep, Math.hypot(m.x - prevs[mi].x, m.y - prevs[mi].y));
              prevs[mi] = { x: m.x, y: m.y };
            });
          }
          if (maxSplitStep > 12) errors.push({ key: '自爆分裂法术矩阵存在瞬移', stack: '相邻帧最大位移 ' + maxSplitStep.toFixed(1) + 'px（> 12px，burst 峰值 ~4px/帧 + 漫游限速余量）' });
        }
        sample('脉冲矩阵 自爆跑帧（登场 20s 计时 / 160px 自爆波 / 死亡分裂三法术矩阵）');
      }
      key('p'); frames(5); key('p', false);
      elements.pauseHomeBtn.click(); frames(10);    // 返回主界面
    }
  }

  // 黑暗之手（诗篇 BOSS）跑帧：直调 spawnBoss('darkhand')——lurk 即退（无警报直召路径）→ sweep 黑影掠过（≈33 帧，体型 +25% 后路径略长）
  // → outline 停顿 0.9s + 轮廓 1.05s → reveal 0.675s，合计约 185 帧进入 combat；随后断言常态技能循环（暗核弹幕）、
  // 连携召唤（80/60/40/20% 血量阈值；前两名夏勇/朴学峰组内随机、后两名韩希先/辛国栋组内随机，2026-10-03 五轮定稿）、
  // 跨阈值补召唤、窗口内未击杀 → 迅速离场并记录血量、爆弹不波及 dhLink 精英
  if (isModules) {
    const core = await import(pathToFileURL(join(jsDir, '02-core.js')).href);
    const bossMod = await import(pathToFileURL(join(jsDir, '05-boss.js')).href);
    const playerMod = await import(pathToFileURL(join(jsDir, '07-player.js')).href);
    if (bossMod.spawnBoss && core.enemies && core.player) {
      key('p'); frames(5); key('p', false);
      elements.pauseHomeBtn.click(); frames(10);    // 从上一场景干净返回
      elements.startBtn.click(); frames(10);        // 开局（玩家就位）
      core.player.hp = 1e9;                         // 护玩家：末阈值观察帧内第 4 名连携精英的直击技能可能致死——
                                                    // 死亡会把 mode 切 gameover，导致后续 useBomb 门控 return（第⑤步假红根因）
      core.enemies.length = 0;                      // 清场，保证断言只看本场景产物
      bossMod.spawnBoss('darkhand');
      const e = core.enemies.find(x => x && x.type === 'boss' && x.bossId === 'darkhand');
      if (!e) {
        errors.push({ key: '黑暗之手生成失败', stack: 'spawnBoss darkhand 未产生 BOSS 实体（BOSSES.darkhand 注册 / spawn 分支缺失？）' });
      } else {
        // 每帧隔离：清敌弹（保护玩家）——弹存在性断言先于隔离采样
        const isolate = () => { if (playerMod.clearEnemyBullets) playerMod.clearEnemyBullets(); };
        // ① 入场：sweep 掠过 + outlineDelay 0.9s 停顿（2026-10-03 +0.3s）+ outline 1.05s + reveal 0.675s ≈ 185 帧；
        //    登场蛋挞扇已删（2026-10-02 用户定稿「去掉长条蛋挞发射」）——断言登场全程不再出现 tart 长条蛋挞弹
        let combat = false, sawFan = false;
        for (let f = 0; f < 400 && !combat; f++) {
          frames(1);
          if (core.eBullets.some(b => b.tart && b.len)) sawFan = true;
          isolate(); combat = e.phase === 'combat';
        }
        if (!combat) errors.push({ key: '黑暗之手未进入战斗', stack: '400 帧后 phase=' + e.phase + '（应为 combat，四段式登场合计约 4.3s）' });
        if (sawFan) errors.push({ key: '黑暗之手登场蛋挞扇应已删除', stack: '登场动画期间出现 tart 长条蛋挞弹（reveal 发射逻辑未删干净？）' });
        // ② 技能循环：入场后 skillCd = 旧日之歌 2.2s×40%×虚象 1.5 ≈1.3s + 技能时长 → 700 帧内应施放 ≥1 次并出弹幕
        //    （本场景此阶段场上仅黑暗之手一个敌人，eBullets 非空即其弹幕；暗核弹 / 巨大蛋挞 / 涟漪均计入）
        // ①b 技能4 爪翼毁灭光束：强制触发，走完整「预警→发射×3 组→收口」状态机（2026-10-03 四轮定稿
        //    预警 1.2s、组发射间隔 = warnDur：≈4.05s = 243 帧）——断言过程中光束折线段出现且非空（渲染块每帧执行、
        //    vis 随 b.t 同窗口推进，见 11-draw-boss）、结束 e.skill 归 null
        e.skill = { id: 3, t: 0, shotT: 0, cannonIdx: 0, ringsFired: 0, firedN: 0, gi: 0, st: 'warn', pt: 0, beams: [] };
        let s4BeamFrames = 0, s4EmptySegs = false;
        for (let f = 0; f < 260 && e.skill; f++) {
          frames(1); isolate();
          const sk = e.skill;   // 技能可能恰在本帧收口（≈243 帧 < 260 帧上限）——循环体内重取，防 null.beams 竞态
          if (!sk) break;
          for (const b of sk.beams) {
            s4BeamFrames++;
            if (!b.segs.length) s4EmptySegs = true;
          }
        }
        if (!s4BeamFrames) errors.push({ key: '技能4 光束未出现', stack: '强制 id=3 技能 260 帧内 beams 恒空（warnDur→发射门控 / 组序 gi 异常？）' });
        if (s4EmptySegs) errors.push({ key: '技能4 光束折线段为空', stack: 'beams 出现但存在 segs.length=0（dhBeamSegments 射线求交异常？）' });
        if (e.skill) errors.push({ key: '技能4 未收口', stack: '260 帧后 e.skill 未清空（三组 warn 1.2 + 末组 beamDur 0.45 ≈4.05s 应完成收口）' });
        let sawSkill = false, sawShot = false;
        for (let f = 0; f < 700 && !(sawSkill && sawShot); f++) {
          frames(1);
          if (e.hp < e.maxHp * 0.9) e.hp = e.maxHp * 0.9;
          if (e.skill) sawSkill = true;
          if (core.eBullets.length > 0) sawShot = true;
          isolate();
        }
        if (!sawSkill) errors.push({ key: '黑暗之手未施放技能', stack: '700 帧内 e.skill 恒为 null（startDarkhandSkill / skillCd 门控异常？）' });
        if (!sawShot) errors.push({ key: '黑暗之手未见弹幕', stack: '700 帧内 eBullets 恒为空（四管炮幕 / 黑暗涟漪弹幕未出膛？）' });
        // ③ 连携召唤：回满玩家血（sweep 已扣 80% + 精英技能会打玩家），压 BOSS 血量跨阈值断言 dhLink 精英登场
        core.player.hp = core.player.maxHp;
        const activeLink = () => core.enemies.filter(x => x && x.dhLink && x.hp > 0 && x.elPhase !== 2).length;
        e.hp = e.maxHp * 0.75;   // 跨 80% 阈值 → 首名登场
        let link1 = 0;
        for (let f = 0; f < 10 && !link1; f++) { frames(1); isolate(); link1 = activeLink(); }
        if (!link1) errors.push({ key: '黑暗之手未召唤连携精英', stack: '血量压至 75% 后 10 帧内 enemies 无 dhLink 精英（阈值召唤 while 循环异常？）' });
        for (const el of core.enemies) if (el && el.dhLink) el.hp = el.maxHp = 1e9;   // 精英拉满血：防玩家火力误杀干扰计数
        e.hp = e.maxHp * 0.35;   // 同帧跨 60% + 40% 两阈值：80% 窗口精英随窗口结束迅速离场（dhFledElites 记录），
        let fled2 = 0, link3 = 0;   // 60% 窗口精英生成即跨出窗口同样离场 → 仅 40% 窗口新精英在场（active = 1，符合窗口语义）
        for (let f = 0; f < 10 && !fled2; f++) {
          frames(1); isolate();
          for (const el of core.enemies) if (el && el.dhLink) el.hp = el.maxHp = 1e9;
          fled2 = core.state.dhFledElites.length; link3 = activeLink();
        }
        if (e.dhSummoned.length !== 3 || fled2 !== 2 || link3 !== 1
            || new Set(e.dhSummoned).size !== e.dhSummoned.length) {
          errors.push({ key: '黑暗之手跨阈值召唤/离场异常', stack: '血量 35% 后 dhSummoned=' + e.dhSummoned.length + '（应 3，且不重复）/ dhFledElites=' + fled2 + '（应 2）/ 在场 active=' + link3 + '（应 1）' });
        }
        // ④ 窗口内未击杀 → 迅速离场并记录：压至 15%（跨 20% 末阈值）→ 40% 窗口精英离场登记（累计 3 条）+ 第 4 名登场
        e.hp = e.maxHp * 0.15;
        let ok4 = false;
        for (let f = 0; f < 10 && !ok4; f++) {
          frames(1); isolate();
          ok4 = e.dhSummoned.length === 4 && core.state.dhFledElites.length === 3 && activeLink() === 1;
        }
        if (!ok4) errors.push({ key: '黑暗之手连携精英未离场记录', stack: '跨末阈值后 dhSummoned=' + e.dhSummoned.length + '（应 4）/ dhFledElites=' + core.state.dhFledElites.length + '（应 3）/ 在场 active=' + activeLink() + '（应 1）' });
        // ⑤ 自爆豁免：高能爆弹不波及连携精英（2026-10-02 用户定稿「自爆时不会炸死连携敌人」）——
        //    精英血量压至有限值后引爆爆弹，断言精英血量分毫未动、本体血量正常扣除（guardDR 减免路径照常）
        const linkE = core.enemies.find(x => x && x.dhLink && x.hp > 0 && x.elPhase !== 2);
        if (linkE) {
          linkE.hp = 10000; linkE.maxHp = 10000;
          // 显式补弹：诗篇场景收尾把难度还原为真我（mods.bombStart=0）→ 本场景每局 0 弹开局，
          // 是否凑到爆弹全看场内随机拾取（曾致本断言闪烁假红）——断言自带弹药、与难度/拾取解耦
          core.state.bombs = Math.max(core.state.bombs, 1);
          const hp0 = e.hp;
          playerMod.useBomb(); frames(2);
          if (linkE.hp !== 10000) errors.push({ key: '爆弹波及了连携精英', stack: 'useBomb 后 dhLink 精英 hp=' + linkE.hp + '（应保持 10000——连携精英不吃爆弹/秒杀类全屏波及）' });
          if (e.hp >= hp0) errors.push({ key: '爆弹未对黑暗之手结算', stack: 'useBomb 后本体 hp 未下降（爆弹结算循环异常？）[诊断] e.hp=' + e.hp + ' hp0=' + hp0 + ' 在场=' + (core.enemies.indexOf(e) >= 0) + ' stage=' + core.bossFlow.stage + ' bombs=' + core.state.bombs + ' alive=' + core.player.alive + ' combatReady=' + e.combatReady + ' challenge=' + core.state.challenge });
        }
        sample('黑暗之手 跑帧（登场演出 + 常态技能弹幕 + 连携召唤/离场记录）');
      }
      core.enemies.length = 0;
      key('p'); frames(5); key('p', false);
      elements.pauseHomeBtn.click(); frames(10);    // 返回主界面
    }
  }

  // 4F 精英（四机）跑帧：直调 spawnEliteMinion——① 入场逐帧步长连续（速度曲线铁律）+ 抵达驻留；
  // ② 强制首技能（elFirst）跑技能窗口：朴 1 流星穿刺贯穿相位 / 韩 2 旋眼火螺径向弹幕 /
  //    夏 屏障首发（固定五步循环，xyStep 游标，elFirst 不参与）/ 辛 1 地毯轰炸落点排入
  if (isModules) {
    const core = await import(pathToFileURL(join(jsDir, '02-core.js')).href);
    const spawn = await import(pathToFileURL(join(jsDir, '04-spawn.js')).href);
    const playerMod = await import(pathToFileURL(join(jsDir, '07-player.js')).href);
    const cfg4f = await import(pathToFileURL(join(jsDir, '01-config.js')).href);
    // 本场景沿诗篇场景收尾还原的难度跑（真我）：屏障数值按难度取期望（普通 2000 / 真我 2500 / 诗篇 3000）
    const barExpect = cfg4f.isPoem ? (cfg4f.isPoem() ? 3000 : cfg4f.isRealme() ? 2500 : 2000) : 2000;
    if (spawn.spawnEliteMinion && core.enemies && core.player) {
      key('p'); frames(5); key('p', false);
      elements.pauseHomeBtn.click(); frames(10);    // 从上一场景干净返回
      elements.startBtn.click(); frames(10);        // 开局（玩家就位）
      core.player.hp = 1e9;                         // 护玩家：精英直击类技能（激光/坠击/轰炸）窗口内会反复命中，防止死亡中断状态机
      // 每帧隔离：清他机 / 清敌弹 / 清我方弹（只验证精英状态机本身）
      const isolate = (e) => {
        for (let i = core.enemies.length - 1; i >= 0; i--) if (core.enemies[i] !== e) core.enemies.splice(i, 1);
        if (playerMod.clearEnemyBullets) playerMod.clearEnemyBullets();
        if (core.pBullets) core.pBullets.length = 0;
      };
      for (const [type, first, cond] of [
        ['puxuefeng', 1, (e) => e.elPhase === 11],                                          // 流星穿刺：进入贯穿相位
        ['hanxixian', 2, (e) => core.eBullets.some(b => b.owner === e)],                    // 旋眼火螺：径向弹幕出膛（两技循环，编号 2）
        ['xiayong', 0, (e) => e.xyBarOn === true],                                          // 屏障：xyBarOn 置位（五步循环首发）
        ['xinguodong', 1, (e) => e.xgBombs.length > 0],                                     // 地毯轰炸：落点排入
      ]) {
        core.enemies.length = 0;
        const e = spawn.spawnEliteMinion(type, 1e9);
        if (!e || e.type !== type) {
          errors.push({ key: '4F 精英生成失败（' + type + '）', stack: 'spawnEliteMinion 未返回 ' + type + ' 实体' });
          continue;
        }
        e.elFirst = first; e.elNext = 0;
        // 防击毁：主菜单遗留的副武器自动火力（追踪弹可全程命中顶部驻留点，isolate 的逐帧清 pBullets 挡不住）
        // 会在窗口内击毁默认血量的精英——血量拉满保证 11s 状态机窗口完整（第二参 1e9 是驻留时长，不是血量）
        e.hp = e.maxHp = 1e9;
        // ① 入场全程跟踪（行程 ≈1s：430px/s 指数减速）
        let maxStep = 0, prev = null, stay = false;
        for (let f = 0; f < 150 && !stay; f++) {
          frames(1); isolate(e);
          if (prev) maxStep = Math.max(maxStep, Math.hypot(e.x - prev.x, e.y - prev.y));
          prev = { x: e.x, y: e.y };
          if (e.elPhase === 1) stay = true;
        }
        if (!stay) errors.push({ key: '4F 精英未驻留（' + type + '）', stack: '150 帧内未进入相位 1（elPhase=' + e.elPhase + '）' });
        if (maxStep > 12) errors.push({ key: '4F 精英入场瞬跳（' + type + '）', stack: '相邻帧最大位移 ' + maxStep.toFixed(1) + 'px（> 12px，入场 430px/s @60fps 上限余量）——速度曲线铁律' });
        // ② 技能窗口（660 帧 ≈11s，覆盖两轮技能循环）：断言条件锁存（弹幕类状态瞬逝，逐帧 OR 累积）
        let seen = false;
        for (let f = 0; f < 660 && !seen; f++) { frames(1); seen = seen || cond(e); isolate(e); }
        if (!seen) errors.push({ key: '4F 精英首技能未施放（' + type + '）', stack: '660 帧内技能断言未通过（elFirst=' + first + ' elPhase=' + e.elPhase + ' elT=' + (e.elT || 0).toFixed(2) + ' elSkill.kind=' + (e.elSkill && e.elSkill.kind) + ' alive=' + core.player.alive + ' enemies=' + core.enemies.length + '）' });
        // ③ 辛国栋补充：技能循环应持续推进（第二轮 kind2 启动后 elNext 回到 1；若相位 40 卡死则恒为 2）
        if (type === 'xinguodong') {
          for (let f = 0; f < 480 && e.elNext !== 1; f++) { frames(1); isolate(e); }
          if (e.elNext !== 1) errors.push({ key: '辛国栋技能循环停滞', stack: '首技能（地毯轰炸）后 elNext 恒为 ' + e.elNext + '（应为第二轮十二连发启动后的 1；相位 40 卡死 / 十二连发未收口？）' });
        }
        // ③ 夏勇补充：屏障首发数值（按难度 barExpect）→ 强制 xyStep=2 跑碎翼回旋刃全周期：
        //    0.9s 预警轨迹 → 中心迸出（首帧=本体位置）→ 反向绕行至第二次相撞湮灭（≈1.575s，
        //    逐帧步长 ≤13px + trail 拖尾 + 收口）→ 强制 xyStep=1 跑核心膨胀
        if (type === 'xiayong') {
          if (e.xyBarMax !== barExpect) errors.push({ key: '夏勇屏障数值错误', stack: 'xyBarMax=' + e.xyBarMax + '（当前难度应为 ' + barExpect + '）' });
          // 强制下一技能为回旋刃（五步表 [3,2,1,2,1] 游标：xyStep=2 → idx 1）
          e.xyStep = 2;
          let bladesSeen = false, bladeCenter = false, trailSeen = false, maxBladeStep = 0, prevB = null, merged = false;
          for (let f = 0; f < 480 && !merged; f++) {
            frames(1); isolate(e);
            if (e.xyBlades && e.xyBlades.length) {
              if (!bladesSeen) {
                bladesSeen = true;
                // 双刃应从机体中心迸出（spawn 快照 sx/sy = 迸出帧本体位置）
                bladeCenter = e.xyBlades.every(b => Math.hypot(b.x - e.x, b.y - e.y) < 5);
              }
              const cur = e.xyBlades.map(b => ({ x: b.x, y: b.y }));
              if (prevB && prevB.length === cur.length) {
                for (let i = 0; i < cur.length; i++) maxBladeStep = Math.max(maxBladeStep, Math.hypot(cur[i].x - prevB[i].x, cur[i].y - prevB[i].y));
              }
              prevB = cur;
              if (e.xyBlades.some(b => b.trail && b.trail.length >= 5)) trailSeen = true;
            }
            if (!e.xyBlades && prevB) merged = true;   // 双刃整圈到时湮灭（挂载清除 = 收口）
          }
          if (!bladesSeen) errors.push({ key: '夏勇碎翼回旋刃未施放', stack: 'xyStep=2 强制后 480 帧内未出现双刃（elSkill.kind=' + (e.elSkill && e.elSkill.kind) + ' elGapT=' + (e.elGapT || 0).toFixed(2) + '）' });
          else {
            if (!bladeCenter) errors.push({ key: '夏勇回旋刃迸出点错误', stack: '双刃首帧位置偏离本体中心 >5px（应从机体中心迸出）' });
            if (!trailSeen) errors.push({ key: '夏勇回旋刃无拖尾', stack: '刃体存续期间 trail 采样未达 5 点（拖尾缺失？）' });
            // 上限 13px 的依据：轨道纵向随机增长（bladeRyRand 0.2）最大 ry = 64+0.2×792 ≈ 222，
            // 短轴端峰速 = ω×ry = 3.49×222 ≈ 775px/s ≈ 12.9px/帧——匀速椭圆运动设计值
            //（速度/加速度逐帧连续，非瞬跳）；12px 阈值本为拦截位置跳变，此处按运动学上限校准
            if (maxBladeStep > 13) errors.push({ key: '夏勇回旋刃瞬跳', stack: '刃体相邻帧最大位移 ' + maxBladeStep.toFixed(1) + 'px（> 13px；匀速椭圆短轴端设计峰值 ≈12.9px/帧 @ry=222）——速度曲线铁律' });
            if (!merged) errors.push({ key: '夏勇碎翼回旋刃未湮灭', stack: '480 帧内双刃未湮灭（xyBlades 未清除；elSkill.kind=' + (e.elSkill && e.elSkill.kind) + '）——应为反向绕行第二次相撞（各自行程 1.75π ≈1.575s）后相撞点消散' });
            else if (e.elSkill) errors.push({ key: '夏勇碎翼回旋刃技能未清', stack: '双刃湮灭后 elSkill 仍为 kind ' + e.elSkill.kind + '（收口点未执行？）' });
          }
          // 强制下一轮为技能 2（核心膨胀）：三球互夹 60°、飞行 orbDur(2s) 爆散后 xyOrbs 清除收口
          //（夏勇 2026-10-03 改固定五步循环 [屏障3,大子弹2,回旋刃1,大子弹2,回旋刃1]，elNext 已不参与调度——
          // 直接推 xyStep 到下标 1 = 大子弹；窗口放宽到 420 帧 = 当前技能余量 + 间隔 1.56s + 球飞行 2s）
          e.xyStep = 1;
          let orbsSeen = null, boomDone = false;
          for (let f = 0; f < 420 && !boomDone; f++) {
            frames(1); isolate(e);
            if (e.xyOrbs && e.xyOrbs.length === 3 && orbsSeen === null) {
              // 圆周卷绕感知的相邻夹角：sorted 后含首尾 wrap 缝隙，取最小两缝——三球互夹 60° 时
              // 缝隙集恒为 {60, 60, 240}，与随机基准角是否越过 ±π 无关（夏勇 stayX 随机，base 可 >120°）
              const dir = e.xyOrbs.map(o => Math.atan2(o.vy, o.vx)).sort((a, b) => a - b);
              const gaps = [dir[1] - dir[0], dir[2] - dir[1], dir[0] + Math.PI * 2 - dir[2]].map(d => d * 180 / Math.PI).sort((a, b) => a - b);
              orbsSeen = (Math.abs(gaps[0] - 60) < 1 && Math.abs(gaps[1] - 60) < 1) ? true : { d01: gaps[0], d12: gaps[1] };
            }
            if (orbsSeen === true && !e.xyOrbs) boomDone = true;   // 三球全部爆散（挂载清除 = 收口）
          }
          if (!orbsSeen) errors.push({ key: '夏勇核心膨胀未施放', stack: '420 帧内未见三颗能量球（xyStep=1 强制后；elSkill.kind=' + (e.elSkill && e.elSkill.kind) + ' elGapT=' + (e.elGapT || 0).toFixed(2) + '）' });
          else if (orbsSeen !== true) errors.push({ key: '夏勇核心膨胀夹角错误', stack: '三球相邻夹角 ' + orbsSeen.d01.toFixed(1) + '° / ' + orbsSeen.d12.toFixed(1) + '°（应均为 60°）' });
          else if (!boomDone) errors.push({ key: '夏勇核心膨胀未收口', stack: '三球爆散后 xyOrbs 未清除（收口点未执行？）' });
        }
      }
      core.enemies.length = 0;
      sample('4F 精英 跑帧（四机入场连续性 + 强制首技能）');
      key('p'); frames(5); key('p', false);
      elements.pauseHomeBtn.click(); frames(10);    // 返回主界面
    }
  }

  // 统一伤害规则 · 秒杀类禁亡语召唤：state.sweepKill 置位期间击杀增生侧翼艇 / 法术阵列，
  // 不得分裂卫护飞船 / 爆发法术矩阵（金色陨石秒杀通道的门控回归；规则锚点见 07-player gachaMeteorImpact）
  if (isModules) {
    const core = await import(pathToFileURL(join(jsDir, '02-core.js')).href);
    const spawnMod = await import(pathToFileURL(join(jsDir, '04-spawn.js')).href);
    const enemyMod = await import(pathToFileURL(join(jsDir, '06-enemy.js')).href);
    if (enemyMod.killEnemy && spawnMod.makeEnemy && core.enemies && core.state) {
      key('p'); frames(5); key('p', false);
      elements.pauseHomeBtn.click(); frames(10);    // 从上一场景干净返回
      elements.startBtn.click(); frames(10);        // 开局（玩家就位）
      core.enemies.length = 0;                      // 清场，保证断言只看本场景产物
      // ① 增生侧翼艇：sweepKill 内击杀 → 不得分裂卫护飞船
      const p1 = spawnMod.makeEnemy('prolifera', 400, 200);
      core.state.sweepKill = true;
      enemyMod.killEnemy(core.enemies.indexOf(p1));
      core.state.sweepKill = false;
      const escorts = core.enemies.filter(x => x && x.type === 'escort').length;
      if (escorts > 0) errors.push({ key: '秒杀禁亡语召唤失效（增生）', stack: 'sweepKill 期间击杀增生侧翼艇仍分裂出 ' + escorts + ' 艘卫护飞船' });
      // ② 法术阵列：sweepKill 内击杀 → 不得爆发法术矩阵
      core.enemies.length = 0;
      const p2 = spawnMod.makeEnemy('fashiArray', 400, 200);
      core.state.sweepKill = true;
      enemyMod.killEnemy(core.enemies.indexOf(p2));
      core.state.sweepKill = false;
      const matrices = core.enemies.filter(x => x && x.type === 'fashiMatrix').length;
      if (matrices > 0) errors.push({ key: '秒杀禁亡语召唤失效（法术阵列）', stack: 'sweepKill 期间击杀法术阵列仍爆发 ' + matrices + ' 个法术矩阵' });
      core.enemies.length = 0;
      sample('统一规则 秒杀禁亡语召唤（增生 / 法术阵列）');
    }
  }

  // 御4 / 铁砧：到位悬停后除左右巡航外，应有小幅上下浮动（2026-09-29 用户反馈新增）——
  // 直调 spawnYu4 / spawnAnvil（长 holdTimer，不走自然刷怪），跟踪到位后纵向轨迹：
  // ① 到位瞬间纵向偏移 = 0（与悬停锚点严格连续）
  // ② 缓入后纵向确有上下往复（dy 最大/最小 ≈ ±10px 量级），相邻帧位移连续无瞬跳（速度曲线铁律）
  if (isModules) {
    const core = await import(pathToFileURL(join(jsDir, '02-core.js')).href);
    const spawn = await import(pathToFileURL(join(jsDir, '04-spawn.js')).href);
    const playerMod = await import(pathToFileURL(join(jsDir, '07-player.js')).href);
    if (spawn.spawnYu4 && spawn.spawnAnvil && core.enemies && core.player) {
      key('p'); frames(5); key('p', false);
      elements.pauseHomeBtn.click(); frames(10);    // 从上一场景干净返回
      elements.startBtn.click(); frames(10);        // 开局（玩家就位）
      for (const [label, mk] of [['御4', spawn.spawnYu4], ['铁砧', spawn.spawnAnvil]]) {
        core.enemies.length = 0;
        if (core.pBullets) core.pBullets.length = 0;
        const e = mk.call(spawn, 1000);              // holdTimer 1000s：观察窗口内不进入离场
        if (!e || (label === '御4' ? e.type !== 'yu4' : e.type !== 'anvil')) {
          errors.push({ key: label + ' 生成失败', stack: label + ' spawn 未返回预期实体' });
          continue;
        }
        // 出生横位挪到玩家侧方（±200px）：避开玩家主炮竖直弹道，防止到位前被击毁导致摆程采样不全
        const Wb = core.canvas.width;
        e.x = Math.max(46, Math.min(Wb - 46, core.player.x + (label === '御4' ? -200 : 200)));
        // 每帧隔离：清他机 / 清敌弹 / 清我方弹（只验证到位悬停摆动）
        const isolate = () => {
          for (let i = core.enemies.length - 1; i >= 0; i--) if (core.enemies[i] !== e) core.enemies.splice(i, 1);
          if (playerMod.clearEnemyBullets) playerMod.clearEnemyBullets();
          if (core.pBullets) core.pBullets.length = 0;
        };
        let arrived = false, arriveDy = null, f = 0;
        for (; f < 240 && !arrived; f++) {
          if (core.pBullets) core.pBullets.length = 0;
          frames(1); isolate(); arrived = e.arrived;
        }
        if (!arrived) {
          errors.push({ key: label + ' 未到位', stack: '240 帧内 arrived=false（入场减速分支异常？）' });
          continue;
        }
        if (!core.enemies.includes(e) || e.hp <= 0) {
          errors.push({ key: label + ' 到位前损失', stack: '入场途中被击毁/移除（hp=' + e.hp + '），场景隔离不足' });
          continue;
        }
        arriveDy = e.y - e.hoverY;
        if (Math.abs(arriveDy) > 0.5) {
          errors.push({ key: label + ' 到位纵向不连续', stack: '到位瞬间 dy=' + arriveDy.toFixed(2) + 'px（应为 0）——位置连续性铁律' });
        }
        // 到位后跟踪 600 帧（≈10s，纵向周期 ≈5.2s，覆盖近 2 个往复）
        let minDy = 0, maxDy = 0, maxStep = 0, mismatch = 0, prevY = e.y;
        for (let k = 0; k < 600; k++) {
          if (core.pBullets) core.pBullets.length = 0;   // 帧前清弹：防止本帧内开火命中机体导致测量中断
          frames(1); isolate();
          // 位置公式复核：dy 应严格等于 hoverY 锚点上的缓入正弦（bobT/swayT 均为到位后起算）
          const st = Math.min(1, (e.swayT || 0) / 0.8);
          const sIn = st * st * (3 - 2 * st);
          const expDy = Math.sin((e.bobT || 0) * 1.2) * 10 * sIn;
          const dy = e.y - e.hoverY;
          if (Math.abs(dy - expDy) > 0.05) mismatch++;
          minDy = Math.min(minDy, dy);
          maxDy = Math.max(maxDy, dy);
          maxStep = Math.max(maxStep, Math.abs(e.y - prevY));
          prevY = e.y;
        }
        if (mismatch) {
          errors.push({ key: label + ' 纵向公式被改写', stack: '600 帧内 ' + mismatch + ' 帧 dy 偏离位置公式（有其他力抢写 e.y？）' });
        }
        if (maxDy < 8 || minDy > -8) {
          errors.push({ key: label + ' 纵向未上下往复', stack: '到位 10s 内 dy 区间 [' + minDy.toFixed(1) + ', ' + maxDy.toFixed(1) + ']（应达 ≈ ±10px）' });
        }
        if (Math.max(Math.abs(minDy), Math.abs(maxDy)) > 14) {
          errors.push({ key: label + ' 纵向摆幅过大', stack: 'dy 极值 |' + minDy.toFixed(1) + '/' + maxDy.toFixed(1) + '|（设计 ≈ 10px）' });
        }
        if (maxStep > 0.6) {
          errors.push({ key: label + ' 纵向存在瞬跳', stack: '到位后相邻帧最大纵向位移 ' + maxStep.toFixed(2) + 'px（>0.6px，理论上限 12px/s@60fps=0.2px）——速度曲线铁律' });
        }
        sample(label + ' 到位悬停纵向微摆跑帧');
      }
      key('p'); frames(5); key('p', false);
      elements.pauseHomeBtn.click(); frames(10);    // 返回主界面
    }
  }

  // 原石规则回归（2026-10-01 改版）：原石为萧杨专属技能充能——仅萧杨收集原石
  //（noteGachaStone 门控 hasPilot('xiaoyang')），每 16 颗充满一次「哦哦！抽卡！」（gachaReady）；
  // 已充满时继续捡不计数；按 Q（triggerPilotSkill）释放后清零重新累计——萧杨可无限次；
  // 非萧杨捡原石完全不计数（不再有"获得道具"环节，道具槽已取消）。
  if (isModules) {
    const core = await import(pathToFileURL(join(jsDir, '02-core.js')).href);
    const cfg = await import(pathToFileURL(join(jsDir, '01-config.js')).href);
    const playerMod = await import(pathToFileURL(join(jsDir, '07-player.js')).href);
    if (playerMod.noteGachaStone && playerMod.triggerPilotSkill && cfg.setPilotSub && cfg.PILOTS && cfg.rollCrystalGiant && cfg.currentPilotMain && core.state) {
      const st = core.state;
      const reset = () => { st.gachaStones = 0; st.gachaReady = false; };
      // ① 非萧杨（默认副驾驶员小艺）：捡原石完全不计数
      cfg.setPilotSub(cfg.PILOTS.xiaoyi);
      reset();
      for (let i = 0; i < 20; i++) playerMod.noteGachaStone();
      if (st.gachaStones !== 0 || st.gachaReady) {
        errors.push({ key: '非萧杨原石仍计数', stack: '20 颗后 gachaStones=' + st.gachaStones + ' gachaReady=' + st.gachaReady + '（预期 0 / false——原石仅萧杨收集）' });
      }
      // ② 萧杨：15 颗未满 → 满 16 停格 + gachaReady=true；已充满时继续捡不计数
      cfg.setPilotSub(cfg.PILOTS.xiaoyang);
      reset();
      for (let i = 0; i < 15; i++) playerMod.noteGachaStone();
      if (st.gachaStones !== 15 || st.gachaReady) {
        errors.push({ key: '原石计数异常', stack: '15 颗后 gachaStones=' + st.gachaStones + ' gachaReady=' + st.gachaReady + '（预期 15 / false）' });
      }
      playerMod.noteGachaStone();
      if (st.gachaStones !== 16 || !st.gachaReady) {
        errors.push({ key: '16 颗未充满', stack: 'gachaStones=' + st.gachaStones + ' gachaReady=' + st.gachaReady + '（预期 16 / true）' });
      }
      for (let i = 0; i < 5; i++) playerMod.noteGachaStone();
      if (st.gachaStones !== 16 || !st.gachaReady) {
        errors.push({ key: '充满期间原石仍计数', stack: 'gachaStones=' + st.gachaStones + '（预期 16 停格——已充满时不计数）' });
      }
      // ③ Q 释放：进入对局（resetGame 会先清零充能）→ 对局内充能 → triggerPilotSkill('q') 释放
      elements.startBtn.click(); frames(30);
      reset();
      for (let i = 0; i < 16; i++) playerMod.noteGachaStone();
      const fired = playerMod.triggerPilotSkill('q');
      if (!fired || st.gachaReady || st.gachaStones !== 0) {
        errors.push({ key: 'Q 释放失败', stack: 'triggerPilotSkill=' + fired + ' gachaReady=' + st.gachaReady + ' gachaStones=' + st.gachaStones + '（预期 true / false / 0）' });
      }
      if (fired && !st.gachaFx) {
        errors.push({ key: 'Q 释放无演出', stack: 'state.gachaFx 未建立（startGacha 未生效）' });
      }
      st.gachaFx = null;   // 演出状态复位（跳过 ≈4s 抽卡演出，不影响后续场景）
      // ④ 释放后重新累计：萧杨可无限次
      for (let i = 0; i < 16; i++) playerMod.noteGachaStone();
      if (!st.gachaReady || st.gachaStones !== 16) {
        errors.push({ key: '萧杨重复充能失败', stack: '释放后 16 颗 gachaReady=' + st.gachaReady + ' gachaStones=' + st.gachaStones + '（预期 true / 16——萧杨可无限次）' });
      }
      // ⑤ 萧杨转化概率（2026-10-01 新效果）：×1.5（相对 +50%），提升区间转出的原石按转化前档位计分（Math.random 桩控掷骰）
      // 大水晶 base=0.1 / 提升 0.15：0.05→基础区间转 giant 按 giant 分；0.11→提升区间转 giant 按 big 原档分；0.9→不转
      const savedMain = cfg.currentPilotMain;   // 导出值为当前主驾驶员对象（非函数）
      cfg.setPilotMain(cfg.PILOTS.keli);   // 主槽固定非萧杨，保证 hasPilot 仅由副槽驱动
      cfg.setPilotSub(cfg.PILOTS.xiaoyang);
      const origRandom = Math.random;
      const rollWith = (v) => { Math.random = () => v; const out = cfg.rollCrystalGiant('big'); Math.random = origRandom; return out; };
      const rBase = rollWith(0.05);
      if (rBase.tier2 !== 'giant' || rBase.val !== 720 || rBase.giant !== true) {
        errors.push({ key: '萧杨基础区间转化', stack: 'r=0.05 → ' + JSON.stringify(rBase) + '（预期 giant / 720 / true）' });
      }
      const rBoost = rollWith(0.11);
      if (rBoost.tier2 !== 'giant' || rBoost.val !== 360 || rBoost.giant !== true) {
        errors.push({ key: '萧杨提升区间未按原档计分', stack: 'r=0.11 → ' + JSON.stringify(rBoost) + '（预期 giant / 360 / true——提升 50% 部分不额外加分）' });
      }
      const rOut = rollWith(0.9);
      if (rOut.tier2 !== 'big' || rOut.val !== 360 || rOut.giant !== false) {
        errors.push({ key: '概率区间外误转化', stack: 'r=0.9 → ' + JSON.stringify(rOut) + '（预期 big / 360 / false）' });
      }
      cfg.setPilotSub(cfg.PILOTS.xiaoyi);
      const rNoXy = rollWith(0.11);
      if (rNoXy.tier2 !== 'big' || rNoXy.val !== 360) {
        errors.push({ key: '非萧杨概率不应提升', stack: 'r=0.11 非萧杨 → ' + JSON.stringify(rNoXy) + '（预期 big / 360——0.11 ≥ 0.1 不转化）' });
      }
      cfg.setPilotMain(savedMain);   // 还原主驾驶员
      key('p'); frames(5); key('p', false);
      elements.pauseHomeBtn.click(); frames(10);    // 返回主界面
      cfg.setPilotSub(cfg.PILOTS.xiaoyi);   // 还原默认副驾驶员
      reset();
      sample('原石规则 非萧杨不计数 / 16 颗充能 / Q 释放 / 萧杨无限次 / 转化概率 ×1.5 与原档计分');
    }
  }

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
