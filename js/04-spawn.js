  // 2类变体出现权重：按关卡分档直接取值（Lv1~10 / Lv11~20，与「数值与机制图鉴-怪物权重」单一数据源同步）

  // ─── 模块契约（并行修改请先读；npm run check 静态强制校验 import/export）───
  // 被依赖：05-boss(2 名) 06-enemy(4 名) 07-player(2 名) 08-entities(1 名) 13-encyclopedia(13 名) 14-main(12 名)
  // 本文件写共享状态（state/bossFlow/levelFlow 属性赋值；新增属性先在 02-core 归域声明）：
  //   levelFlow.{waveSeq}  bossFlow.{stage, warnT}
  //
  import { ANVIL, BOSS_SPAWN_EARLY, BOSS_WARN_TOTAL, CANVAS_H, CANVAS_W, DUSK, ENEMY_TYPES, FASHI_A1, FASHI_A2, FASHI_ARRAY, FASHI_MATRIX, HANSHUANG, HARBINGER, isShipian, JIAOXIANG, PHASE_CHANCE, PHASE_DURATION, PLAYER_CFG, POPIAN, PRESSURE_W, SIDE_BEHAVIOR_COLORS, SIDE_KAMIKAZE_SCORE, SIDE_MOON, SIDE_SPAWN_W, SIDE_SCORE, SIDE_SHOOT_HP, STORM_SHIP, TEST_HP_CLASS1, TEST_HP_CLASS234, VARIANTS, WEILONG, YU4, currentArmor, diffMods } from './01-config.js';
  import { bossFlow, clamp, enemies, levelFlow, player, rand, shake, state } from './02-core.js';
  import { startAlarm, stopAlarm } from './03-audio.js';
  import { spawnBoss, spawnStormGhost } from './05-boss.js';
  import { clearMissiles } from './06-enemy.js';
  import { clearEnemyBullets } from './07-player.js';
  import { collectAllItems } from './08-entities.js';

  // 返回 [{ id, w }]，w 为原始权重（pickVariant 内按总和归一）——与「数值与机制图鉴」共用
  const STRIKER_VARIANT_TIERS = {
    low:  { crimson: 30, amber: 30, azure: 25, white: 20, dusk: 2 },   // Lv1~10
    high: { crimson: 10, amber: 10, azure: 10, white: 5, dusk: 5 },    // Lv11~20
  };
  function strikerVariantWeights(lv) {
    const tier = lv < 11 ? STRIKER_VARIANT_TIERS.low : STRIKER_VARIANT_TIERS.high;
    return VARIANTS.striker.map(v => ({ id: v.id, w: tier[v.id] }));
  }

  // 非BOSS敌人首攻延迟的难度加成（具象：初始攻击间隔 +0.5~1.8s）——
  // mods.enemyFirstFireAdd 为 [min, max] 秒区间（rand 取值）或固定秒数，0/缺省 = 不加；
  // 覆盖全部非BOSS敌人：makeEnemy 的 fireTimer 与不走 fireTimer 的状态机型（法术大师A1/A2 的 firstAt、破片的 atkT）
  function firstFireAdd() {
    const a = diffMods().enemyFirstFireAdd;
    if (!a) return 0;
    return Array.isArray(a) ? rand(a[0], a[1]) : a;
  }

  // 按权重随机选取变体
  // 幽暮突击艇出现率按关卡调整：Lv11 前为基础权重（12%）的 10%，Lv11 起为 40%；
  // 缩减的概率按比例摊给其余变体，保证幽暮出现率精确达标
  function pickVariant(type) {
    if (type === 'striker') {
      // 分档原始权重（Lv1~10 / Lv11~20），按总和归一后抽取
      const ws = strikerVariantWeights(levelFlow.level);
      const total = ws.reduce((s, it) => s + it.w, 0);
      let r = Math.random() * total;
      for (const it of ws) {
        r -= it.w;
        if (r <= 0) return VARIANTS.striker.find(v => v.id === it.id);
      }
      return VARIANTS.striker[0];
    }
    const list = VARIANTS[type];
    // 4类主力舰：变体权重按关卡分档（Lv1~10 wLow / Lv11~20 wHigh）
    const wk = type === 'capital' ? (levelFlow.level < 11 ? 'wLow' : 'wHigh') : 'weight';
    const total = list.reduce((s, v) => s + v[wk], 0);
    let r = Math.random() * total;
    for (const v of list) {
      r -= v[wk];
      if (r <= 0) return v;
    }
    return list[0];
  }


﻿// 04-spawn：敌机工厂 / 编队与波次 / 场面压力刷新 / 特殊敌人生成 / 图鉴挑战模式

  // ---------- 敌机 ----------
  /**
   * 创建敌机。behavior / variant.skill 决定移动 / 开火模式：
   *   side:     'pass'无攻击斜插 | 'shoot'追踪射击 | 'kamikaze'亡语垂直射击
   *   striker:  变体技能 crimson/straight(直射±10°、首发+1s) | amber/spread(前方双弹) | azure/homing(追踪、首发+1s、概率虚化护盾) | white/silent(不开火、到位停 2s)
   *   gunship:  pattern 0扇形 / 1环形 / 2双连炮 循环
   *   capital:  pattern 0双臂螺旋 / 1九连扇形齐射 / 2环形爆发 循环
   */
  function makeEnemy(type, x, y, opts = {}) {
    const cfg = ENEMY_TYPES[type];
    const diff = diffMods();
    // 血量难度倍率（具象：所有非BOSS怪物血量 -20%）；不再有关卡血量加成
    const hpMul = diff.enemyHpMul != null ? diff.enemyHpMul : 1;
    // 首次攻击延迟难度加成（具象：所有非BOSS怪物初始攻击间隔 +0.5~1.8s，见 firstFireAdd）
    const ffa = firstFireAdd();
    // 2/3/4 类选取变体（不同颜色 + 不同技能）；opts.variant 可强制指定（图鉴挑战用）
    const variant = (type === 'striker' || type === 'gunship' || type === 'capital')
      ? (opts.variant ? (VARIANTS[type].find(v => v.id === opts.variant) || pickVariant(type)) : pickVariant(type))
      : null;
    // 初次发射延迟：优先取调用方 fireTimer；否则用变体专属首射（如炮艇三变体），再回落 cfg.firstFire / fireInterval
    const firstFire = (variant && variant.firstFire) || cfg.firstFire;
    let initFire = opts.fireTimer != null ? opts.fireTimer
      : firstFire ? rand(firstFire[0], firstFire[1])
      : rand(cfg.fireInterval[0], cfg.fireInterval[1]);
    if (variant && variant.firstDelay) initFire += Array.isArray(variant.firstDelay) ? rand(variant.firstDelay[0], variant.firstDelay[1]) : variant.firstDelay;
    initFire += ffa;
    const e = {
      type,
      x, y,
      w: cfg.w, h: cfg.h,
      hp: cfg.hp * hpMul,
      maxHp: cfg.hp * hpMul,
      vx: 0, vy: 0,
      // 1类依行为上色（pass/shoot/kamikaze）；2/3/4类依变体上色；其余用默认色
      color: type === 'side'
        ? (SIDE_BEHAVIOR_COLORS[opts.behavior] || cfg.color)
        : (variant ? variant.color : cfg.color),
      variant: variant ? variant.id : null,
      skill: variant ? variant.skill : null,
      phase: 0,          // >0 时虚化：不受伤害，炮弹穿过、可打到后面的敌人
      shielded: false,   // 蓝色4类：是否带护盾
      score: cfg.score,
      wobble: Math.random() * Math.PI * 2,
      behavior: opts.behavior || 'pass',
      hoverY: opts.hoverY || 0,
      arrived: false,
      holdTimer: opts.holdTimer || 0,   // striker 短暂停顿 / gunship・capital 悬停时长
      speedMul: opts.speedMul != null ? opts.speedMul : 1,   // 移动/下落速度倍率（特殊编队用）
      staticX: opts.staticX || false,   // 悬停期间固定水平位置、不左右巡航（BOSS 召唤的先兆者用）
      fireTimer: initFire,
      pattern: 0,
      burst: null,       // 多发连射状态（螺旋 / 双连炮）
      burstTimer: 0,
      scheduled: [],     // 定时子射击队列（{ t, fn }）：双侧弹幕 / 多轮齐射 / 第二波等
      deathShot: opts.deathShot || false,
      escortTimer: 0,    // 仅 capital：周期召唤护航
      leaving: false,        // 停留结束后停止攻击、以进场速度前开走
      chargeT: 0,            // 仅 harbinger：红/灰充能循环计时
      chargeWave: 0,         // 仅 harbinger：充能波序号（0=首波 1.5s红+3s灰；≥1=后续波 2s红+1s复位+1.5s灰）
      firedThisCycle: false, // 仅 harbinger：本轮是否已召唤导弹
      missilesGuided: 0,     // 仅 harbinger：已导引导弹数（上限 5）
    };
    // 变体血量覆盖（炮艇三变体独立血量 350/350/400 覆盖注册表基准；幽暮的血量在其后单独处理）
    if (variant && variant.hp != null) e.hp = e.maxHp = variant.hp * hpMul;
    // 1类行为数值修正：黄芒（shoot）血量 10；分数 白影/增生/黄芒/赤月 50、紫电（kamikaze）80
    if (type === 'side') {
      if (e.behavior === 'shoot') e.hp = e.maxHp = SIDE_SHOOT_HP * hpMul;
      e.score = e.behavior === 'kamikaze' ? SIDE_KAMIKAZE_SCORE : SIDE_SCORE;
    } else if (type === 'prolifera') {
      e.score = SIDE_SCORE;
    }
    // 诗篇：暴风之眼技能2 召唤的大型龙卷血量 6000（真我基准 3200）
    if (type === 'tornado' && isShipian()) e.hp = e.maxHp = STORM_SHIP.s2.hp;
    // 测试模式：敌方不再无敌 —— 按 1~4 类统一血量（1类 4000 / 2~4类 10000；BOSS 保持注册表血量）
    if (state.challenge && type !== 'boss') {
      const testHp = (type === 'side' || type === 'prolifera' || type === 'escort') ? TEST_HP_CLASS1 : TEST_HP_CLASS234;
      e.hp = e.maxHp = testHp;
    }
    // 2类变体移动数据：入位速度 / 冲锋基准（冲锋 = charge + (关卡-1)×5）与前锋停留线（y 200~240 逐架随机；幽暮走独立状态机不适用）
    if (type === 'striker' && variant) {
      if (variant.entry != null) e.entrySpd = variant.entry;
      if (variant.charge != null) e.chargeBase = variant.charge;
      if (variant.id !== 'dusk') e.holdY = rand(200, 240);
    }
    // 蓝色4类(capital azure)：出现时 20% 概率带护盾，前 5s 虚化不会受伤
    if (type === 'capital' && variant && variant.id === 'azure' && Math.random() < PHASE_CHANCE) {
      e.shielded = true;
      e.phase = PHASE_DURATION;
    }
    // 赤金主力舰(capital crgold)：旋转双环 ×2 —— 技能「金环扩散」每施放消耗一枚，全场最多两次
    if (type === 'capital' && variant && variant.id === 'crgold') {
      e.ringsLeft = 2;
      e.ringT = 0;        // 双环显现计时（机翼展开完成后渐显）
      e.crgoldHold = 0;   // 技能3 停移倒计时
    }
    // 幽蓝2类(striker azure)：登场 10% 概率 1s 虚化护盾、10% 概率 2s 虚化护盾（复用 e.phase 通用虚化机制）
    if (type === 'striker' && variant && variant.id === 'azure') {
      const sr = Math.random();
      if (sr < 0.10) { e.shielded = true; e.phase = 1; }
      else if (sr < 0.20) { e.shielded = true; e.phase = 2; }
    }
    // 霜白(silent)：不停留——到位后立刻冲锋（挑战模式永驻除外）；幽蓝(azure)：编队内停留压缩为 0.4~1s（前锋线 4~8s 不变）
    if (variant && variant.skill === 'silent' && e.holdTimer !== 1e9) e.holdTimer = 0;
    if (variant && variant.id === 'azure' && e.holdTimer > 0 && e.holdTimer < 4) e.holdTimer = rand(0.4, 1);
    // 幽暮2类(striker dusk)：生命值 64；忽略编队入场点，改为在落点（场地 30%~80% 高度随机位置）正上方浮现，
    // 渐显后下移落点停驻、环射、渐隐离场 —— 状态机见 updateEnemyMovement 的 dusk 分支
    if (type === 'striker' && variant && variant.id === 'dusk') {
      e.hp = e.maxHp = DUSK.hp * hpMul;
      e.duskTY = rand(CANVAS_H * 0.30, CANVAS_H * 0.80);   // 落点高度（从上往下 30%~80%）
      e.x = rand(60, CANVAS_W - 60);                        // 落点水平位置（随机）
      e.y = e.duskTY - DUSK.shift;                          // 浮现点：落点正上方 shift 距离
      e.duskSY = e.y;
      e.duskPhase = 0;   // 0 渐显浮现 / 1 下移落点 / 2 瞄准停顿（末尾开火）/ 4 渐隐离场（发射一轮即走）
      e.duskT = 0;       // 当前阶段计时
      e.duskFade = 0;    // 当前透明度（浮现 0→1，离场 1→0，绘制时乘到 globalAlpha）
      e.duskN = 0;       // 环射弹数（开火时随机 6 或 8）
      e.duskBaseA = 0;   // 环射基准方向角（开火时随机）
    }
    // 黄色1类（shoot）：入场 1.2~2.8s 后首攻（每架独立随机），整场只攻击一次
    if (type === 'side' && e.behavior === 'shoot') {
      e.fireTimer = rand(1.2, 2.8);
    }
    // 赤月侧翼艇（红色 1类）：入场 1~2.5s 后随机时刻向顶角方向（航向正前方）发射一枚子弹，仅此一次；
    // 未发射即被击毁时另有 12% 概率亡语补射（见 killEnemy）
    if (type === 'side' && e.behavior === 'moon') {
      e.moonFireT = rand(SIDE_MOON.fireDelay[0], SIDE_MOON.fireDelay[1]);
      e.moonFired = false;
    }
    // 卫护飞船（增生侧翼艇衍生）：出厂随机虚化护盾 —— 80% 不带盾 / 15% 0.1s / 4% 0.15s / 1% 0.25s
    if (type === 'escort') {
      const pr = Math.random();
      if (pr < 0.15) { e.shielded = true; e.phase = 0.1; }
      else if (pr < 0.19) { e.shielded = true; e.phase = 0.15; }
      else if (pr < 0.20) { e.shielded = true; e.phase = 0.25; }
    }
    // 暴鸰（自爆无人机）：0 巡航下压 / 1 停车锁定（预警倒计时）/ 2 投弹后原地停留 / 3 继续俯冲
    if (type === 'baoling') {
      e.blPhase = 0;
      e.blT = 0;           // 登场计时（armDelay 后才具备投弹判定）
      e.blThrown = false;  // 炸弹是否已脱离（未脱离时被击毁 → 原地爆炸）
      e.blWarn = null;     // 停车锁定阶段的预警区 { tx, ty, t }
      e.blWaitT = 0;       // 投弹后停留计时
    }
    // 斗志昂扬（增益无人机）：横向匀速穿越 + 余弦上下浮动；dirX/baseY/cosPhase 由 spawnDouzhi 按出场侧设定
    if (type === 'douzhi') {
      e.dirX = 1;          // 横穿方向（1=左→右 / -1=右→左）
      e.baseY = y;         // 余弦轨迹基准高度
      e.cosPhase = 0;      // 上下浮动相位
    }
    enemies.push(e);
    return e;
  }
  
  // 1类混合权重按关卡分档：Lv1~10 / Lv11~20 两档（SIDE_SPAWN_W，与「数值与机制图鉴」同步）
  function sideSpawnWeights(lv) { return lv < 11 ? SIDE_SPAWN_W.low : SIDE_SPAWN_W.high; }

  // 1类混合权重抽取：按关卡档位取权重（low：白影70/增生5/黄芒15/紫电5/赤月20；high：60/10/20/10/25）
  // exclude：排除特定类别（如 BOSS 后固定首波不含紫电）
  function pickSideSpawn(exclude) {
    const W = sideSpawnWeights(levelFlow.level);
    let total = 0;
    const pool = [];
    for (const k in W) {
      if (exclude && exclude.includes(k)) continue;
      pool.push(k); total += W[k];
    }
    let r = Math.random() * total;
    for (const k of pool) { r -= W[k]; if (r <= 0) return k; }
    return pool[0];
  }

  // 1类单位统一入口：kind 由 pickSideSpawn 按权重抽取（白影/增生/黄芒/紫电/赤月），调用方也可强制指定（紫自爆流）
  function spawnSideUnit(x, y, vel, kind, fireTimer) {
    const e = kind === 'prolifera'
      ? makeEnemy('prolifera', x, y, { fireTimer })
      : makeEnemy('side', x, y, { behavior: kind, deathShot: kind === 'kamikaze', fireTimer });
    e._sideVel = vel;
    return e;
  }

  // 1类：从场地中部略偏上的两侧斜插窜出，最少 3 个一组；编队形态随机（纵队/斜线/横排梯队/V字），一碰就碎
  // 行为概率：shoot 10% / kamikaze 20% / pass 70%；速度基值已降 40%（×0.6），实际速度另乘 SIDE_SPEED_MUL；整组同速以保持队形
  function spawnSideGroup() {
    const fromLeft = Math.random() < 0.5;
    const dirX = fromLeft ? 1 : -1;
    const n = 3 + Math.floor(Math.random() * 3);    // 3~5 架（最少三个一组）
    const vx = dirX * rand(90, 120);                // 原 150~200 × 0.6（另乘 SIDE_SPEED_MUL）
    const vy = rand(54, 84);                         // 原 90~140 × 0.6（另乘 SIDE_SPEED_MUL）
    const edgeX = fromLeft ? -36 : CANVAS_W + 36;   // 屏幕侧外入场
    const baseY = rand(CANVAS_H * 0.35, CANVAS_H * 0.45);   // 入场基准高度：场地中部略偏上（两侧窜出）
    const formation = Math.floor(Math.random() * 4); // 0 纵队 / 1 斜线 / 2 横排梯队 / 3 V 字
    const mid = (n - 1) / 2;
    for (let k = 0; k < n; k++) {
      let x, y;
      if (formation === 0) {
        // 纵队（排成队）：沿行进反方向排成一列，前后跟随
        x = edgeX - dirX * k * 50;
        y = baseY - k * 6;
      } else if (formation === 1) {
        // 斜线队：队尾依次靠外、靠上
        x = edgeX - dirX * k * 46;
        y = baseY - k * 30;
      } else if (formation === 2) {
        // 横排梯队：近乎并排、上下大幅错开
        x = edgeX - dirX * k * 18;
        y = baseY - k * 44;
      } else {
        // V 字/箭头：中间领先（顶点在最前），两侧沿竖直方向对称后掠张开——
        // 用有符号偏移让中心对称的两架分到上(-)/下(+)两臂，避免旧 |k-mid| 使二者 x、y 完全相同而像素级重叠
        const rel = k - mid;                 // 有符号：前半为负、后半为正
        const d = Math.abs(rel);             // 距中心档数（越大越靠后）
        const sgn = rel < 0 ? -1 : 1;        // 分到上(-)/下(+)两臂
        x = edgeX - dirX * d * 46;           // 沿行进反方向后掠
        y = baseY + sgn * d * 38;            // 两臂上下张开，形成 V/箭头
      }
      const r = Math.random();
      const behavior = pickSideSpawn();
      spawnSideUnit(x, y, { vx, vy }, behavior, rand(0.8, 1.6));
    }
  }
  
  // 2类：从上方入场，在指定位置停留4~8s后再向下冲锋（固定 2 架，「22」）
  function spawnStrikerGroup() {
    const n = 2;
    const vShape = Math.random() < 0.4;
    const gap = 72;
    const x0 = rand(70, CANVAS_W - 70 - (n - 1) * gap);
    for (let k = 0; k < n; k++) {
      const x = x0 + k * gap;
      const y = vShape ? -50 - Math.abs(k - (n - 1) / 2) * 40 : -50 - k * 16;
      if (rollFashiA1()) spawnFashiA1(x, y);
      else if (rollPopian()) spawnPopian(x, y);
      else if (rollFashiMatrix()) spawnFashiMatrix(x, y);
      else makeEnemy('striker', x, y, {
        behavior: Math.random() < 0.25 ? 'track' : 'straight',
        holdTimer: rand(4, 8),   // 前锋线停留 4~8s 后冲锋
      });
    }
  }
  
  // 特殊编队：左右对称的 232232 横排（两个 3 稍慢）
  function spawnMirrorRow() {
    const seq = [2, 3, 2, 2, 3, 2];   // 回文对称
    const gap = 70;
    const x0 = (CANVAS_W - (seq.length - 1) * gap) / 2;
    for (let k = 0; k < seq.length; k++) {
      const x = x0 + k * gap;
      if (seq[k] === 2) {
        if (rollFashiA1()) spawnFashiA1(x, -50);
        else if (rollPopian()) spawnPopian(x, -50);
        else if (rollFashiMatrix()) spawnFashiMatrix(x, -50);
        else makeEnemy('striker', x, -50, {
          behavior: Math.random() < 0.25 ? 'track' : 'straight',
          holdTimer: rand(1, 4),
        });
      } else {
        // 3 类稍慢一点
        makeEnemy('gunship', x, -60, {
          hoverY: rand(120, 165),
          holdTimer: 30,
          speedMul: 0.6,
        });
      }
    }
  }

  // 特殊编队：1类长队从一侧斜扫到较靠下的另一侧（左右对称交叉）
  function spawnSideSweep() {
    const count = 6 + Math.floor(Math.random() * 3);   // 每队 6~8
    const gap = 46;                                    // 队列沿行进反方向排开
    const startY = CANVAS_H * 0.40;                    // 入场高度：场地中部略偏上（两侧窜出）
    for (const fromLeft of [true, false]) {
      const dirX = fromLeft ? 1 : -1;                  // 横向穿越方向
      const vx = dirX * rand(99, 117);                  // 原 165~195 × 0.6（另乘 SIDE_SPEED_MUL），从一边扫向另一边
      const vy = rand(54, 69);                           // 原 90~115 × 0.6（另乘 SIDE_SPEED_MUL），同时下沉
      const edgeX = fromLeft ? -30 : CANVAS_W + 30;    // 屏幕侧外入场
      for (let k = 0; k < count; k++) {
        const r = Math.random();
        const behavior = pickSideSpawn();
        // 后方跟随：队尾更靠外、更高，形成长队斜线
        const x = edgeX - dirX * k * gap;
        const y = startY - k * gap * 0.55;
        spawnSideUnit(x, y, { vx, vy }, behavior, rand(0.8, 1.6));
      }
    }
  }

  // 特殊编队：左右两侧各依次出来七个 1 类（紫电 kamikaze 自爆为主，本波 30%~60% 替换为白影无攻击 1类），
  // 成纵列斜扫穿越（紫=亡语向下垂直射一发；白=无攻击）
  function spawnSideKamikazeStream() {
    const count = 7;
    const gap = 64;                                    // 队列间距：保证依次入场
    const startY = CANVAS_H * 0.40;                    // 入场高度：场地中部略偏上（两侧窜出）
    const whiteRatio = rand(0.40, 0.60);               // 本波白影替换比例 40%~60%（每架独立判定）
    for (const fromLeft of [true, false]) {
      const dirX = fromLeft ? 1 : -1;
      const vx = dirX * rand(99, 117);                 // 与侧翼斜扫同速（基值 ×0.6，另乘 SIDE_SPEED_MUL）
      const vy = rand(54, 69);
      const edgeX = fromLeft ? -30 : CANVAS_W + 30;
      for (let k = 0; k < count; k++) {
        // 后方跟随：队尾更靠外、更高，形成长队斜线依次入场
        const x = edgeX - dirX * k * gap;
        const y = startY - k * gap * 0.55;
        const white = Math.random() < whiteRatio;      // 白影 1类：无攻击、无亡语
        spawnSideUnit(x, y, { vx, vy }, white ? 'pass' : 'kamikaze', rand(0.8, 1.6));
      }
    }
  }

  // 对称编队：2类组成箭头/V 字，从上方对称俯冲
  function spawnStrikerVee() {
    const cx = CANVAS_W / 2;
    if (rollFashiA1()) spawnFashiA1(cx, -46);
    else if (rollPopian()) spawnPopian(cx, -46);
    else if (rollFashiMatrix()) spawnFashiMatrix(cx, -46);
    else makeEnemy('striker', cx, -46, { behavior: 'track', holdTimer: rand(0.4, 0.7) });   // 顶点
    const pairs = 3;
    for (let k = 1; k <= pairs; k++) {
      const dx = k * 56;
      const y = -46 - k * 42;                          // 逐级滞后 → V 字
      for (const sx of [-1, 1]) {
        if (rollFashiA1()) spawnFashiA1(cx + sx * dx, y);
        else if (rollPopian()) spawnPopian(cx + sx * dx, y);
        else if (rollFashiMatrix()) spawnFashiMatrix(cx + sx * dx, y);
        else makeEnemy('striker', cx + sx * dx, y, {
          behavior: Math.random() < 0.25 ? 'track' : 'straight',
          holdTimer: rand(1, 4),
        });
      }
    }
  }

  // 对称编队：左右各一艘 3类炮艇压阵，中间 2类护航
  function spawnGunshipWings() {
    for (const sx of [-1, 1]) {
      const x = CANVAS_W / 2 + sx * 150;
      makeEnemy('gunship', x, -60, {
        hoverY: rand(115, 160),
        holdTimer: 30,
      });
    }
    for (let k = -1; k <= 1; k++) {
      const sx = CANVAS_W / 2 + k * 60;
      if (rollFashiA1()) spawnFashiA1(sx, -50);
      else if (rollPopian()) spawnPopian(sx, -50);
      else if (rollFashiMatrix()) spawnFashiMatrix(sx, -50);
        else makeEnemy('striker', sx, -50, {
          behavior: Math.random() < 0.3 ? 'track' : 'straight',
          holdTimer: rand(1, 4),
        });
    }
  }

  // 非对称编队：一列混编沿对角线从一个上角斜插入场
  function spawnDiagonalRaid() {
    const fromLeft = Math.random() < 0.5;
    const n = 6;
    const stepX = fromLeft ? 62 : -62;
    const startX = fromLeft ? 60 : CANVAS_W - 60;
    for (let k = 0; k < n; k++) {
      const x = startX + k * stepX;
      const y = -40 - k * 40;                          // 阶梯式滞后 → 斜线
      if (k === 3) {
        makeEnemy('gunship', x, y - 20, { hoverY: rand(110, 155), holdTimer: 30 });
      } else if (k % 2 === 0) {   // k=0/2/4 → 1类（三个一组，满足≥3）
        spawnSideUnit(x, y, { vx: fromLeft ? 24 : -24, vy: rand(90, 111) }, pickSideSpawn(), rand(0.8, 1.5));   // 基值 ×0.6，另乘 SIDE_SPEED_MUL
      } else {
        if (rollFashiA1()) spawnFashiA1(x, y);
        else if (rollPopian()) spawnPopian(x, y);
        else if (rollFashiMatrix()) spawnFashiMatrix(x, y);
        else makeEnemy('striker', x, y, { behavior: Math.random() < 0.25 ? 'track' : 'straight', holdTimer: rand(1, 4) });
      }
    }
  }

  // 1类长队：单侧数艘排成一列斜插入场（波次中间小概率穿插，代替部分零散生成）
  function spawnSideColumn() {
    const fromLeft = Math.random() < 0.5;
    const count = 4 + Math.floor(Math.random() * 4);   // 数艘：4~7
    const gap = 54;                                    // 队列间距（沿行进反方向排开）
    const dirX = fromLeft ? 1 : -1;
    const vx = dirX * rand(90, 120);                   // 与常规 1类同速（基值 ×0.6，另乘 SIDE_SPEED_MUL）
    const vy = rand(54, 84);
    const edgeX = fromLeft ? -36 : CANVAS_W + 36;      // 屏幕侧外入场
    const startY = rand(CANVAS_H * 0.35, CANVAS_H * 0.45);  // 入场高度：场地中部略偏上（两侧窜出）
    for (let k = 0; k < count; k++) {
      const r = Math.random();
      const behavior = pickSideSpawn();
      // 排成长队：队尾依次靠外、靠上，形成一列斜线
      const x = edgeX - dirX * k * gap;
      const y = startY - k * gap * 0.5;
      spawnSideUnit(x, y, { vx, vy }, behavior, rand(0.8, 1.6));
    }
  }

  // BOSS 战期间定时强制的 1类波次（小组 / 长队各 50%，全难度）——不走压力系统，场上存怪不影响刷新；
  // 本波敌人标记 minionDrop：击杀不加分、不掉水晶（增生侧翼艇分裂的卫护飞船随标记传播同样无奖励）；
  // 道具掉率 ×0.3 照常（结算见 06-enemy rollItemDrops）
  function spawnBossMinionWave() {
    const n0 = enemies.length;
    (Math.random() < 0.5 ? spawnSideGroup : spawnSideColumn)();
    for (let k = n0; k < enemies.length; k++) enemies[k].minionDrop = true;
  }

  // BOSS 击败后的固定首波：一群 1类排成长队从左或从右入场、横穿战场自另一侧离场；
  // 本波不出现紫电（kamikaze）1类（白影/增生/黄芒/赤月按权重混入）
  function spawnPostBossWave() {
    const fromLeft = Math.random() < 0.5;
    const count = 5 + Math.floor(Math.random() * 3);   // 5~7：长队
    const gap = 54;                                    // 队列间距（沿行进反方向排开）
    const dirX = fromLeft ? 1 : -1;
    const vx = dirX * rand(90, 120);                   // 与常规 1类同速（基值 ×0.6，另乘 SIDE_SPEED_MUL）
    const vy = rand(54, 84);
    const edgeX = fromLeft ? -36 : CANVAS_W + 36;      // 屏幕侧外入场
    const startY = rand(CANVAS_H * 0.35, CANVAS_H * 0.45);  // 入场高度：场地中部略偏上
    for (let k = 0; k < count; k++) {
      const behavior = pickSideSpawn(['kamikaze']);   // 固定首波无紫电
      // 排成长队：队尾依次靠外、靠上，形成一列斜线
      const x = edgeX - dirX * k * gap;
      const y = startY - k * gap * 0.5;
      spawnSideUnit(x, y, { vx, vy }, behavior, rand(0.8, 1.6));
      enemies[enemies.length - 1].postBossWave = true;   // 标记 BOSS 后固定首波：水晶必掉 + 掉量翻倍
    }
  }

  // 波次调度：全部编队进 WAVE_FORMATIONS 权重表，按关卡加权随机抽取；Lv3 起概率组合波
  // spawnWave 给本波敌人打上波次标记，主循环据此判断“上一波机动兵力已清场”才放下一波
  // ---------- 场面压力刷新：计算与决策 ----------
  // 场上压力权重和（BOSS 不计入；威龙血量 <60% 记 0，不再拖慢刷新）
  function fieldPressureW() {
    let w = 0;
    for (const e of enemies) {
      if (e.type === 'boss') continue;
      if (e.type === 'weilong' && e.hp < e.maxHp * WEILONG.lowHpRatio) continue;
      w += PRESSURE_W[e.type] || 0;
    }
    return w;
  }

  // 压力阈值：Lv10 以下 20%；Lv10→Lv20 线性升至 30%（Lv20+ 封顶）
  function spawnPressureThreshold() {
    if (levelFlow.level < 10) return 0.20;
    return Math.min(0.30, 0.20 + (levelFlow.level - 10) * 0.01);
  }

  // 4类主力舰强制刷新上限（同上，节奏更慢）；随难度刷怪间隔倍率同步放大（真我 ×1.3 / 具象 ×2.3）
  function capitalMaxWait() {
    const sim = diffMods().spawnIntervalMul != null ? diffMods().spawnIntervalMul : 1;
    return Math.max(10, 34 - (levelFlow.level - 3) * 1.5) * sim;  // Lv3 34s → Lv10 23.5s → Lv16 14.5s
  }

  // 特殊3类随波生成概率：每波独立判定（特殊3类无单独生成逻辑，随常规波次登场）
  const SPECIAL3_WAVE_CHANCE = 0.25;
  // 同屏同种限 1 的特殊3类（仅限这三种；其余特殊3类不限）
  const SPECIAL3_SAME_TYPE_LIMIT = new Set(['hanshuang', 'yu4', 'anvil']);

  // 特殊3类权重表：随波生成抽取 与「数值与机制图鉴」共用（改数值只需改这里）
  // wLow = Lv11 以下权重，wHigh = Lv11 起权重；0 = 该阶段不出场
  // 普通炮艇三色为独立条目：抽取直接决定涂装（紫80 / 赤100 / 金80，Lv11 起各 20）
  const SPECIAL3_POOL = [
    { name: '紫晶炮艇',     ency: 'gunship_violet',  type: 'gunship',  fn: () => spawnGunship('violet'),  wLow: 80,  wHigh: 20 },
    { name: '赤红炮艇',     ency: 'gunship_crimson', type: 'gunship',  fn: () => spawnGunship('crimson'), wLow: 100, wHigh: 20 },
    { name: '金曜炮艇',     ency: 'gunship_amber',   type: 'gunship',  fn: () => spawnGunship('amber'),   wLow: 80,  wHigh: 20 },
    { name: '炮火先兆者',   ency: 'harbinger',      type: 'harbinger', fn: spawnHarbinger, wLow: 30, wHigh: 30 },
    { name: '寒霜',         ency: 'hanshuang',      type: 'hanshuang', fn: spawnHanshuang, wLow: 0,  wHigh: 30 },
    { name: '威龙',         ency: 'weilong',        type: 'weilong',   fn: spawnWeilong,   wLow: 0,  wHigh: 15 },
    { name: '御4',          ency: 'yu4',            type: 'yu4',       fn: spawnYu4,       wLow: 0,  wHigh: 20 },
    { name: '铁砧',         ency: 'anvil',          type: 'anvil',     fn: spawnAnvil,     wLow: 0,  wHigh: 15 },
    { name: '暴鸰',         ency: 'baoling',        type: 'baoling',   fn: spawnBaoling,   wLow: 0,  wHigh: 20 },
    { name: '焦香螺旋桨',   ency: 'jiaoxiang',      type: 'jiaoxiang', fn: spawnJiaoxiang, wLow: 0,  wHigh: 15 },
    { name: '法术大师A2',   ency: 'fashiA2',        type: 'fashiA2',   fn: spawnFashiA2,   wLow: 0,  wHigh: 30 },
  ];

  // 特殊3类随波抽取：按阶段权重（Lv11 前：三色炮艇 260（紫80/赤100/金80）/ 先兆者 30；
  // Lv11 起：炮艇 60（各 20）/ 先兆者 30 / 寒霜 30 / 御4 20 / 法术大师A2 30 / 暴鸰 20 / 威龙 15 / 焦香螺旋桨 15 / 铁砧 15）。
  // 抽中 寒霜 / 御4 / 铁砧 时，若场上已有同种机体则本次跳过（同屏同种限 1）
  function spawnWaveSpecial3() {
    const hiLv = levelFlow.level >= 11;
    const pool = SPECIAL3_POOL
      .map(it => ({ it, w: hiLv ? it.wHigh : it.wLow }))
      .filter(x => x.w > 0);
    let total = 0;
    for (const x of pool) total += x.w;
    let r = Math.random() * total;
    for (const x of pool) {
      r -= x.w;
      if (r <= 0) {
        if (SPECIAL3_SAME_TYPE_LIMIT.has(x.it.type) && enemies.some(e => e.type === x.it.type)) return;
        x.it.fn();
        return;
      }
    }
  }

  function spawnWave() {
    levelFlow.waveSeq++;
    const before = enemies.length;
    spawnWaveBody();
    for (let i = before; i < enemies.length; i++) enemies[i].waveTag = levelFlow.waveSeq;
  }

  // 编队权重表：每波按权重随机抽取编队（与「数值与机制图鉴-怪物权重」单一数据源同步）
  //   w1 / w10 = Lv1 / Lv10 权重（Lv1~10 线性过渡）；wHigh = Lv11~20 恒定权重；0 = 该等级不出现
  // slotGunship 仅标记"含炮艇编队"：组合波追加位排除（避免同波两支炮艇编队），无其他特殊规则
  const WAVE_FORMATIONS = [
    { fn: spawnSideGroup,          w1: 10, w10: 5,  wHigh: 20 },                            // 1类小组 3~5 架
    { fn: spawnStrikerGroup,       w1: 30, w10: 20, wHigh: 5  },                            // 2类小组 2 架
    { fn: spawnSideColumn,         w1: 5,  w10: 20, wHigh: 10 },                            // 1类长队 4~7 架
    { fn: spawnMirrorRow,          w1: 10, w10: 30, wHigh: 40 },                            // 回文对称横排
    { fn: spawnSideSweep,          w1: 0,  w10: 10, wHigh: 10 },                            // 双侧对称斜扫
    { fn: spawnStrikerVee,         w1: 5,  w10: 30, wHigh: 30 },                            // 2类 V 字俯冲
    { fn: spawnSideKamikazeStream, w1: 0,  w10: 5,  wHigh: 15 },                            // 紫自爆流（压迫感强）
    { fn: spawnDiagonalRaid,       w1: 10, w10: 40, wHigh: 40, slotGunship: true },         // 对角奇袭（含炮艇）
    { fn: spawnGunshipWings,       w1: 0,  w10: 30, wHigh: 40, slotGunship: true },         // 双炮艇压阵
  ];

  // 编队在等级 lv 的权重：Lv1~10 由 w1→w10 线性过渡；Lv11~20 恒定 wHigh
  function waveFormationWeight(f, lv) {
    if (lv <= 10) return f.w1 + (f.w10 - f.w1) * (lv - 1) / 9;
    return f.wHigh;
  }

  // 按权重抽编队；excludeSlot 为 true 时排除含炮艇编队（组合波追加位不用）
  function pickFormation(excludeSlot) {
    let total = 0;
    const pool = [];
    for (const f of WAVE_FORMATIONS) {
      if (excludeSlot && f.slotGunship) continue;
      const w = waveFormationWeight(f, levelFlow.level);
      if (w <= 0) continue;   // 权重 0（如 Lv1 的双侧斜扫 / 紫自爆流 / 双炮艇）不入池
      pool.push({ f, w });
      total += w;
    }
    if (!pool.length) return WAVE_FORMATIONS[0].fn;
    let r = Math.random() * total;
    for (const it of pool) {
      r -= it.w;
      if (r <= 0) return it.f;
    }
    return pool[pool.length - 1].f;
  }

  // 组合波概率：Lv5~10 由 10%→30% 线性；Lv11~20 由 10%→40% 线性；Lv5 前不触发，Lv20+ 封顶 40%
  function comboWaveChance(lv) {
    if (lv < 5) return 0;
    if (lv <= 10) return 0.10 + (lv - 5) * 0.04;
    if (lv <= 20) return 0.10 + (lv - 11) * (0.30 / 9);
    return 0.40;
  }

  function spawnWaveBody() {
    pickFormation(false).fn();
    // 组合波：Lv5 起有概率同波追加一个编队（追加位不含炮艇编队）
    if (Math.random() < comboWaveChance(levelFlow.level)) {
      pickFormation(true).fn();
    }
    // 特殊3类随波登场：每波 SPECIAL3_WAVE_CHANCE 概率附带一台，按 SPECIAL3_POOL 权重抽取（寒霜/御4/铁砧 同种限 1）
    if (Math.random() < SPECIAL3_WAVE_CHANCE) spawnWaveSpecial3();
  }

  // 3类：炮艇，上方悬停很久后才缓慢下压
  //   variant：指定涂装（随波生成按三色独立权重 80/100/80 选取，见 SPECIAL3_POOL）；缺省走 makeEnemy 内变体抽取
  //   （暴鸰不再由炮艇替换产生：仅 Lv11 起随波按 SPECIAL3_POOL 权重登场）
  function spawnGunship(variant) {
    makeEnemy('gunship', rand(110, CANVAS_W - 110), -60, {
      hoverY: rand(110, 170),
      holdTimer: 30,
      ...(variant ? { variant } : {}),
    });
  }

  // 2类突击艇替换判定：lv11 前低概率替换为法术大师A1，lv11 起较多出现
  function rollFashiA1() {
    const chance = levelFlow.level < 11 ? FASHI_A1.spawnLowLv : FASHI_A1.spawnHighLv;
    return Math.random() < chance;
  }

  // 特殊2类：法术大师A1 —— 紫光激光无人机：不停留，入场 1.2~3s 后停移射击，50% 横移再恢复下降
  function spawnFashiA1(x, y) {
    const e = makeEnemy('fashiA1', x, y, {});
    e.fa1State = 'descend';
    e.fa1T = 0;
    e.fa1FirstAt = rand(FASHI_A1.firstDelay[0], FASHI_A1.firstDelay[1]) + firstFireAdd();   // 首次攻击时刻：入场后随机 1.2~3s（每架独立随机）+ 难度加成
    e.fa1FireTimer = 0;   // 到达首攻时刻后立刻刷停移射击（不占用 fireInterval）
    e.fa1Fired = false;
    e.entryT = 0;
    e.faceAng = 0;        // 机身朝向：炮管（局部 +y）以最大角速度平滑追踪玩家
    e.vx = 0;
    e.vy = FASHI_A1.entrySpeed;   // 入场初速不变（最大速降 25%，0.5s 内快速衰减到 speed）
    e.strafeDir = 0;
    e.strafeDist = 0;
    e.strafeMoved = 0;
    return e;
  }

  // 特殊3类：法术大师A2 —— A1 强化版（速度为威龙 130%、碰撞同威龙、体型 +30%）：不停留，出场 3s 后停移射击；
  // 斜下 45° 移动可能被下一次攻击打断：照常刹停射击后放弃剩余斜移、径直下降（strafeAbort 标记本次跳过斜移判定）
  function spawnFashiA2(x, y) {
    x = x != null ? x : rand(80, CANVAS_W - 80);
    y = y != null ? y : -70;
    const e = makeEnemy('fashiA2', x, y, {});
    e.fa2State = 'descend';
    e.fa2T = 0;
    e.fa2FireTimer = 0;   // 首次攻击：下降满随机首攻延时（1.8~2.3s）后立刻刹停射击
    e.fa2FirstAt = rand(FASHI_A2.firstDelay[0], FASHI_A2.firstDelay[1]) + firstFireAdd();
    e.fa2Fired = false;
    e.entryT = 0;
    e.faceAng = 0;        // 机身朝向：炮管（局部 +y）以最大角速度平滑追踪玩家
    e.vx = 0;
    e.vy = FASHI_A2.entrySpeed;   // 入场初速不变（0.5s 内快速衰减到 speed）
    e.strafeDir = 0;
    e.strafeDist = 0;
    e.strafeMoved = 0;
    e.strafeAbort = false;
    return e;
  }

  // 2类突击艇替换判定：lv11 前极低概率替换为破片，lv11 起正常出现（权重见 PRESSURE_W.popian）
  function rollPopian() {
    const chance = levelFlow.level < 11 ? POPIAN.spawnLowLv : POPIAN.spawnHighLv;
    return Math.random() < chance;
  }

  // 特殊2类：破片 —— 三连发导弹无人机：直线飞向选定点急停锁停（除非被击毁不再移动）→
  // 索敌范围内锁定玩家位置红圈预警 0.8s → 快速三连发不可击毁导弹（8/5/5，条件性无视无敌）；20% 概率侧翼入场
  function spawnPopian(x, y) {
    const flank = Math.random() < POPIAN.flankChance;
    let sx, sy;
    if (flank) {
      const fromLeft = Math.random() < 0.5;
      sx = fromLeft ? -50 : CANVAS_W + 50;
      sy = rand(CANVAS_H * 0.08, CANVAS_H * 0.22);
    } else {
      sx = x != null ? x : rand(60, CANVAS_W - 60);
      sy = y != null ? y : -50;
    }
    const e = makeEnemy('popian', sx, sy, {});
    // 停留点：落在从上往下 30%~80% 屏高区间；nearBias 幂函数使靠近入场高度（近处）概率更高
    const t = Math.pow(Math.random(), POPIAN.nearBias);
    const ty = CANVAS_H * (POPIAN.stopTopY + (POPIAN.stopBotY - POPIAN.stopTopY) * t);
    // 水平落点：以入场 x 为中心随机横移（幅度受 moveMax 约束），且不落在两侧 15% 边缘区（stopMarginX 夹取）
    const tx = clamp(sx + rand(-1, 1) * POPIAN.moveMax * 0.5,
      CANVAS_W * POPIAN.stopMarginX, CANVAS_W * (1 - POPIAN.stopMarginX));
    e.tpX = tx;
    e.tpY = ty;
    e.arrived = false;
    e.entryT = 0;
    e.faceAng = 0;
    e.detectR = CANVAS_H * POPIAN.detectBase;
    e.vx = 0; e.vy = 0;
    e.warn = null;
    e.popBurst = null;
    e.popBurstTimer = 0;
    e.atkT = POPIAN.firstDelay + firstFireAdd();
    return e;
  }

  // 2类突击艇替换判定：lv11 前不出现（spawnLowLv=0），lv11 起以 spawnHighLv 概率替换（权重见 PRESSURE_W.fashiMatrix）
  function rollFashiMatrix() {
    const chance = levelFlow.level < 11 ? FASHI_MATRIX.spawnLowLv : FASHI_MATRIX.spawnHighLv;
    return Math.random() < chance;
  }

  // 特殊2类：法术矩阵 —— 白红菱形法师无人机：入场下降（初速 2.3× 快速衰减）到 20%~40% 屏高目标区 →
  // OU 相干随机游走「胡乱移动」（不脱离战场）→ 18s 后加速向下离场；移动期间朝玩家左右 ±15° 发射发光正方体
  // （独立 spellCubes 弹道，见 updateSpellCubes）；受主战机伤害 -30%；法术阵列在场时偏移角/速度增强
  function spawnFashiMatrix(x, y, o) {
    o = o || {};
    const e = makeEnemy('fashiMatrix', x != null ? x : rand(110, CANVAS_W - 110), y != null ? y : -60, {
      hoverY: o.hoverY != null ? o.hoverY : rand(CANVAS_H * FASHI_MATRIX.hoverTopPct, CANVAS_H * FASHI_MATRIX.hoverBotPct),
      holdTimer: o.holdTimer != null ? o.holdTimer : FASHI_MATRIX.dwell,   // 胡乱移动持续时长（挑战模式传 1e9 永驻）
      fireTimer: FASHI_MATRIX.firstDelay,   // 就位后首攻延迟（覆盖注册表 fireInterval[1e9,1e9] 天文默认）
    });
    // 独立移动状态机（见 updateEnemyMovement 的 fashiMatrix 分支）：0=入场下降 1=胡乱移动 2=离场
    e.mxPhase = 0;
    e.entryT = 0;
    e.wanderT = 0;
    e.wanderX = 0; e.wanderY = 0;             // OU 相干随机游走漂移向量
    e.vx = 0; e.vy = FASHI_MATRIX.entrySpeed; // 入场初速 2×（随后在 entryDecay 内快速衰减到 speed）
    // 机体本体自旋（菱形绕中心旋转）：方向随机、转速「有的慢有的一般」
    e.rot = Math.random() * Math.PI * 2;
    e.bodySpin = (Math.random() < 0.5 ? -1 : 1) * rand(FASHI_MATRIX.bodySpinMin, FASHI_MATRIX.bodySpinMax);
    return e;
  }

  // 特殊3类：暴鸰 —— 自爆无人机：不悬停、以炮艇 40% 速度径直下压；登场 0.8s 后进入玩家距离内即
  // 停车锁定（玩家位置浮现红色预警区）→ 炸弹向下脱离（火星四溅）→ 1s 后极速加速冲向预警区中心爆炸（仅伤玩家）；
  // 投弹后以炮艇 110% 速度继续俯冲离场；被击毁时若炸弹尚未投出 → 原地爆炸（敌我通杀）
  function spawnBaoling(x) {
    return makeEnemy('baoling', x != null ? x : rand(110, CANVAS_W - 110), -60, {});
  }
  
  // 特殊3类：炮火先兆者（后排炮兵）—— 缓慢就位于更高处，充能召唤导弹，约 18s（最多 4 发）后以进场速度前开走
  function spawnHarbinger(x, opts) {
    const o = opts || {};
    makeEnemy('harbinger', x != null ? x : rand(120, CANVAS_W - 120), -50, {
      hoverY: o.hoverY != null ? o.hoverY : rand(75, 110),
      holdTimer: HARBINGER.hold,
      staticX: o.staticX || false,
    });
  }

  // 特殊4类：法术阵列 —— 血红三菱法师母机：匀速下降（整体速度 = 先兆者基准 ×0.65），下降到屏幕上方 20%~30% 后
  // 像法术矩阵一样胡乱移动（不脱离屏幕）并散发血红雾气，朝玩家发射大号红色正方体（飞行途中分裂为 3 枚常规正方体），
  // 每 4s 闪动红光并在周围召唤一个法术矩阵（召唤体无奖励），30s 后下移离场（状态机见 updateEnemyMovement 的 fashiArray 分支）
  function spawnFashiArray() {
    const e = makeEnemy('fashiArray', rand(120, CANVAS_W - 120), -60, {
      hoverY: rand(CANVAS_H * FASHI_ARRAY.hoverTopPct, CANVAS_H * FASHI_ARRAY.hoverBotPct),
      holdTimer: FASHI_ARRAY.hold,
      fireTimer: rand(FASHI_ARRAY.firstDelay[0], FASHI_ARRAY.firstDelay[1]),   // 就位后首攻延迟（随机 0~1s，覆盖注册表天文默认）
    });
    e.wanderT = 0;     // 胡乱移动计时（OU 相干随机游走，同法术矩阵）
    e.wanderX = 0; e.wanderY = 0;
    e.auraT = 0;       // 血红雾气渐显计时（到达悬停位置后开始）
    e.mistI = 1;       // 黑雾强度：入场时即为 1，到位后 ~1.5s 内逐渐消散，退场时再起（见 updateEnemies / drawFashiArrayBody）
    e.summonTimer = FASHI_ARRAY.summonFirst;      // 首次召唤倒计时（4s；后续每 5s，见 updateEnemyFire）
    e.summonFlash = 0; // 召唤红光闪动剩余时长
    return e;
  }

  // 4类槽位出场：Lv5 起 4类才会出现（由 14-main 的槽位通道门控）；Lv11 起有 slotChance 概率出场法术阵列（其余为主力舰）
  function spawnCapitalSlot() {
    if (levelFlow.level >= 11 && Math.random() < FASHI_ARRAY.slotChance) spawnFashiArray();
    else spawnCapital();
  }

  // 4类：主力舰，居中悬停很久，出场即带 1/2 类护航
  function spawnCapital() {
    makeEnemy('capital', CANVAS_W / 2, -110, {
      hoverY: 140,
      holdTimer: 35,
      fireTimer: 1.8,
      escortTimer: 5,
    });
    // 出场护航：两侧 1 类 + 2 类各一组
    spawnSideGroup();
    spawnStrikerGroup();
    shake(6, 0.4);
  }

  // 威龙蛇形巡航路径（航点序列）：从偏左/偏右半场出场，方向镜像
  // 左半场出场(mirror=false)：下降到先兆者高度 → 右靠边 → 下移一段 → 左靠边 → 下移一段 → 走到右侧距墙 1/3 处 → 停顿 2s → 向下离场
  // 右半场出场(mirror=true)：方向反之（停顿点在左侧距墙 1/3 处）
  function buildWeilongPath(spawnX, mirror) {
    const W = CANVAS_W, m = WEILONG.margin, d = WEILONG.segDown, y0 = WEILONG.hoverY;
    const rightEdge = W - m, leftEdge = m;
    const firstX = mirror ? leftEdge : rightEdge;    // 先走到的边
    const secondX = mirror ? rightEdge : leftEdge;   // 再走到的另一边
    const finalX = mirror ? W / 3 : W * 2 / 3;       // 停顿点：距“出发侧对侧”墙壁 1/3 屏宽处
    return [
      { x: spawnX, y: y0 },                              // 0 下降到约炮火先兆者停留高度
      { x: firstX, y: y0 },                              // 1 横向走到靠边
      { x: firstX, y: y0 + d },                          // 2 向下前进一段
      { x: secondX, y: y0 + d },                         // 3 横向走到另一边
      { x: secondX, y: y0 + d * 2 },                     // 4 再向下前进一段
      { x: finalX, y: y0 + d * 2, dwell: WEILONG.dwell },// 5 走到 1/3 处并停顿 2s
      { x: finalX, y: CANVAS_H + 140 },                  // 6 向下开走离场
    ];
  }

  // 特殊3类：威龙 —— 从偏左/偏右半场出场，沿蛇形路径巡航（攻击时停移），血量<60%后不计入场面压力
  function spawnWeilong() {
    const mirror = Math.random() < 0.5;   // true=偏右半场出场（路径方向镜像）
    const spawnX = mirror ? rand(CANVAS_W * 0.55, CANVAS_W - 60) : rand(60, CANVAS_W * 0.45);
    const e = makeEnemy('weilong', spawnX, -60, { fireTimer: rand(1.0, 1.6) });
    e.mirror = mirror;
    e.wpIdx = 0;       // 当前航点索引
    e.dwellT = 0;      // 航点停顿倒计时
    e.attackT = 0;     // 攻击窗口（>0 时停止移动）
    e.waypoints = buildWeilongPath(spawnX, mirror);
    shake(5, 0.35);
    return e;
  }

  // 特殊3类：寒霜 —— 不攻击：50% 概率从顶部直线下移入场（初速 +100%、1s 内衰减完毕），
  // 50% 概率从左/右侧 25%~50% 屏高入场、斜向下飞向同半场落点（左翼不越中线、右翼同理）；
  // 到达场地 72%~82% 随机高度指定位置停留 20s 后向下离场（光圈半径 150 下缘几乎覆盖到战场底部）；
  // 登场 1s 后周身渐显（0.8s 渐入）较大范围冰蓝寒霜光圈：顶部入场圈内射速/移速 -35%、侧翼入场 -25%（以核心位置判定）；
  // 入场未减速阶段（距落点 ≥90px）判定箱略缩、受伤 -20%（见 06-enemy 移动 / 08-entities 伤害链）
  function spawnHanshuang() {
    const flank = Math.random() < HANSHUANG.flankChance;
    let e;
    if (flank) {
      const fromLeft = Math.random() < 0.5;
      const sy = CANVAS_H * rand(HANSHUANG.flankTopPct, HANSHUANG.flankBotPct);
      e = makeEnemy('hanshuang', fromLeft ? -60 : CANVAS_W + 60, sy, {});
      e.hsFlank = true;
      e.hsFromLeft = fromLeft;
      // 落点 X 限定在同半场（左翼 10%~42% / 右翼 58%~90%），绝不飞越中线到对侧
      e.targetX = CANVAS_W * (fromLeft
        ? rand(HANSHUANG.flankHalfMin, HANSHUANG.flankHalfMax)
        : rand(1 - HANSHUANG.flankHalfMax, 1 - HANSHUANG.flankHalfMin));
    } else {
      e = makeEnemy('hanshuang', rand(80, CANVAS_W - 80), -60, {});
      e.hsFlank = false;
      e.targetX = e.x;   // 顶部入场仅竖直下移（落点 X = 入场 X）
    }
    e.targetY = rand(CANVAS_H * 0.72, CANVAS_H * 0.82);   // 停留高度（从上往下 72%~82%，光圈几乎覆盖到底部）
    e.dwellT = HANSHUANG.dwell;   // 到位后停留倒计时
    e.auraT = 0;                  // 登场计时（超过 auraDelay 后光圈渐显）
    // 出厂虚化盾（复用 e.phase 通用虚化机制）
    const pr = Math.random();
    if (e.hsFlank) {
      // 侧翼入场：35% 概率 1.5s / 20% 概率 2s / 10% 概率 2.5s（原 5% 概率 5s 档删除、其 5% 并入 1.5s 档），其余 35% 不带盾
      if (pr < 0.35) { e.shielded = true; e.phase = 1.5; }
      else if (pr < 0.55) { e.shielded = true; e.phase = 2; }
      else if (pr < 0.65) { e.shielded = true; e.phase = 2.5; }
    } else {
      // 顶部入场：30% 概率 1.5s / 20% 概率 2s / 10% 概率 2.5s / 5% 概率 5s，其余 35% 不带盾
      if (pr < 0.30) { e.shielded = true; e.phase = 1.5; }
      else if (pr < 0.50) { e.shielded = true; e.phase = 2; }
      else if (pr < 0.60) { e.shielded = true; e.phase = 2.5; }
      else if (pr < 0.65) { e.shielded = true; e.phase = 5; }
    }
    shake(4, 0.3);
    return e;
  }

  // 寒霜光圈减速判定：玩家核心（判定点）位于任一已显现的寒霜光圈内时，冷却流速按入场方式分流（顶部 ×0.65 / 侧翼 ×0.75）
  // 炽心装甲：免疫寒霜减速
  function playerFrostSlowMul() {
    if (currentArmor.id === 'chixin') return 1;
    for (const e of enemies) {
      if (e.type !== 'hanshuang' || e.auraT < HANSHUANG.auraDelay) continue;
      if (Math.hypot(player.x - e.x, player.y + PLAYER_CFG.hitOffsetY - e.y) <= HANSHUANG.auraR)
        return e.hsFlank ? HANSHUANG.fireSlowFlank : HANSHUANG.fireSlow;
    }
    return 1;
  }

  // 寒霜光圈移动减速：玩家核心位于光圈内时按入场方式分流（顶部 ×0.65 / 侧翼 ×0.75）
  // 炽心装甲：免疫寒霜减速
  function playerFrostMoveMul() {
    if (currentArmor.id === 'chixin') return 1;
    for (const e of enemies) {
      if (e.type !== 'hanshuang' || e.auraT < HANSHUANG.auraDelay) continue;
      if (Math.hypot(player.x - e.x, player.y + PLAYER_CFG.hitOffsetY - e.y) <= HANSHUANG.auraR)
        return e.hsFlank ? HANSHUANG.moveSlowFlank : HANSHUANG.moveSlow;
    }
    return 1;
  }

  // 特殊3类：御4 —— 防御型无人机：下降到与常规 3 类炮艇一致的悬停高度停留 25s（速度为其 80%）；
  // 登场 0.5s 后展开金色六边力场（光环内敌人受到的非真实伤害 -30%），不攻击
  function spawnYu4(holdTimer) {
    const e = makeEnemy('yu4', rand(110, CANVAS_W - 110), -60, {
      hoverY: rand(110, 170),   // 与常规 3 类炮艇相同的悬停带
      holdTimer: holdTimer != null ? holdTimer : YU4.dwell,
      fireTimer: 1.2,
    });
    e.auraT = 0;   // 登场计时（超过 auraDelay 后光环渐显）
    return e;
  }

  // 铁砧：治疗无人机，悬停于炮火先兆者(75~110)前方一些（更靠下），停留 25s（同御4），0.5s 后展开正方形治疗光环
  function spawnAnvil(holdTimer) {
    const e = makeEnemy('anvil', rand(110, CANVAS_W - 110), -60, {
      hoverY: rand(120, 165),   // 炮火先兆者停留位置前方（更靠下）
      holdTimer: holdTimer != null ? holdTimer : ANVIL.dwell,
      // 铁砧不攻击：不再传 fireTimer，沿用注册表 fireInterval[1e9,1e9] 的天文默认间隔；
      // （此前误传 1.2s 导致到场后穿透 updateEnemyFire 通用段、落到 capital 默认弹幕放出 6 枚扇形弹）
    });
    e.auraT = 0;   // 登场计时（超过 auraDelay 后治疗光环渐显）
    e.healT = 0;   // 治疗节拍计时
    return e;
  }

  // 焦香螺旋桨：火焰灼烧无人机，登场后移动到场地 40% 以下位置绕大圈巡航；35% 概率从侧翼出场
  function spawnJiaoxiang() {
    // 圆心/半径逐次随机：半径 150~200、圈底 84%~94% 屏高（圈底越低，光环越接近乃至烧到屏幕最下方）；
    // 圆心 X 在屏中心附近随机（受边框余量收缩：半径越大越贴中线）；轨迹由绕圈阶段出界硬 clamp 兜底，绝不出边框
    const m = JIAOXIANG.orbitMargin;
    const R = rand(JIAOXIANG.orbitRMin, JIAOXIANG.orbitRMax);
    const bottom = CANVAS_H * rand(JIAOXIANG.orbitBottomMin, JIAOXIANG.orbitBottomMax);
    const cx = CANVAS_W / 2 + rand(-1, 1) * Math.max(0, CANVAS_W / 2 - R - m);
    const cy = clamp(bottom - R, R + m + 14, CANVAS_H - R - m);
    const flank = Math.random() < JIAOXIANG.flankChance;
    let e;
    if (flank) {
      // 侧翼出场：从左/右侧水平入场，无登场加速，光环延迟 1.2s
      const fromLeft = Math.random() < 0.5;
      const sx = fromLeft ? -60 : CANVAS_W + 60;
      e = makeEnemy('jiaoxiang', sx, cy, {});
      e.jxFlank = true;
      e.jxPhase = 0;         // 0=入场移动, 1=绕圈
      e.jxDir = fromLeft ? 1 : -1;   // 水平移动方向
      e.jxTargetX = fromLeft ? cx - R : cx + R;   // 入场目标点（圈边缘）
      e.jxTargetY = cy;
      e.jxOrbitDir = e.jxDir;   // 绕圈方向：左入场顺时针、右入场逆时针（与入场动量衔接最自然）
      e.vx = e.jxDir * JIAOXIANG.speed;   // 初始速度：水平朝内（无加速）
      e.vy = 0;
    } else {
      // 顶部出场：就位前 150% 移速加成（到位前一段距离按剩余距离衰减），光环延迟 0.8s
      const sx = rand(80, CANVAS_W - 80);
      e = makeEnemy('jiaoxiang', sx, -60, {});
      e.jxFlank = false;
      e.jxPhase = 0;
      e.jxTargetX = cx;      // 入场目标点：圈顶
      e.jxTargetY = cy - R;
      e.jxOrbitDir = Math.random() < 0.5 ? 1 : -1;   // 绕圈方向随机
      // 初始速度：朝目标点方向，带 150% 入场加成（满值起步，随后按剩余距离衰减）
      const idx = e.jxTargetX - sx, idy = e.jxTargetY - (-60);
      const il = Math.hypot(idx, idy) || 1;
      const iv = JIAOXIANG.speed * JIAOXIANG.entryBoost;
      e.vx = idx / il * iv;
      e.vy = idy / il * iv;
    }
    e.jxCx = cx;             // 本体专属绕圈圆心 X（逐次随机）
    e.jxCy = cy;             // 本体专属绕圈圆心 Y（逐次随机）
    e.jxR = R;               // 本体专属绕圈半径（逐次随机）
    e.auraT = 0;             // 登场计时（超过 auraDelay 后火焰光环渐显）
    e.jxSpinA = Math.random() * Math.PI * 2;   // 三根横杠初始角（随机）
    e.jxSpinB = Math.random() * Math.PI * 2;
    e.jxSpinC = Math.random() * Math.PI * 2;
    // 旋转方向：B/C（白圆上的两根）方向一致随机，A（直径杠）独立随机
    const bcDir = Math.random() < 0.5 ? 1 : -1;
    const aDir = Math.random() < 0.5 ? 1 : -1;
    e.jxSpdA = JIAOXIANG.spinA * aDir;
    e.jxSpdB = JIAOXIANG.spinB * bcDir;
    e.jxSpdC = JIAOXIANG.spinC * bcDir;
    e.jxJitX = 0; e.jxJitY = 0;   // 绕圈相干随机漂移初值（OU 游走状态，见 updateEnemyMovement）
    return e;
  }

  // 御4防御光环减伤判定：目标敌机中心位于任一已显现的御4光环内时，受到的非真实伤害 ×0.70（-30%）
  // （真实伤害——高能爆弹——在 useBomb 直接结算，不经过此乘区）
  function yu4AuraMul(target) {
    for (const g of enemies) {
      if (g.type !== 'yu4' || g.auraT < YU4.auraDelay) continue;
      if (Math.hypot(target.x - g.x, target.y - g.y) <= YU4.auraR)
        return 1 - YU4.dmgReduce;
    }
    return 1;
  }

  // 特殊2类：斗志昂扬 —— 升级时 4% 概率从屏幕左/右侧出现，朝对侧横穿（速度=威龙×1.5），
  // 同时沿余弦曲线小幅上下浮动；无碰撞、不攻击；击毁后触发我方攻速/弹速翻倍增益（见 killEnemy / updateDouzhiFx）
  function spawnDouzhi() {
    const fromLeft = Math.random() < 0.5;
    const dirX = fromLeft ? 1 : -1;
    const x = fromLeft ? -60 : CANVAS_W + 60;
    const y = rand(CANVAS_H * 0.22, CANVAS_H * 0.55);   // 入场高度：场地上半部
    const e = makeEnemy('douzhi', x, y, {});
    e.dirX = dirX;         // 横穿方向（左→右 或 右→左）
    e.baseY = y;           // 余弦轨迹基准高度
    e.cosPhase = Math.random() * Math.PI * 2;   // 上下浮动初相位
    return e;
  }

  // ---------- 图鉴挑战模式 ----------
  // 生成挑战目标（单个敌人）；悬停型给极大 holdTimer 使其永驻场持续攻击
  function spawnChallengeTarget() {
    const ch = state.challenge;
    const cx = CANVAS_W / 2;
    switch (ch.type) {
      case 'side':
        // 侧翼艇：缓慢斜插（基值 ×0.6，另乘 SIDE_SPEED_MUL），飞出屏幕后由 updateChallenge 重新生成
        makeEnemy('side', cx - 130, -40, { behavior: ch.behavior || 'shoot', fireTimer: 1.0 })._sideVel = { vx: 33, vy: 42 };
        break;
      case 'prolifera':
        // 增生侧翼艇：同 1类缓慢斜插（挑战模式敌方不死，不会分裂）
        makeEnemy('prolifera', cx - 130, -40, { fireTimer: 1.0 })._sideVel = { vx: 33, vy: 42 };
        break;
      case 'striker':
        makeEnemy('striker', cx, -50, { behavior: 'track', holdTimer: 1e9, variant: ch.variant });
        break;
      case 'gunship':
        makeEnemy('gunship', cx, -60, { hoverY: 140, holdTimer: 1e9, variant: ch.variant });
        break;
      case 'harbinger':
        makeEnemy('harbinger', cx, -50, { hoverY: 95, holdTimer: 1e9 });
        break;
      case 'weilong':
        spawnWeilong();   // 蛇形巡航；飞出屏幕后由 updateChallenge 重新生成
        break;
      case 'hanshuang':
        spawnHanshuang();   // 不攻击；光圈减速射速；挑战模式永驻场
        break;
      case 'yu4':
        spawnYu4(1e9);   // 不攻击；防御光环减伤；挑战模式永驻场
        break;
      case 'anvil':
        spawnAnvil(1e9);   // 不攻击；治疗光环；挑战模式永驻场
        break;
      case 'baoling':
        spawnBaoling(CANVAS_W / 2);   // 自爆突进；飞出屏幕后由 updateChallenge 重新生成
        break;
      case 'jiaoxiang':
        spawnJiaoxiang();   // 绕圈巡航 + 火焰灼烧；挑战模式永驻场
        break;
      case 'douzhi':
        spawnDouzhi();   // 横穿（余弦浮动）；飞出屏幕后由 updateChallenge 重新生成
        break;
      case 'fashiA1':
        spawnFashiA1(cx, -50);   // 下降+停移射击；飞出屏幕后由 updateChallenge 重新生成
        break;
      case 'fashiA2':
        spawnFashiA2(cx, -70);   // A1 强化版（3s 首攻）；飞出屏幕后由 updateChallenge 重新生成
        break;
      case 'popian':
        spawnPopian(cx, -50);   // 直线急停锁停后持续红圈预警三连发导弹；停稳后永驻场
        break;
      case 'fashiMatrix':
        spawnFashiMatrix(rand(60, CANVAS_W - 60), -50, { holdTimer: 1e9 });   // 随机水平位置入场（测试页可观察左/右不同发射角度下的立体面）→ 目标区胡乱移动 + 持续发射发光正方体；挑战模式永驻场
        break;
      case 'fashiArray': {
        const e = spawnFashiArray();   // 停驻发射大号正方体（飞行途中分裂）；挑战模式永驻场
        e.holdTimer = 1e9;
        break;
      }
      case 'capital':
        makeEnemy('capital', cx, -110, { hoverY: 140, holdTimer: 1e9, fireTimer: 1.8, variant: ch.variant });
        break;
    }
  }

  // 挑战模式驱动：维持单个目标在场 + 敌方无限血量
  function updateChallenge(dt) {
    const ch = state.challenge;
    if (!ch) return;
    if (ch.kind === 'boss') {
      // 复用警报演出流程生成 BOSS（与旧 BOSS 试炼一致）
      if (bossFlow.stage === 'wait') {
        if (enemies.length === 0) {
          collectAllItems(); clearEnemyBullets(); clearMissiles();
          if (ch.bossId === 'storm2') {
            // 风暴编织者：与正常流程一致（无警报）——先放暴风之眼残影轰然消散，二阶段登场动画接管
            spawnStormGhost();
            spawnBoss('storm2');
            bossFlow.stage = 'fight';
          } else {
            bossFlow.stage = 'warn'; bossFlow.warnT = 0; startAlarm();
          }
        }
      } else if (bossFlow.stage === 'warn') {
        bossFlow.warnT += dt;
        // 旧日之歌：提前 3s 生成（黑洞在警报背后形成）
        if (!enemies.some(en => en.type === 'boss') && bossFlow.warnT >= BOSS_WARN_TOTAL - BOSS_SPAWN_EARLY) {
          spawnBoss(ch.bossId);
        }
        if (bossFlow.warnT >= BOSS_WARN_TOTAL) { stopAlarm(); bossFlow.stage = 'fight'; }
      } else if (bossFlow.stage === 'fight') {
        if (!enemies.some(e => e.type === 'boss')) bossFlow.stage = 'wait';   // 意外消失则重新登场
      }
    } else if (!enemies.some(e => e.type === ch.type)) {
      spawnChallengeTarget();
    }
    // 测试模式改版：敌方真实血量（1类 4000 / 2~4类 10000，由 makeEnemy 在生成时覆盖），不再每帧回满、不再锁定 BOSS 测试血量；
    // 炮火先兆者导引导弹满一轮后重置充能循环，便于持续观察
    for (const e of enemies) {
      if (e.type === 'harbinger' && e.missilesGuided >= HARBINGER.maxMissiles) {
        e.missilesGuided = 0; e.chargeT = 0; e.chargeWave = 0; e.firedThisCycle = false;   // 导引满一轮后重置循环（回首波动画）
      }
    }
  }

  export {
    strikerVariantWeights, sideSpawnWeights, pickVariant, makeEnemy, pickSideSpawn, spawnSideUnit, spawnSideGroup,
    spawnStrikerGroup, spawnMirrorRow, spawnSideSweep, spawnSideKamikazeStream, spawnStrikerVee, spawnGunshipWings,
    spawnDiagonalRaid, spawnSideColumn, spawnPostBossWave, spawnBossMinionWave, fieldPressureW, spawnPressureThreshold,
    capitalMaxWait, SPECIAL3_POOL, spawnWave, WAVE_FORMATIONS, pickFormation,
    spawnWaveBody, spawnGunship, rollFashiA1, spawnFashiA1, spawnFashiA2,
    rollPopian, spawnPopian, rollFashiMatrix, spawnFashiMatrix, spawnBaoling, spawnHarbinger,
    spawnFashiArray, spawnCapitalSlot,
    spawnCapital, buildWeilongPath, spawnWeilong, spawnHanshuang, playerFrostSlowMul, playerFrostMoveMul,
    spawnYu4, spawnAnvil, spawnJiaoxiang, yu4AuraMul, spawnDouzhi, spawnChallengeTarget,
    updateChallenge,
  };