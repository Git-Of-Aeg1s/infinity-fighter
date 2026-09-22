// 02-core：画布与 DOM 引用 / 全局状态与实体数组 / 工具函数 / 星空星云

  // ─── 模块契约（并行修改请先读；npm run check 静态强制校验 import/export）───
  // 被依赖：03-audio(3 名) 04-spawn(8 名) 05-boss(13 名) 06-enemy(23 名) 07-player(13 名) 08-entities(13 名) 09-draw-ships(14 名) 10-draw-world(15 名) 11-draw-boss(9 名) 12-ui(55 名) 13-encyclopedia(15 名) 14-main(23 名)
  // 本文件写共享状态（state/bossFlow/levelFlow 属性赋值；新增属性先在 02-core 归域声明）：
  //   state.{shakeMag, shakeTime}
  //
  import { CANVAS_H, CANVAS_W, DOUZHI, PLAYER_CFG, STAR_COUNT, currentArmor, diffMods, invulnDiffMul } from './01-config.js';


  // ---------- DOM ----------
  const canvas = document.getElementById('game');
  let ctx = canvas.getContext('2d');   // 可在图鉴预览时临时切换到其它 canvas 上下文
  // 跨文件写 ctx 的唯一入口（图鉴预览 withPreviewCtx 使用）：ES modules 下导入绑定只读，写操作必须留在所有者模块内
  function setCtx(c) { ctx = c; }

  // 高 DPI 适配：按设备像素比放大画布内部分辨率，CSS 显示尺寸不变
  const DPR = window.devicePixelRatio || 1;
  canvas.width = CANVAS_W * DPR;
  canvas.height = CANVAS_H * DPR;
  ctx.scale(DPR, DPR);

  const hpFill = document.getElementById('hpFill');
  const scoreText = document.getElementById('scoreText');
  const bombIcons = document.getElementById('bombIcons');
  const livesText = document.getElementById('livesText');
  const berserkBar = document.getElementById('berserkBar');
  const berserkFill = document.getElementById('berserkFill');
  const shieldBar = document.getElementById('shieldBar');
  const shieldFill = document.getElementById('shieldFill');
  const douzhiBar = document.getElementById('douzhiBar');
  const douzhiFill = document.getElementById('douzhiFill');
  // 七日澜心（装甲技能）圆形计数表：右下角量表（12-ui updateHUD 渲染填充角度）
  const skillGauge = document.getElementById('skillGauge');
  const skillGaugeRing = document.getElementById('skillGaugeRing');

  const overlay = document.getElementById('overlay');
  const overlayTitle = document.getElementById('overlayTitle');
  const overlayDesc = document.getElementById('overlayDesc');
  const startBtn = document.getElementById('startBtn');
  const musicToggle = document.getElementById('musicToggle');
  // 主菜单（独立页面态）：idle 全屏显示、进入战斗隐藏；卡片构建与显隐见 12-ui
  const menuScreen = document.getElementById('menuScreen');
  const menuStartBtn = document.getElementById('menuStartBtn');
  const menuActions = document.getElementById('menuActions');
  const titleBar = document.querySelector('.title-bar');
  const planeGrid = document.getElementById('planeGrid');
  const diffGrid = document.getElementById('diffGrid');
  const diffLabel = document.getElementById('diffLabel');     // HUD 左上角当前难度标签
  const wingmanGrid = document.getElementById('wingmanGrid');
  const armorGrid = document.getElementById('armorGrid');
  const bossTestRow = document.getElementById('bossTestRow');
  const retrialBtn = document.getElementById('retrialBtn');   // 胜利结算页「再次挑战」（仅试炼/挑战模式显示）
  const gameoverHomeBtn = document.getElementById('gameoverHomeBtn');   // 失败结算页「返回主界面」
  const pauseHomeBtn = document.getElementById('pauseHomeBtn');
  const pauseRetryBtn = document.getElementById('pauseRetryBtn');

  // 怪物图鉴 DOM
  const encyclopedia = document.getElementById('encyclopedia');
  const encyTabs = document.getElementById('encyTabs');
  const encyList = document.getElementById('encyList');
  const encyDetail = document.getElementById('encyDetail');
  const encyClose = document.getElementById('encyClose');
  const encyDiffGroup = document.getElementById('encyDiffGroup');   // 图鉴头部快捷切换难度（三选一按钮组，见 13-encyclopedia）

  // 数值与机制图鉴 DOM
  const infoEntryBtn = document.getElementById('infoEntryBtn');
  const infoModal = document.getElementById('infoModal');
  const infoTabs = document.getElementById('infoTabs');
  const infoBody = document.getElementById('infoBody');
  const infoClose = document.getElementById('infoClose');

  // ---------- 状态 ----------
  // 并行修改约定：共享状态分三个域对象（state / bossFlow / levelFlow）。
  // 新增状态属性先归域、再在本文件声明；任何文件不得另立顶层 let 充当全局状态。
  // 属性可被多个文件读写（对象属性赋值在 ES modules 下同样合法），但每个属性应有单一「逻辑所有者」，
  // 所有者与写方汇总见各文件头部契约注释。
  const state = {
    mode: 'idle',      // idle | playing | gameover
    paused: false,
    score: 0,
    bombs: 1,
    lives: PLAYER_CFG.lives,
    time: 0,
    shakeTime: 0,
    shakeMag: 0,
    flash: 0,          // 全屏白闪强度（高能爆弹等触发；原 08-entities 顶层变量并入）
    hurt: 0,           // 受击红晕强度（命中玩家时叠加：14-main 衰减 / 10-draw-world 绘制屏幕边缘红晕）
    hasteT: 0,         // 斗志昂扬增益：我方攻速 / 弹道飞行速度翻倍的剩余时间（击毁斗志昂扬后 8s）
    orangeBombUsed: false, // 本场战斗橙色敌人爆弹是否已触发（整场最多一次；不影响 4类/BOSS 掉落）
    crystalMagnetMul: 1,   // 水晶磁吸半径倍率（击败第一个 BOSS 后永久 ×1.5，重开归 1）
    armorSkillGauge: 0,    // 装甲技能量表（0~1，七日澜心：收集水晶填充；按 F 满 1 时触发，见 07-player triggerArmorSkill）
    stormVortex: null, // 暴风之眼：涡流风旋（技能7 生成/清除：05-boss；清除：06-enemy / 11-draw-boss）
    testBoss: null,    // 测试模式：直接挑战的 BOSS id
    challenge: null,   // 图鉴挑战模式：{ kind:'enemy'|'boss', type, variant, behavior, bossId }，敌我真实血量（玩家血量归零自动重置）
    cheatArm: false,   // 武器等级作弊武装开关（按 0 置位；原先为运行时动态挂载的隐式属性）
    victoryOverlay: false, // 胜利结算页激活中（原 12-ui 顶层变量 victoryOverlayActive 并入）
  };

  // BOSS 流程状态机：stage none → wait(等清场) → warn(警报演出) → fight(BOSS战) → none
  const bossFlow = {
    stage: 'none',     // BOSS 流程：none | wait | warn | fight
    timer: 0,          // BOSS 登场倒计时（累计战斗时长）
    phase: 0,          // 关卡阶段索引：0=首段刷怪(50s)→旧日之歌；1=二段刷怪(40s)→暴风之眼
    pending: 'song',   // 即将登场的 BOSS id
    warnT: 0,          // 警报演出计时
    victoryDelay: 0,   // BOSS 击杀后延迟返回主界面
    defeatedName: '',  // 被击败的 BOSS 名称
    postDelay: 0,      // BOSS 击败后到恢复刷怪的缓冲（2s，不计入关卡推进）
    postWaveT: 0,      // BOSS 后固定首波（1类长队）刷出起 4s 观察期，结束后恢复正常刷怪（不计入关卡推进）
  };

  // 关卡与出怪节奏：level 由有效刷怪时间驱动；spawnTimer/waveSeq 驱动波次；capitalIdleT 驱动 4类槽位刷新
  const levelFlow = {
    level: 1,          // 当前关卡等级
    prevLevel: 1,      // 上一帧关卡等级：检测「关卡提升」以触发斗志昂扬 4% 出现
    spawnTimer: 0,     // 波次刷新倒计时
    waveSeq: 0,        // 波次序号：标记本波生成的敌人（特殊3类随波生成，同种限 1 见 04-spawn）
    lowPressureT: 0,   // 压力低于阈值累计时长（驱动刷新倒计时加速，回到阈值以上归零）
    capitalIdleT: 0,   // 4类槽位空闲累计时长（压力高于阈值时超过上限仍会强制刷新）
    jiaoxiang13Done: false, // 本局是否已触发 Lv13 后首次刷新必出焦香螺旋桨（一次性）
    douzhiSkipOnce: false, // 击败 BOSS 引发的阶段跳变升级：下一次「关卡提升」不召唤斗志昂扬（killEnemy 置位）
    bossMinionT: 0,        // 诗篇：BOSS 战期间 1类强制波次计时（resetGame 归零）
    bossMinionNext: 8,     // 诗篇：下一次 1类强制波次的间隔（rand 6~12，触发后重取）
  };

  const player = {
    x: CANVAS_W / 2,
    y: CANVAS_H - 90,
    w: PLAYER_CFG.w,
    h: PLAYER_CFG.h,
    hp: PLAYER_CFG.maxHp,
    maxHp: PLAYER_CFG.maxHp,   // 当前装甲下的每条命最大 HP（装甲 maxHpAdd 见 ARMORS / armorMaxHp）
    kbT: 0, kbVx: 0, kbVy: 0,   // 风暴风流/风柱命中的击退（短暂位移、快速衰减）
    cooldown: 0,
    invuln: 0,
    alive: true,
    weapon: 1,         // 火力等级 1~4
    berserkBanner: 0,  // “暴走”字样展示剩余时间（抵达 Lv5 时）
    wingSpread: 0,     // 机翼展开动画进度（0=收起, 1=完全展开）
    berserk: 0,        // 暴走（Lv5）剩余持续时间，归零回落 Lv4
    shield: 0,         // 量子护盾剩余时间
    crystalShield: 0,  // 七日澜心水晶护盾剩余时间（环绕水晶屏障：免伤 + 消解敌弹，消失清除 250px 内敌弹）
    bulwarkUsed: false, // 最终壁垒：本条命的一次性免死是否已消耗（resetGame / 重生重置）
    chixinBurnT: 0,    // 炽心：火环灼烧计时（每 0.125s 一跳）
    regenT: 0,         // 洄：回血计时（每 2.5s +1 HP）
    respawnTimer: 0,   // 掉命后重生倒计时
    hitCount: 0,       // 受击计数：统一累计 3 次掉一层火力（导弹命中不计入）
    hitFxT: 0,         // 受击闪白计时（damagePlayer 置位，updatePlayer 衰减，drawPlayer 读取）
    // 群星之杀（斩击武器）运行态：
    slashCd: 0,        // 距下次斩击的冷却（s）
    slashTarget: null, // 当前锁定光束选中的敌人引用（每帧刷新）
    slashQueued: 0,    // 暴走三连斩：待释放的剩余斩击次数
    slashGapT: 0,      // 暴走三连斩：距下一击的间隔计时
    bladeFlashT: 0,    // 双刃攻击闪光计时（doSlash 置位，updateStarslayer 衰减，paintStarslayer 读取）
    berserkSpread: 0,  // 暴走刃帆变形进度 0~1（updateStarslayer 驱动，paintStarslayer 读取）
  };

  /** @type {Array} */ const enemies = [];
  /** @type {Array} */ const pBullets = [];
  /** @type {Array} */ const eBullets = [];
  /** @type {Array} */ const trailGhosts = [];   // 暗紫轨迹残影（部件球弹幕：帧间线段留存渐隐）
  /** @type {Array} */ const particles = [];
  /** @type {Array} */ const powerups = [];
  /** @type {Array} */ const crystals = [];
  /** @type {Array} */ const missileWarns = [];   // 炮火先兆者导弹垂直预警线
  /** @type {Array} */ const missiles = [];       // 预警结束后从上方下落的导弹
  /** @type {Array} */ const blBombs = [];        // 暴鸰投出的炸弹（预警 → 低速下坠 → 极速加速 → 爆炸）
  /** @type {Array} */ const popianMissiles = [];  // 破片三连发导弹（高速、不可击毁、条件性无视无敌）
  /** @type {Array} */ const spellCubes = [];      // 法术矩阵发射的发光正方体（限程→减速黯淡→原位置停留→快速渐隐）
  /** @type {Array} */ const cubeHitFx = [];       // 法术矩阵正方体命中玩家的击中特效（白热闪核 + 红色冲击波环）
  /** @type {Array} */ const zoneMarks = [];      // 暴风之眼：白色区域标记（风流/风柱打击预警：风流约 1.1s / 风柱 1.3s）
  /** @type {Array} */ const windFlows = [];      // 标记到期后沿曲线呼啸而至的风流
  /** @type {Array} */ const pillarStrikes = [];  // 标记到期后降下的垂直风柱打击
  /** @type {Array} */ const stars = [];
  /** @type {Array} */ const wingmen = [];   // 僚机（成对，跟随主机两侧，不可被击中）
  /** @type {Array} */ const douzhiFx = [];  // 斗志昂扬死亡演出（脱离渐隐的蓝盒 / 淡黄扩大光环 / 快速渐隐的本体）
  /** @type {Array} */ const slashFx = [];   // 群星之杀：空间斩击特效（选中目标处展开的紫白斩痕，短暂存留渐隐）
  /** @type {Array} */ const playerHitFx = [];   // 命中玩家特效（白热闪核 + 红橙冲击环 + 迸溅火花线，短存留渐隐）
  /** @type {Array} */ const phaseFx = [];   // 碎盾特效（群星之杀斩碎虚化护盾：白热闪核 + 冰蓝冲击环 + 飞散弧形碎片）

  // 键盘输入状态：14-main 的监听器写入、07-player 等读取
  // （原 14-main 顶层变量移入：keys 是跨模块共享的输入状态，留在 14-main 会造成 07↔14 循环依赖，
  //   且 14-main 含启动期可执行代码，循环窗口内求值会引发 TDZ 运行时错误）
  const keys = Object.create(null);

  // ---------- 星空 ----------
  // 星星着色：多数蓝白，少量粉(#FFC0CB)/青(#39C5BB)，与星云雾霭共同营造"青粉丝域"
  const STAR_TINTS = [
    [200, 225, 255],   // 常规蓝白
    [255, 192, 203],   // 粉
    [120, 230, 220],   // 青
  ];

  function initStars() {
    stars.length = 0;
    for (let i = 0; i < STAR_COUNT; i++) {
      const roll = Math.random();
      const tint = roll < 0.76 ? 0 : (roll < 0.88 ? 1 : 2);   // 76% 蓝白 / 12% 粉 / 12% 青
      stars.push({
        x: Math.random() * CANVAS_W,
        y: Math.random() * CANVAS_H,
        z: Math.random() * 0.8 + 0.2,   // 视深度：影响速度与亮度
        tint,
      });
    }
  }

  function updateStars(dt) {
    for (const s of stars) {
      s.y += (30 + s.z * 140) * dt;
      if (s.y > CANVAS_H) {
        s.y = -2;
        s.x = Math.random() * CANVAS_W;
      }
    }
  }

  function drawStars() {
    for (const s of stars) {
      const a = 0.35 + s.z * 0.55;
      const [r, g, b] = STAR_TINTS[s.tint || 0];
      ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${a.toFixed(3)})`;
      const size = s.z > 0.7 ? 2 : 1;
      ctx.fillRect(s.x | 0, s.y | 0, size, size);
    }
  }

  // ---------- 星云（缓慢穿过背景的大块柔和光斑） ----------
  const NEBULA_COUNT = 4;
  const NEBULA_COLORS = [
    [255, 192, 203],   // #FFC0CB 粉色
    [57, 197, 187],    // #39C5BB 青绿
    [255, 182, 193],   // 偏暖粉
    [72, 210, 200],    // 偏亮青
  ];
  /** @type {Array} */ let nebulae = [];

  function makeNebula(startOffscreen) {
    const c = NEBULA_COLORS[Math.floor(Math.random() * NEBULA_COLORS.length)];
    return {
      x: rand(-60, CANVAS_W + 60),
      y: startOffscreen ? rand(-380, -120) : rand(-100, CANVAS_H + 100),
      r: rand(130, 320),             // 星云半径
      speed: rand(12, 32),           // 下漂速度（比星星慢很多）
      drift: rand(-8, 8),            // 横向微漂
      color: c,
      alpha: rand(0.16, 0.32),       // 提高不透明度：粉/青云雾在深蓝背景上清晰可见
      pulse: rand(0, Math.PI * 2),   // 呼吸相位
      pulseSpd: rand(0.3, 0.8),      // 呼吸速度
    };
  }

  function initNebulae() {
    nebulae = [];
    for (let i = 0; i < NEBULA_COUNT; i++) nebulae.push(makeNebula(false));
  }

  function updateNebulae(dt) {
    for (let i = 0; i < nebulae.length; i++) {
      const n = nebulae[i];
      n.y += n.speed * dt;
      n.x += n.drift * dt;
      n.pulse += n.pulseSpd * dt;
      // 完全移出屏幕下方后重生于顶部
      if (n.y - n.r > CANVAS_H + 50) {
        nebulae[i] = makeNebula(true);
      }
    }
  }

  function drawNebulae() {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';   // 叠加发光：粉/青云雾在深蓝背景上真正可见
    for (const n of nebulae) {
      const [r, g, b] = n.color;
      const breath = 1 + Math.sin(n.pulse) * 0.15;   // 呼吸缩放
      const rad = n.r * breath;
      const a = n.alpha * (0.8 + Math.sin(n.pulse) * 0.2);
      const grd = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, rad);
      grd.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${a.toFixed(4)})`);
      grd.addColorStop(0.4, `rgba(${r}, ${g}, ${b}, ${(a * 0.55).toFixed(4)})`);
      grd.addColorStop(0.75, `rgba(${r}, ${g}, ${b}, ${(a * 0.18).toFixed(4)})`);
      grd.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
      ctx.fillStyle = grd;
      ctx.fillRect(n.x - rad, n.y - rad, rad * 2, rad * 2);
    }
    ctx.restore();
  }

  // ---------- 工具 ----------
  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

  // 非BOSS敌机攻击间隔随机区间：按当前难度修正倍率缩放（具象：攻击间隔 +25%）
  // 消费方传入带 fireInterval: [min, max] 的配置对象（ENEMY_TYPES 各类 / POPIAN / FASHI_* 等）
  function enemyFireIv(cfg) {
    const m = diffMods().enemyFireIntervalMul != null ? diffMods().enemyFireIntervalMul : 1;
    return rand(cfg.fireInterval[0] * m, cfg.fireInterval[1] * m);
  }

  // 敌机是否与屏幕可见区域相交（碰撞盒 vs 可视画布）——完全在屏幕外的敌人不可被我方武器伤害。
  // 判定 = 碰撞盒与 [0, CANVAS_W] × [0, CANVAS_H] 有任一交叠（部分入屏即可受击）；
  // 尺寸一律取 CANVAS_W / CANVAS_H（未来 BOSS 战扩展屏幕时，只需让这两个常量跟随实际屏幕，此处自动生效）
  function enemyOnScreen(e) {
    return e.x + e.w / 2 > 0 && e.x - e.w / 2 < CANVAS_W &&
           e.y + e.h / 2 > 0 && e.y - e.h / 2 < CANVAS_H;
  }

  // 斗志昂扬增益倍率：击毁后 8s 内我方攻速 / 弹道飞行速度翻倍（hasteT > 0 时返回 2，否则 1）
  function hasteMul() { return state.hasteT > 0 ? DOUZHI.buffMul : 1; }

  // 按权重从池中随机取一个 id（weights 缺失的 id 视为 1）——BOSS 技能加权随机用
  function weightedPick(pool, weights) {
    let total = 0;
    for (const id of pool) total += (weights[id] != null ? weights[id] : 1);
    let r = Math.random() * total;
    for (const id of pool) {
      r -= (weights[id] != null ? weights[id] : 1);
      if (r <= 0) return id;
    }
    return pool[pool.length - 1];
  }

  function spawnParticles(x, y, color, count = 14, speed = 180) {
    for (let i = 0; i < count; i++) {
      const ang = Math.random() * Math.PI * 2;
      const sp = rand(speed * 0.3, speed);
      particles.push({
        x, y,
        vx: Math.cos(ang) * sp,
        vy: Math.sin(ang) * sp,
        life: rand(0.3, 0.7),
        age: 0,
        color,
        size: rand(1.5, 3.5),
      });
    }
  }

  function shake(mag = 6, time = 0.25) {
    state.shakeMag = Math.max(state.shakeMag, mag);
    state.shakeTime = Math.max(state.shakeTime, time);
  }

  // ---------- 装甲共享辅助（02-core 持有 eBullets/player，避免 06↔07 循环依赖） ----------

  // 清除 (x, y) 半径 radius 内的所有敌方子弹（最终壁垒免死 / 七日澜心护盾消失共用）
  function clearEnemyBulletsNear(x, y, radius) {
    for (let i = eBullets.length - 1; i >= 0; i--) {
      const b = eBullets[i];
      if (Math.hypot(b.x - x, b.y - y) <= radius) {
        spawnParticles(b.x, b.y, '#9be7ff', 3, 80);
        eBullets.splice(i, 1);
      }
    }
  }

  // 清除离 (x, y) 最近的一颗敌方子弹（群星守望：击杀敌人按概率触发）
  function clearNearestEnemyBullet(x, y) {
    let best = -1, bestD = Infinity;
    for (let k = 0; k < eBullets.length; k++) {
      const d = Math.hypot(eBullets[k].x - x, eBullets[k].y - y);
      if (d < bestD) { bestD = d; best = k; }
    }
    if (best >= 0) {
      const b = eBullets[best];
      spawnParticles(b.x, b.y, '#7ce7ff', 6, 140);
      eBullets.splice(best, 1);
    }
  }

  // 最终壁垒：每条命一次的免死判定——致死伤害改为存活（同样生效于导弹等强制击杀路径）。
  // 恢复 1 点生命、获得 3s 无敌（受 invulnDiffMul 难度倍率影响）、清除周围 250px 内的所有子弹。
  // 返回 true = 本次免死已消耗；调用方（damagePlayer / 06-enemy BOSS 持续接触）在 hp <= 0 分支优先调用。
  function tryBulwarkCheatDeath() {
    if (currentArmor.id !== 'bulwark' || player.bulwarkUsed) return false;
    player.bulwarkUsed = true;
    player.hp = 1;
    player.invuln = 3 * invulnDiffMul();
    player.invulnBlink = true;
    clearEnemyBulletsNear(player.x, player.y, 250);
    spawnParticles(player.x, player.y, '#ffb545', 26, 260);
    shake(6, 0.3);
    return true;
  }

  export {
    canvas, ctx, setCtx, DPR, hpFill, scoreText,
    bombIcons, livesText, berserkBar, berserkFill, shieldBar, shieldFill,
    douzhiBar, douzhiFill, skillGauge, skillGaugeRing,
    overlay, overlayTitle, overlayDesc, startBtn,
    musicToggle, menuScreen, menuStartBtn, menuActions, titleBar,
    planeGrid, diffGrid, diffLabel,
    wingmanGrid, armorGrid, bossTestRow,
    retrialBtn, gameoverHomeBtn, pauseHomeBtn, pauseRetryBtn, encyclopedia, encyTabs, encyList,
    encyDiffGroup,
    encyDetail, encyClose, infoEntryBtn, infoModal, infoTabs, infoBody,
    infoClose, state, bossFlow, levelFlow, player, enemies,
    pBullets, eBullets, trailGhosts, particles, powerups, crystals,
    missileWarns, missiles, blBombs, popianMissiles, spellCubes, cubeHitFx,
    zoneMarks, windFlows, pillarStrikes, stars, wingmen, douzhiFx,
    slashFx, playerHitFx, phaseFx, keys, STAR_TINTS, initStars, updateStars, drawStars,
    NEBULA_COUNT, NEBULA_COLORS, nebulae, makeNebula, initNebulae, updateNebulae,
    drawNebulae, rand, clamp, enemyOnScreen, hasteMul, weightedPick, spawnParticles,
    enemyFireIv,
    clearEnemyBulletsNear, clearNearestEnemyBullet, tryBulwarkCheatDeath,
    shake,
  };