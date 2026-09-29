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
  key('r'); frames(60);                         // R 立即重开
  sample('暂停/恢复 + R 重开');

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
    key('r'); frames(120);                      // R 重开（resetGame 副武器初始冷却路径）
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
      key('r');                                     // R 重开：同步 resetGame（波次制字段归零）
      if (core.levelFlow.poemWaveIdx !== 0) {
        errors.push({ key: '诗篇波次制重开未归零', stack: 'R 重开后 poemWaveIdx=' + core.levelFlow.poemWaveIdx + '（resetGame 归零缺失？）' });
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
  // ② 技能序列（强制首技能 2 → 之后固定 1→2→3）：技能2 出双斩流 wgSlashes → 技能3 排入 scheduled 出弹幕 → 技能1 扇斩
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
        // ① 入场全程跟踪（预警 1s + 冲刺 ≈1s + 演出 0.6s ≈ 160 帧）
        let maxStep = 0, prev = null, sawArrive = false;
        for (let f = 0; f < 190 && !sawArrive; f++) {
          frames(1); isolate();
          if (prev) maxStep = Math.max(maxStep, Math.hypot(e.x - prev.x, e.y - prev.y));
          prev = { x: e.x, y: e.y };
          if (e.wgPhase >= 3) sawArrive = true;
        }
        if (!sawArrive) {
          errors.push({ key: '战争幽灵未抵达驻留', stack: '190 帧内未进入相位 3（wgPhase=' + e.wgPhase + '）' });
        }
        if (maxStep > 42) {
          errors.push({ key: '战争幽灵入场存在瞬跳', stack: '相邻帧最大位移 ' + maxStep.toFixed(1) + 'px（> 42px，巡航 1500px/s @60fps 上限余量）——速度曲线铁律' });
        }
        // ② 技能序列 2→3→1（间隔 2.2s）：≈1.2 + 1.3 + 2.2 + 1.1 + 2.2 + 0.8 ≈ 8.9s，给 640 帧余量
        let sawSlashes = false, sawBarrage = false, sawSkill1 = false;
        for (let f = 0; f < 640 && !(sawSlashes && sawBarrage && sawSkill1); f++) {
          frames(1);
          // 断言先于隔离：隔离会 clearEnemyBullets，弹幕存在性必须在清理前采样
          if (e.wgSkill && e.wgSkill.kind === 1) sawSkill1 = true;
          if (core.wgSlashes.length >= 2) sawSlashes = true;
          if (core.eBullets.some(b => b.owner === e)) sawBarrage = true;
          isolate();
        }
        if (!sawSlashes) errors.push({ key: '战争幽灵技能2未出斩击流', stack: '640 帧内 wgSlashes 未出现 ≥2 道（锁定后发射分支异常？）' });
        if (!sawBarrage) errors.push({ key: '战争幽灵技能3未出弹幕', stack: '640 帧内未见幽灵子弹（scheduled 排弹 / fire 分支内推进异常？）' });
        if (!sawSkill1) errors.push({ key: '战争幽灵技能1未施放', stack: '640 帧内未进入技能1（序列应 2→3→1）' });

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
